// =========================================================
// Everything that talks to Firebase (sign-in and the Realtime Database).
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  update,
  get,
  onValue,
  query,
  orderByChild,
  equalTo,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import { firebaseConfig, LECTURER_LOGIN_EMAIL, STUDENT_EMAIL_DOMAIN } from "./firebase-config.js";

let auth = null;
let db = null;

// True once real settings (including the database address) are in firebase-config.js.
export function isConfigured() {
  const key = String(firebaseConfig.apiKey || "");
  const hasKey = key.length > 0 && !key.startsWith("PASTE");
  const hasDatabase = String(firebaseConfig.databaseURL || "").startsWith("https://");
  return hasKey && hasDatabase;
}

// Connects to your Firebase project. Call once when the page loads.
export function startFirebase() {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}

// The Realtime Database reports "PERMISSION_DENIED"; the rest of the app
// expects "permission-denied", so translate it here.
function tidyError(error) {
  const text = String((error && (error.code || error.message)) || "");
  if (text.toUpperCase().includes("PERMISSION_DENIED") || text.includes("permission-denied")) {
    return { code: "permission-denied", message: text };
  }
  return error;
}

// Runs a database write and tidies any error it throws.
async function write(promise) {
  try {
    return await promise;
  } catch (error) {
    throw tidyError(error);
  }
}

// Turns a database snapshot like { id1: {...}, id2: {...} } into [{ id: "id1", ... }, ...].
function toList(snapshot) {
  const value = snapshot.val() || {};
  return Object.entries(value).map(([id, item]) => ({ id: id, ...item }));
}

// ---------- Sign-in ----------

// Calls the callback with the user whenever someone signs in or out.
export function watchSignIn(callback) {
  return onAuthStateChanged(auth, callback);
}

// True if the text is a valid student number: ST (any case) followed by 8 digits.
export function isValidStudentNumber(text) {
  return /^st\d{8}$/i.test(String(text).trim());
}

// "st12345678" -> "ST12345678"
export function tidyStudentNumber(text) {
  return String(text).trim().toUpperCase();
}

// The student number of a signed-in student, worked out from their login email.
export function studentNumberOf(user) {
  if (!user || !user.email || !user.email.endsWith("@" + STUDENT_EMAIL_DOMAIN)) {
    return "";
  }
  return user.email.split("@")[0].toUpperCase();
}

// True if the signed-in user is the lecturer account.
export function isLecturerAccount(user) {
  return Boolean(user && user.email && user.email.toLowerCase() === LECTURER_LOGIN_EMAIL.toLowerCase());
}

// Signs a student in with only their student number.
// Behind the scenes Firebase needs an email and password, so both are made from the number.
// The first time a student signs in, their account is created automatically.
export async function signInStudent(studentNumber) {
  const number = tidyStudentNumber(studentNumber).toLowerCase();
  const email = number + "@" + STUDENT_EMAIL_DOMAIN;
  const password = "booking-" + number;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = (error && error.code) || "";
    const noAccountYet = code.includes("user-not-found") || code.includes("invalid-credential");
    if (!noAccountYet) {
      throw error;
    }
    await createUserWithEmailAndPassword(auth, email, password);
  }
}

// Signs the lecturer in. The PIN is the lecturer account's password, checked by Firebase.
export function signInLecturer(pin) {
  return signInWithEmailAndPassword(auth, LECTURER_LOGIN_EMAIL, pin);
}

// Signs whoever is signed in out.
export function signOutUser() {
  return signOut(auth);
}

// ---------- Database ----------
// The database is laid out like this:
//   sessions/<id>        presentation days
//   bookings/<id>        which slots are taken (no names)
//   bookingDetails/<id>  name, student number and title (lecturer + that student only)

// Listens to a whole list ("sessions", "bookings" or "bookingDetails").
// onData gets a list of { id, ...fields } every time anything changes.
export function listenToCollection(name, onData, onError) {
  return onValue(
    ref(db, name),
    (snapshot) => {
      onData(toList(snapshot), false);
    },
    (error) => {
      onError(tidyError(error));
    }
  );
}

// Listens only to the signed-in student's own booking details.
// (The database rules don't let students read anyone else's.)
export function listenToMyDetails(studentId, onData, onError) {
  const myDetails = query(ref(db, "bookingDetails"), orderByChild("studentId"), equalTo(studentId));
  return onValue(
    myDetails,
    (snapshot) => {
      onData(toList(snapshot), false);
    },
    (error) => {
      onError(tidyError(error));
    }
  );
}

// Saves a new presentation day.
export function createSession(session) {
  return write(push(ref(db, "sessions"), session));
}

// Changes the venue of a presentation day.
export function updateSessionVenue(sessionId, venue) {
  return write(update(ref(db, "sessions/" + sessionId), { venue: venue }));
}

// Deletes a presentation day and all of its bookings in one go.
// (Setting something to null deletes it.)
export function deleteSessionWithBookings(sessionId, bookingIds) {
  const changes = {};
  for (const id of bookingIds) {
    changes["bookings/" + id] = null;
    changes["bookingDetails/" + id] = null;
  }
  changes["sessions/" + sessionId] = null;
  return write(update(ref(db), changes));
}

// Books a slot. Returns true if it worked, false if someone else already has it.
//   slot:    when the booking is (everyone signed in can see this, so the slot shows as taken)
//   details: the student's name, number and title (only the lecturer and that student can see this)
// Both are saved together in one step. The database rules refuse the booking if the
// slot is already taken, so two students can never hold the same slot.
export async function bookSlot(bookingId, slot, details) {
  const changes = {};
  changes["bookings/" + bookingId] = slot;
  changes["bookingDetails/" + bookingId] = details;

  try {
    await update(ref(db), changes);
    return true;
  } catch (error) {
    // Was it refused because someone else already has this slot?
    const existing = await get(ref(db, "bookings/" + bookingId));
    if (existing.exists()) {
      return false;
    }
    throw tidyError(error);
  }
}

// Cancels a booking: removes the slot and the student's details together.
export function cancelBooking(bookingId) {
  const changes = {};
  changes["bookings/" + bookingId] = null;
  changes["bookingDetails/" + bookingId] = null;
  return write(update(ref(db), changes));
}