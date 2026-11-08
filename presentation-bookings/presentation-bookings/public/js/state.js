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
