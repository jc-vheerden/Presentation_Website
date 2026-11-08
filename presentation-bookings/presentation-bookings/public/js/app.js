// =========================================================
// Starting point of the app. Used by both pages:
//   index.html    – students book slots
//   lecturer.html – the lecturer opens days and sees who booked
// It connects to Firebase, watches who is signed in, listens for
// data changes and redraws the page.
// =========================================================

import {
  isConfigured,
  startFirebase,
  watchSignIn,
  listenToCollection,
  listenToMyDetails,
  isLecturerAccount,
  studentNumberOf,
} from "./firebase.js";
import { state, findBooking, upcomingSessions } from "./state.js";
import { formatShortDate, slotsForSession } from "./time.js";
import { $, setStatus } from "./ui.js";
import { setupSignIn } from "./auth.js";
import { setupLecturerForm, renderLecturer } from "./lecturer.js";
import { setupBookingDialog, renderStudent } from "./student.js";

const onLecturerPage = state.page === "lecturer";

// Functions that stop the live database listeners (used when signing out).
let stopListeners = [];
let loadingTimer = null;

// ---------- Drawing the page ----------

// Redraws everything from the current state.
function render() {
  const signedIn = Boolean(state.user);

  // Sign-in screen and nav bar
  // Sign-in screen (only on the booking page) and nav bar
  if ($("signin")) {
    $("signin").classList.toggle("hidden", signedIn);
  }
  $("signout").classList.toggle("hidden", !signedIn);
  if (!signedIn) {
    $("who").textContent = "";
  } else if (state.isLecturer) {
    $("who").textContent = "Lecturer";
  } else {
    $("who").textContent = studentNumberOf(state.user);
  }

  // Only the lecturer sees the link between the two pages.
  $("other-page").classList.toggle("hidden", !state.isLecturer);

  renderStats();
  renderHeroText();

  if (!signedIn) {
    hideMainSections();
    setRolePill("Signed out", "student");
    return;
  }

  if (state.isLecturer) {
    setRolePill("Lecturer", "lecturer");
  } else {
    setRolePill("Student", "student");
  }

  if (onLecturerPage) {
    renderLecturerPage();
  } else {
    renderStudentPage();
  }
}

// Hides the main part of the page (before sign-in).
function hideMainSections() {
  if (onLecturerPage) {
    $("lecturer").classList.add("hidden");
    $("not-allowed").classList.add("hidden");
  } else {
    $("student").classList.add("hidden");
  }
}

// lecturer.html: the lecturer gets the tools, anyone else gets a "lecturer only" message.
function renderLecturerPage() {
  $("lecturer").classList.toggle("hidden", !state.isLecturer);
  $("not-allowed").classList.toggle("hidden", state.isLecturer);

  if (state.isLecturer) {
    renderLecturer();
  }
}

// index.html: the booking page.
function renderStudentPage() {
  $("student").classList.remove("hidden");
  renderStudent();
}

// Updates the small label in the nav bar.
function setRolePill(text, kind) {
  const pill = $("role-pill");
  pill.className = "pill " + kind;
  pill.textContent = text;
}

// Fills in the numbers in the brown "At a glance" band.
function renderStats() {
  const sessions = upcomingSessions();
  let totalSlots = 0;
  let bookedSlots = 0;

  for (const session of sessions) {
    for (const slot of slotsForSession(session)) {
      totalSlots = totalSlots + 1;
      if (findBooking(session.id, slot.index)) {
        bookedSlots = bookedSlots + 1;
      }
    }
  }

  $("stat-days").textContent = sessions.length;
  $("stat-booked").textContent = bookedSlots;
  $("stat-open").textContent = totalSlots - bookedSlots;

  // The little card on the arch shows the next presentation day.
  if (sessions.length > 0) {
    const next = sessions[0];
    $("hero-next").textContent = formatShortDate(next.date) + " · " + next.startTime;
  } else {
    $("hero-next").textContent = "To be announced";
  }
}

// Sets the welcome text for the page.
function renderHeroText() {
  if (onLecturerPage) {
    $("hero-title").textContent = "Set The Stage For Your Students";
    $("hero-text").textContent = "Open a presentation day, set the length of each presentation and the venue. Slots are created with a changeover in between, and students book them on the booking page.";
  } else {
    $("hero-title").textContent = "Your Work Deserves A Proper Stage";
    $("hero-text").textContent = "Pick a time slot that suits you, see exactly where to go, and walk in prepared. Each presentation has its own slot with a short changeover in between.";
  }
}

// ---------- Live data ----------

// Hides the loading message once the data has arrived from the server.
function checkLoaded() {
  if (state.loaded.sessions && state.loaded.bookings) {
    clearTimeout(loadingTimer);
    setStatus(null);
  }
  render();
}

// Shows an error if the database refuses to load something.
function showLoadError() {
  clearTimeout(loadingTimer);
  setStatus("Couldn't load the schedule. Check that the Firestore rules are published, then reload.", "bad");
}

// Starts listening for changes. Runs after sign-in.
function startListening() {
  state.loaded = { sessions: false, bookings: false };
  setStatus("Loading the schedule…", "warn");

  // Warn if loading takes longer than 10 seconds.
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    const done = state.loaded.sessions && state.loaded.bookings;
    if (!done) {
      setStatus("The schedule is taking a while to load. Check your internet connection.", "warn");
    }
  }, 10000);

  // Presentation days (everyone)
  stopListeners.push(listenToCollection(
    "sessions",
    (items, fromCache) => {
      state.sessions = items;
      if (!fromCache) {
        state.loaded.sessions = true;
      }
      checkLoaded();
    },
    showLoadError
  ));

  // Which slots are taken (everyone; no names in here)
  stopListeners.push(listenToCollection(
    "bookings",
    (items, fromCache) => {
      state.bookings = items.filter((booking) => booking.studentId);
      if (!fromCache) {
        state.loaded.bookings = true;
      }
      checkLoaded();
    },
    showLoadError
  ));

  // Names, student numbers and titles
  const saveDetails = (items) => {
    state.details = {};
    for (const item of items) {
      state.details[item.id] = item;
    }
    render();
  };

  if (state.isLecturer && onLecturerPage) {
    // The lecturer sees everyone's details.
    stopListeners.push(listenToCollection("bookingDetails", saveDetails, showLoadError));
  } else if (!state.isLecturer) {
    // A student only ever loads their own.
    stopListeners.push(listenToMyDetails(state.user.uid, saveDetails, showLoadError));
  }
}

// Stops the live listeners (when someone signs out).
function stopListening() {
  for (const stop of stopListeners) {
    stop();
  }
  stopListeners = [];
  clearTimeout(loadingTimer);
}

// ---------- Sign-in changes ----------

// Runs whenever someone signs in or out.
function handleUserChanged(user) {
  // The lecturer page has no sign-in box, so send signed-out visitors to the booking page.
  if (onLecturerPage && !user) {
    window.location.href = "index.html";
    return;
  }

  stopListening();

  state.user = user;
  state.sessions = [];
  state.bookings = [];
  state.details = {};


  // The lecturer is whoever signed in with the lecturer account (using the PIN).
  state.isLecturer = isLecturerAccount(user);

  // Someone who isn't the lecturer on the lecturer page doesn't load any data.
  const allowedHere = !onLecturerPage || state.isLecturer;

  if (user && allowedHere) {
    startListening();
  } else {
    setStatus(null);
  }

  render();
}

// ---------- Start ----------

function start() {
  // Set up the buttons and forms for this page.
setupSignIn();
  if (onLecturerPage) {
    setupLecturerForm();
  } else {
    setupBookingDialog();
  }

  // Stop here if the Firebase settings haven't been filled in yet.
  if (!isConfigured()) {
    setStatus("Firebase isn't set up yet. Paste your project's settings into js/firebase-config.js (see README.md).", "bad");
    render();
    return;
  }

  startFirebase();
  setStatus("Checking sign-in…", "warn");
  watchSignIn(handleUserChanged);
}

start();
