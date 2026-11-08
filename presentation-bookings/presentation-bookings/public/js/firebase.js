// =========================================================
// Everything that talks to Firebase (sign-in and the database).
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
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig, LECTURER_LOGIN_EMAIL, STUDENT_EMAIL_DOMAIN } from "./firebase-config.js";

let auth = null;
let db = null;

// True once real settings have been pasted into firebase-config.js.
export function isConfigured() {
  const key = String(firebaseConfig.apiKey || "");
  return key.length > 0 && !key.startsWith("PASTE");
}

// Connects to your Firebase project. Call once when the page loads.
export function startFirebase() {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

// ---------- Sign-in ----------

// Calls the callback with the user whenever someone signs in or out.
export function watchSignIn(callback) {
  return onAuthStateChanged(auth, callback);
}

// True if the text is a valid student number: ST (any case) followed by 7 digits.
export function isValidStudentNumber(text) {
  return /^st\d{8}$/i.test(String(text).trim());
}

// "st1234567" -> "ST1234567"
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

// Listens to a whole collection ("sessions" or "bookings").
// onData gets a list of { id, ...fields } every time anything changes.
export function listenToCollection(name, onData, onError) {
  return onSnapshot(
    collection(db, name),
    (snapshot) => {
      const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(items, snapshot.metadata.fromCache);
    },
    onError
  );
}

// Listens only to the signed-in student's own booking details.
// (The database rules don't let students read anyone else's.)
export function listenToMyDetails(studentId, onData, onError) {
  const myDetails = query(collection(db, "bookingDetails"), where("studentId", "==", studentId));
  return onSnapshot(
    myDetails,
    (snapshot) => {
      const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(items, snapshot.metadata.fromCache);
    },
    onError
  );
}

// Saves a new presentation day.
export function createSession(session) {
  return addDoc(collection(db, "sessions"), session);
}

// Changes the venue of a presentation day.
export function updateSessionVenue(sessionId, venue) {
  return updateDoc(doc(db, "sessions", sessionId), { venue: venue });
}

// Deletes a presentation day and all of its bookings in one go.
export function deleteSessionWithBookings(sessionId, bookingIds) {
  const batch = writeBatch(db);
  for (const id of bookingIds) {
    batch.delete(doc(db, "bookings", id));
    batch.delete(doc(db, "bookingDetails", id));
  }
  batch.delete(doc(db, "sessions", sessionId));
  return batch.commit();
}

// Books a slot. Returns true if it worked, false if someone else already has it.
//   slot:    when the booking is (everyone signed in can see this, so the slot shows as taken)
//   details: the student's name, number and title (only the lecturer and that student can see this)
// A transaction saves both together and makes sure two students can't take the same slot at once.
export async function bookSlot(bookingId, slot, details) {
  const slotReference = doc(db, "bookings", bookingId);
  const detailsReference = doc(db, "bookingDetails", bookingId);

  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(slotReference);
    if (existing.exists()) {
      return false;
    }
    transaction.set(slotReference, slot);
    transaction.set(detailsReference, details);
    return true;
  });
}

// Cancels a booking: removes the slot and the student's details together.
export function cancelBooking(bookingId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "bookings", bookingId));
  batch.delete(doc(db, "bookingDetails", bookingId));
  return batch.commit();
}
