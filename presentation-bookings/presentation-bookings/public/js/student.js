// =========================================================
// Student view: see open slots, book one per presentation, cancel your booking.
// =========================================================

import { state, findBooking, isMine, upcomingSessions, bookingId, myBookingForPresentation } from "./state.js";
import { formatTime, formatDate, slotsForSession, breaksBetween } from "./time.js";
import { $, el, showToast, askConfirm, friendlyError } from "./ui.js";
import { bookSlot, cancelBooking, studentNumberOf } from "./firebase.js";
import { sessionInfo, groupByPresentation, presentationGroup } from "./components.js";

// The slot the student clicked, kept while the booking pop-up is open.
let selected = null;

// Sets up the booking pop-up. Called once when the page loads.
export function setupBookingDialog() {
  $("book-cancel").addEventListener("click", () => {
    $("book-dialog").close();
  });
  $("book-form").addEventListener("submit", handleBooking);
}

// Draws the student's own bookings and all the open presentations.
export function renderStudent() {
  renderMyBookings();
  renderPresentations();
}

// ---------- "Your booking" panel ----------

function renderMyBookings() {
  const container = $("my-bookings");
  container.replaceChildren();

  // Find this student's bookings and the day each one belongs to.
  const mine = [];
  for (const booking of state.bookings) {
    if (!isMine(booking)) {
      continue;
    }
    const session = state.sessions.find((item) => item.id === booking.sessionId);
    if (session) {
      mine.push({ booking: booking, session: session });
    }
  }

  mine.sort((a, b) => (a.session.date + a.booking.start).localeCompare(b.session.date + b.booking.start));
  $("my-panel").classList.toggle("hidden", mine.length === 0);

  for (const { booking, session } of mine) {
    const when = formatDate(session.date) + ", " + formatTime(booking.start) + "–" + formatTime(booking.end);
    const where = "Venue: " + (session.venue || "TBC");

    container.append(el("div", { class: "my-booking" },
      el("div", {},
        el("div", { class: "eyebrow", text: session.title || "Presentation" }),
        el("div", { class: "my-booking-when tnum", text: when }),
        el("div", { class: "small", text: where })
      ),
      el("button", { type: "button", class: "danger", onclick: () => cancelMyBooking(booking, session) }, "Cancel booking")
    ));
  }
}

// ---------- Presentations (one dropdown each) ----------

function renderPresentations() {
  const container = $("student-sessions");
  container.replaceChildren();

  const sessions = upcomingSessions();
  if (sessions.length === 0) {
    container.append(el("div", { class: "empty", text: "No presentation days are open yet. Check back once your lecturer has published a date." }));
    return;
  }

  for (const group of groupByPresentation(sessions)) {
    // Count the open slots across all days of this presentation.
    let openSlots = 0;
    for (const session of group.sessions) {
      for (const slot of slotsForSession(session)) {
        if (!findBooking(session.id, slot.index)) {
          openSlots = openSlots + 1;
        }
      }
    }

    // What shows next to the presentation name.
    const myBooking = myBookingForPresentation(group.sessions[0]);
    let summaryItems;
    if (myBooking) {
      summaryItems = [el("span", { class: "pill lecturer", text: "Booked ✓" })];
    } else if (openSlots > 0) {
      summaryItems = [el("span", { class: "pill student", text: openSlots + (openSlots === 1 ? " slot available" : " slots available") })];
    } else {
      summaryItems = [el("span", { class: "pill warn", text: "Fully booked" })];
    }

    // Presentations the student still needs to book start open.
    const dayCards = group.sessions.map((session) => renderDayCard(session));
    container.append(presentationGroup(group, summaryItems, dayCards, !myBooking));
  }
}

// One presentation day with its grid of slots.
function renderDayCard(session) {
  const slots = slotsForSession(session);
  const openCount = slots.filter((slot) => !findBooking(session.id, slot.index)).length;

  // Students may only hold one slot per presentation (across all of its days).
  const myBooking = myBookingForPresentation(session);
  const alreadyBooked = Boolean(myBooking);
  const bookedOnAnotherDay = alreadyBooked && myBooking.sessionId !== session.id;

  let pill;
  if (bookedOnAnotherDay) {
    pill = el("span", { class: "pill student", text: "You're booked on another day" });
  } else if (openCount > 0) {
    pill = el("span", { class: "pill student", text: openCount + " open" });
  } else {
    pill = el("span", { class: "pill warn", text: "Fully booked" });
  }

  const grid = el("div", { class: "slots" });

  slots.forEach((slot, i) => {
    // Show any break that comes before this slot.
    if (i > 0) {
      for (const item of breaksBetween(session, slots[i - 1].end, slot.start)) {
        grid.append(el("div", { class: "slot break" },
          el("span", { class: "slot-time", text: formatTime(item.start) + "–" + formatTime(item.end) }),
          el("span", { class: "slot-label", text: item.label })
        ));
      }
    }
    grid.append(renderSlot(session, slot, alreadyBooked));
  });

  const card = el("article", { class: "session" });
  card.append(el("div", { class: "session-head" }, sessionInfo(session, slots), pill));
  card.append(grid);
  return card;
}

// One slot: yours, taken by someone else, or open to book.
function renderSlot(session, slot, alreadyBooked) {
  const booking = findBooking(session.id, slot.index);
  const time = formatTime(slot.start) + "–" + formatTime(slot.end);

  if (booking && isMine(booking)) {
    return el("div", { class: "slot mine" },
      el("span", { class: "slot-time", text: time }),
      el("span", { class: "slot-label", text: "Your slot" })
    );
  }

  if (booking) {
    return el("div", { class: "slot taken", "aria-label": time + " booked" },
      el("span", { class: "slot-time", text: time }),
      el("span", { class: "slot-label", text: "Booked" })
    );
  }

  return el("button", {
    type: "button",
    class: "slot open",
    disabled: alreadyBooked,
    title: alreadyBooked ? "You already have a slot for this presentation. Cancel it first to choose another." : "",
    onclick: () => openBookingDialog(session, slot),
  },
    el("span", { class: "slot-time", text: time }),
    el("span", { class: "slot-label", text: alreadyBooked ? "Open" : "Book this slot" })
  );
}

// ---------- Booking ----------

// Opens the pop-up for the chosen slot. The presentation name is filled in for them.
function openBookingDialog(session, slot) {
  selected = { session: session, slot: slot };

  $("book-presentation").textContent = session.title || "Untitled presentation";
  $("book-summary").textContent = formatDate(session.date) + ", " + formatTime(slot.start) + "–" + formatTime(slot.end)
    + " · " + (session.venue || "Venue TBC") + " · Student number: " + studentNumberOf(state.user);
  $("book-error").textContent = "";

  // Remember the student's name on this device so they don't retype it.
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("presentation-bookings-student") || "{}");
  } catch (error) {
    saved = {};
  }

  if (!$("book-name").value) {
    $("book-name").value = saved.name || "";
  }

  $("book-dialog").showModal();
  $("book-name").focus();
}

// Saves the booking when the student presses "Confirm booking".
async function handleBooking(event) {
  event.preventDefault();
  if (!selected) {
    return;
  }

  const errorBox = $("book-error");
  errorBox.textContent = "";

  const { session, slot } = selected;
  const name = $("book-name").value.trim();
  const number = studentNumberOf(state.user); // from sign-in, so it can't be mistyped
  const presentation = session.title || "";   // from the lecturer's day, so it can't be mistyped

  if (!name) {
    errorBox.textContent = "Enter your full name.";
    return;
  }
  if (!number) {
    errorBox.textContent = "Sign in with your student number to book.";
    return;
  }
  if (myBookingForPresentation(session)) {
    errorBox.textContent = "You already have a slot for this presentation. Cancel it first to choose another.";
    return;
  }

  const button = $("book-confirm");
  button.disabled = true;

  try {
    // What everyone can see: which slot is taken (no names).
    const slotInfo = {
      sessionId: session.id,
      slotIndex: slot.index,
      start: slot.start,
      end: slot.end,
      date: session.date,
      studentId: state.user.uid,
      bookedAt: new Date().toISOString(),
    };

    // What only the lecturer (and this student) can see.
    const details = {
      sessionId: session.id,
      studentId: state.user.uid,
      studentName: name,
      studentNumber: number,
      topic: presentation,
    };

    const booked = await bookSlot(bookingId(session.id, slot.index), slotInfo, details);

    if (!booked) {
      errorBox.textContent = "Sorry, this slot was just taken. Pick another one.";
      return;
    }

    try {
      localStorage.setItem("presentation-bookings-student", JSON.stringify({ name: name }));
    } catch (error) {
      // Saving on the device is optional, so ignore errors here.
    }

    $("book-dialog").close();
    showToast("Booked: " + (presentation || "presentation") + ", " + formatDate(session.date) + " at " + formatTime(slot.start));
  } catch (error) {
    errorBox.textContent = friendlyError(error);
  } finally {
    button.disabled = false;
  }
}

// Cancels the student's own booking.
async function cancelMyBooking(booking, session) {
  const when = formatDate(session.date) + ", " + formatTime(booking.start) + "–" + formatTime(booking.end);
  const confirmed = await askConfirm("Cancel your booking?", "Your slot on " + when + " will open for other students.", "Cancel booking");
  if (!confirmed) {
    return;
  }

  try {
    await cancelBooking(booking.id);
    showToast("Booking cancelled");
  } catch (error) {
    showToast(friendlyError(error));
  }
}