// =========================================================
// Lecturer view: open presentation days and manage bookings.
// =========================================================

import { state, findBooking, sortedSessions, detailsFor } from "./state.js";
import {
  toMinutes,
  formatTime,
  formatDate,
  todayISO,
  dateFromToday,
  buildSlots,
  normaliseBreaks,
  slotsForSession,
  breaksBetween,
} from "./time.js";
import { $, el, showToast, askConfirm, askForText, friendlyError } from "./ui.js";
import { createSession, updateSessionVenue, deleteSessionWithBookings, cancelBooking } from "./firebase.js";
import { sessionInfo, groupByPresentation, presentationGroup } from "./components.js";

// ---------- The "Open a presentation day" form ----------

// Sets up the form. Called once when the page loads.
export function setupLecturerForm() {
  // Default date is tomorrow, and past dates can't be picked.
  $("form-date").value = dateFromToday(1);
  $("form-date").min = todayISO();

  // Update the slot count whenever a time changes.
  for (const id of ["form-start", "form-end", "form-duration", "form-gap"]) {
    $(id).addEventListener("input", updatePreview);
  }

  // First break added is a tea break, any after that default to lunch.
  $("add-break").addEventListener("click", () => {
    const count = document.querySelectorAll("#breaks .break-row").length;
    if (count === 0) {
      addBreakRow("Tea break", "10:30", "11:00");
    } else {
      addBreakRow("Lunch break", "12:30", "13:30");
    }
  });

  $("session-form").addEventListener("submit", handleSubmit);
  updatePreview();
}

// Adds one break row (name, start, end, remove) to the form.
let breakCounter = 0;
function addBreakRow(label, start, end) {
  breakCounter = breakCounter + 1;
  const n = breakCounter;

  const row = el("div", { class: "break-row" },
    el("input", { id: "break-name-" + n, class: "break-name", type: "text", value: label, maxlength: "40", "aria-label": "Break name" }),
    el("input", { id: "break-start-" + n, class: "break-start", type: "time", value: start, "aria-label": "Break starts" }),
    el("span", { class: "muted", text: "to" }),
    el("input", { id: "break-end-" + n, class: "break-end", type: "time", value: end, "aria-label": "Break ends" }),
    el("button", {
      type: "button",
      class: "link danger",
      "aria-label": "Remove this break",
      onclick: () => {
        row.remove();
        updatePreview();
      },
    }, "Remove")
  );

  row.addEventListener("input", updatePreview);
  $("breaks").append(row);
  updatePreview();
}

// Reads the break rows into a list like [{ label, start, end }].
function readBreaks() {
  const breaks = [];
  const rows = document.querySelectorAll("#breaks .break-row");

  for (const row of rows) {
    const label = row.querySelector(".break-name").value.trim() || "Break";
    const start = row.querySelector(".break-start").value;
    const end = row.querySelector(".break-end").value;
    if (start && end) {
      breaks.push({ label: label, start: start, end: end });
    }
  }

  return breaks;
}

// Reads every field in the form into one object.
function readForm() {
  return {
    title: $("form-title").value.trim(),
    date: $("form-date").value,
    startTime: $("form-start").value,
    endTime: $("form-end").value,
    duration: Number($("form-duration").value),
    gap: Number($("form-gap").value),
    venue: $("form-venue").value.trim(),
    notes: $("form-notes").value.trim(),
    breaks: readBreaks(),
  };
}

// Returns a message if the breaks have a problem, or "" if they're fine.
function findBreakProblem(form) {
  const dayStart = toMinutes(form.startTime);
  const dayEnd = toMinutes(form.endTime);

  for (const item of form.breaks) {
    if (toMinutes(item.end) <= toMinutes(item.start)) {
      return "The break “" + item.label + "” must end after it starts.";
    }
    if (toMinutes(item.start) < dayStart || toMinutes(item.end) > dayEnd) {
      return "The break “" + item.label + "” falls outside the day's times. Move it between " + form.startTime + " and " + form.endTime + ".";
    }
  }

  const sorted = normaliseBreaks(form.breaks);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      return "Two of your breaks overlap. Adjust their times.";
    }
  }

  return "";
}

// Shows how many slots the current settings will create.
function updatePreview() {
  const form = readForm();
  const preview = $("slot-preview");

  const problem = findBreakProblem(form);
  if (problem) {
    preview.textContent = problem;
    return;
  }

  const slots = buildSlots(form.startTime, form.endTime, form.duration, form.gap, form.breaks);
  if (slots.length === 0) {
    preview.textContent = "No slots fit in that window. Make the window longer or the presentations shorter.";
    return;
  }

  const first = slots[0];
  const last = slots[slots.length - 1];
  let text = " · " + formatTime(first.start) + "–" + formatTime(last.end);
  text = text + " · " + form.duration + " min + " + form.gap + " min between";
  if (form.breaks.length > 0) {
    text = text + " · " + form.breaks.length + (form.breaks.length === 1 ? " break" : " breaks");
  }

  const countText = slots.length + (slots.length === 1 ? " slot" : " slots");
  preview.replaceChildren(el("strong", { text: countText }), text);
}

// Checks the form. Returns an error message, or "" if everything is fine.
function validateForm(form) {
  if (!form.title) {
    return "Add the presentation name. Use the same name for every day of the same presentation.";
  }
  if (!form.date) {
    return "Choose a date.";
  }
  if (form.date < todayISO()) {
    return "That date is in the past. Choose today or a later date.";
  }
  if (!form.venue) {
    return "Add the venue so students know where to go.";
  }
  if (!(form.duration >= 5)) {
    return "Presentation length must be at least 5 minutes.";
  }
  if (!(form.gap >= 0)) {
    return "The changeover time can't be negative.";
  }

  const breakProblem = findBreakProblem(form);
  if (breakProblem) {
    return breakProblem;
  }

  const slots = buildSlots(form.startTime, form.endTime, form.duration, form.gap, form.breaks);
  if (slots.length === 0) {
    return "No slots fit between those times.";
  }

  return "";
}

// Saves the new presentation day.
async function handleSubmit(event) {
  event.preventDefault();

  const errorBox = $("form-error");
  errorBox.textContent = "";

  const form = readForm();
  const problem = validateForm(form);
  if (problem) {
    errorBox.textContent = problem;
    return;
  }

  const button = $("form-submit");
  button.disabled = true;

  try {
    await createSession({
      ...form,
      createdAt: new Date().toISOString(),
      createdBy: state.user.uid,
    });
    const slotCount = buildSlots(form.startTime, form.endTime, form.duration, form.gap, form.breaks).length;
    showToast(slotCount + " slots published for " + formatDate(form.date));
  } catch (error) {
    errorBox.textContent = friendlyError(error);
  } finally {
    button.disabled = false;
  }
}

// ---------- The list of presentation days ----------

// Draws all of the lecturer's presentations, one dropdown each, with their days inside.
export function renderLecturer() {
  // Suggest names already used, so extra days get exactly the same presentation name.
  // (Names that only differ in capitals or spaces count as the same presentation.)
  const names = new Map();
  for (const session of state.sessions) {
    const name = String(session.title || "").trim();
    if (name && !names.has(name.toLowerCase())) {
      names.set(name.toLowerCase(), name);
    }
  }
  $("presentation-names").replaceChildren(...[...names.values()].map((name) => el("option", { value: name })));

  const container = $("lecturer-sessions");
  container.replaceChildren();

  const sessions = sortedSessions();
  if (sessions.length === 0) {
    container.append(el("div", { class: "empty", text: "No presentation days yet. Use the form above to open your first one." }));
    return;
  }

  const today = todayISO();
  const groups = groupByPresentation(sessions);

  groups.forEach((group, i) => {
    // Count booked and available slots across all days of this presentation.
    let totalSlots = 0;
    let bookedSlots = 0;
    for (const session of group.sessions) {
      for (const slot of slotsForSession(session)) {
        totalSlots = totalSlots + 1;
        if (findBooking(session.id, slot.index)) {
          bookedSlots = bookedSlots + 1;
        }
      }
    }

    const dayCount = group.sessions.length;
    const summaryItems = [
      el("span", { class: "group-count", text: dayCount + (dayCount === 1 ? " day" : " days") }),
      el("span", { class: "pill lecturer", text: bookedSlots + " booked" }),
      el("span", { class: "pill student", text: (totalSlots - bookedSlots) + " available" }),
    ];

    // The first presentation starts open; the rest start closed.
    const dayCards = group.sessions.map((session) => renderSessionCard(session, today));
    container.append(presentationGroup(group, summaryItems, dayCards, i === 0));
  });
}

// One presentation day: details, buttons and the timetable.
function renderSessionCard(session, today) {
  const slots = slotsForSession(session);
  const bookedCount = slots.filter((slot) => findBooking(session.id, slot.index)).length;
  const isFull = bookedCount === slots.length;

  const card = el("article", { class: session.date < today ? "session past" : "session" });

  const actions = el("div", { class: "session-actions" },
    el("button", { type: "button", onclick: () => copySchedule(session) }, "Copy schedule"),
    el("button", { type: "button", onclick: () => changeVenue(session) }, "Change venue"),
    el("button", { type: "button", class: "danger", onclick: () => deleteDay(session) }, "Delete day")
  );

  const side = el("div", { class: "session-side" },
    el("span", { class: isFull ? "pill student" : "pill lecturer", text: bookedCount + " of " + slots.length + " booked" }),
    actions
  );

  card.append(el("div", { class: "session-head" }, sessionInfo(session, slots), side));
  card.append(renderTimetable(session, slots));
  return card;
}

// The table of slots, with breaks and changeovers in between.
function renderTimetable(session, slots) {
  const body = el("tbody");

  slots.forEach((slot, i) => {
    const booking = findBooking(session.id, slot.index);
    body.append(renderSlotRow(slot, booking));

    // Nothing comes after the last slot.
    const isLast = i === slots.length - 1;
    if (isLast) {
      return;
    }

    const nextSlot = slots[i + 1];
    const breaks = breaksBetween(session, slot.end, nextSlot.start);

    if (breaks.length > 0) {
      for (const item of breaks) {
        body.append(el("tr", { class: "break" },
          el("td", { class: "tnum", text: formatTime(item.start) + "–" + formatTime(item.end) }),
          el("td", { colspan: "2", text: item.label })
        ));
      }
    } else if (Number(session.gap) > 0) {
      const changeoverEnd = slot.end + Number(session.gap);
      body.append(el("tr", { class: "changeover" },
        el("td", { colspan: "3", class: "tnum", text: formatTime(slot.end) + "–" + formatTime(changeoverEnd) + " · changeover" })
      ));
    }
  });

  const head = el("thead", {}, el("tr", {},
    el("th", { text: "Time" }),
    el("th", { text: "Student" }),
    el("th", {})
  ));

  return el("div", { class: "table-wrap" }, el("table", {}, head, body));
}

// One row of the timetable: who booked this slot, if anyone.
function renderSlotRow(slot, booking) {
  const timeCell = el("td", { class: "tnum", text: formatTime(slot.start) + "–" + formatTime(slot.end) });

  if (!booking) {
    return el("tr", {}, timeCell, el("td", {}, el("span", { class: "muted", text: "Open" })), el("td", {}));
  }

  const info = detailsFor(booking);
  const studentCell = el("td", {},
    el("b", { text: info.studentName || "Loading…" }),
    el("div", { class: "small muted tnum", text: info.studentNumber || "" })
  );
  const actionCell = el("td", { class: "actions" },
    el("button", { type: "button", class: "link danger", onclick: () => removeBooking(booking) }, "Remove")
  );

  return el("tr", {}, timeCell, studentCell, actionCell);
}

// ---------- Lecturer actions ----------

// Removes a student's booking so the slot opens again.
async function removeBooking(booking) {
  const when = formatTime(booking.start) + "–" + formatTime(booking.end);
  const confirmed = await askConfirm(
    "Remove " + (detailsFor(booking).studentName || "this student") + "?",
    "Their booking for " + when + " will be cancelled and the slot opens again.",
    "Remove booking"
  );
  if (!confirmed) {
    return;
  }

  try {
    await cancelBooking(booking.id);
    showToast("Booking removed");
  } catch (error) {
    showToast(friendlyError(error));
  }
}

// Changes where a presentation day takes place.
async function changeVenue(session) {
  const venue = await askForText("Change venue", "New venue for " + formatDate(session.date), session.venue, "Save venue");
  if (!venue || venue === session.venue) {
    return;
  }

  try {
    await updateSessionVenue(session.id, venue);
    showToast("Venue updated");
  } catch (error) {
    showToast(friendlyError(error));
  }
}

// Deletes a presentation day and cancels its bookings.
async function deleteDay(session) {
  const bookingIds = state.bookings
    .filter((booking) => booking.sessionId === session.id)
    .map((booking) => booking.id);

  let message = "No one has booked yet. Students will no longer see this day.";
  if (bookingIds.length > 0) {
    const plural = bookingIds.length === 1 ? "" : "s";
    message = "This removes the day and cancels " + bookingIds.length + " student booking" + plural + ". Students will no longer see it.";
  }

  const confirmed = await askConfirm("Delete " + formatDate(session.date) + "?", message, "Delete day");
  if (!confirmed) {
    return;
  }

  try {
    await deleteSessionWithBookings(session.id, bookingIds);
    showToast("Presentation day deleted");
  } catch (error) {
    showToast(friendlyError(error));
  }
}

// Copies the day's timetable as plain text, ready to paste into an email.
async function copySchedule(session) {
  const lines = [];
  lines.push(formatDate(session.date) + (session.title ? " – " + session.title : ""));
  lines.push("Venue: " + (session.venue || "TBC"));
  lines.push("");

  const slots = slotsForSession(session);
  slots.forEach((slot, i) => {
    // Add any break that comes before this slot.
    if (i > 0) {
      for (const item of breaksBetween(session, slots[i - 1].end, slot.start)) {
        lines.push(formatTime(item.start) + "–" + formatTime(item.end) + "  " + item.label.toUpperCase());
      }
    }

    const booking = findBooking(session.id, slot.index);
    let who = "Open";
    if (booking) {
      const info = detailsFor(booking);
      who = (info.studentName || "Unnamed") + " (" + (info.studentNumber || "no number") + ")";
    }
    lines.push(formatTime(slot.start) + "–" + formatTime(slot.end) + "  " + who);
  });

  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    showToast("Schedule copied");
  } catch (error) {
    showToast("Couldn't copy. Your browser blocked clipboard access.");
  }
}