// =========================================================
// The sign-in box on the booking page (index.html).
// People choose "Student" (student number) or "Lecturer" (PIN).
// =========================================================

import { $ } from "./ui.js";
import { isValidStudentNumber, signInStudent, signInLecturer, signOutUser } from "./firebase.js";

// Sets up the sign-in box and the sign-out button. Called once when the page loads.
export function setupSignIn() {
  // The sign-out button is on both pages. After signing out,
  // the lecturer page sends you back to the sign-in box by itself.
  $("signout").addEventListener("click", () => {
    signOutUser();
  });

  // The lecturer page has no sign-in box, so stop here.
  if (!$("signin")) {
    return;
  }

  $("choose-student").addEventListener("click", () => {
    showChoice("student");
  });
  $("choose-lecturer").addEventListener("click", () => {
    showChoice("lecturer");
  });

  $("student-signin-form").addEventListener("submit", handleStudentSignIn);
  $("lecturer-signin-form").addEventListener("submit", handleLecturerSignIn);
}

// Shows the student form or the lecturer form.
function showChoice(who) {
  const isStudent = who === "student";

  $("choose-student").classList.toggle("active", isStudent);
  $("choose-lecturer").classList.toggle("active", !isStudent);
  $("choose-student").setAttribute("aria-selected", String(isStudent));
  $("choose-lecturer").setAttribute("aria-selected", String(!isStudent));

  $("student-signin-form").classList.toggle("hidden", !isStudent);
  $("lecturer-signin-form").classList.toggle("hidden", isStudent);

  // Clear old messages and put the cursor in the right box.
  $("auth-error").textContent = "";
  $("pin-error").textContent = "";
  if (isStudent) {
    $("signin-number").focus();
  } else {
    $("signin-pin").focus();
  }
}

// Student signs in with their student number (e.g. ST12345678).
async function handleStudentSignIn(event) {
  event.preventDefault();

  const errorBox = $("auth-error");
  const number = $("signin-number").value.trim();
  errorBox.textContent = "";

  if (!isValidStudentNumber(number)) {
    errorBox.textContent = "Enter your student number: ST followed by 8 numbers, e.g. ST12345678.";
    return;
  }

  const button = $("signin-btn");
  button.disabled = true;

  try {
    await signInStudent(number);
  } catch (error) {
    errorBox.textContent = signInMessage(error);
  } finally {
    button.disabled = false;
  }
}

// Lecturer signs in with the PIN, then goes to the lecturer page.
async function handleLecturerSignIn(event) {
  event.preventDefault();

  const errorBox = $("pin-error");
  const pin = $("signin-pin").value;
  errorBox.textContent = "";

  if (!pin) {
    errorBox.textContent = "Enter your PIN.";
    return;
  }

  const button = $("pin-btn");
  button.disabled = true;

  try {
    await signInLecturer(pin);
    window.location.href = "lecturer.html";
  } catch (error) {
    const code = (error && error.code) || "";
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
      errorBox.textContent = "That PIN isn't right. Try again.";
    } else {
      errorBox.textContent = signInMessage(error);
    }
    button.disabled = false;
  }
}

// Turns a Firebase sign-in error into a sentence people can understand.
function signInMessage(error) {
  const code = (error && error.code) || "";

  if (code.includes("operation-not-allowed")) {
    return "Sign-in isn't switched on yet. The lecturer needs to turn on Email/Password in Firebase.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (code.includes("network-request-failed")) {
    return "Can't connect. Check your internet connection and try again.";
  }
  return "Sign-in didn't work. Try again.";
}