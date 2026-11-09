// =========================================================
// The app's shared data. Every other file reads from here.
// =========================================================

import { todayISO } from "./time.js";

export const state = {
  page: document.body.dataset.page, // "student" (index.html) or "lecturer" (lecturer.html)
  user: null,               // the signed-in Firebase user, or null
  isLecturer: false,        // true when the lecturer is signed in
  sessions: [],             // presentation days: [{ id, date, startTime, ... }]
  bookings: [],             // taken slots: [{ id, sessionId, slotIndex, start, end, studentId }]
  details: {},              // private booking details by booking id: { name, student number, title }
  loaded: { sessions: false, bookings: false },
};

// Each slot can only have one booking, so the slot itself is the booking's id.
export function bookingId(sessionId, slotIndex) {
  return sessionId + "__" + slotIndex;
}

// The booking for one slot, or undefined if the slot is open.
export function findBooking(sessionId, slotIndex) {
  const id = bookingId(sessionId, slotIndex);
  return state.bookings.find((booking) => booking.id === id);
}

// The private details (name, number, title) for a booking, or {} if we can't see them.
export function detailsFor(booking) {
  return state.details[booking.id] || {};
}

// Days that belong to the same presentation share the same name (title).
// Returns a key for grouping them, e.g. "final year project".
export function presentationKey(session) {
  const name = String(session.title || "").trim().toLowerCase();
  if (name) {
    return name;
  }
  return "day:" + session.id; // no name: the day stands on its own
}

// The signed-in student's booking for the same presentation as this day, or undefined.
export function myBookingForPresentation(session) {
  const key = presentationKey(session);
  return state.bookings.find((booking) => {
    if (!isMine(booking)) {
      return false;
    }
    const bookedDay = state.sessions.find((item) => item.id === booking.sessionId);
    return Boolean(bookedDay) && presentationKey(bookedDay) === key;
  });
}

// True if this day belongs to a group presentation.
export function isGroupPresentation(session) {
  return session.type === "group";
}

// True if another booking for the same presentation already uses this group number.
export function groupAlreadyBooked(session, groupNumber) {
  const key = presentationKey(session);
  return state.bookings.some((booking) => {
    if (Number(booking.groupNumber) !== Number(groupNumber)) {
      return false;
    }
    const bookedDay = state.sessions.find((item) => item.id === booking.sessionId);
    return Boolean(bookedDay) && presentationKey(bookedDay) === key;
  });
}

// Short description of the presentation type, e.g. "Group · max 4" or "Individual".
export function presentationTypeText(session) {
  if (isGroupPresentation(session)) {
    return "Group · max " + session.maxMembers;
  }
  return "Individual";
}

// True if the booking belongs to the signed-in student.
export function isMine(booking) {
  return Boolean(state.user && booking && booking.studentId === state.user.uid);
}

// Presentation days sorted by date and start time.
export function sortedSessions() {
  const copy = [...state.sessions];
  copy.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return copy;
}

// Presentation days from today onwards.
export function upcomingSessions() {
  const today = todayISO();
  return sortedSessions().filter((session) => session.date >= today);
}