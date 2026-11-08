// =========================================================
// The sign-in screens:
//   index.html    – students sign in with their student number
//   lecturer.html – the lecturer signs in with a PIN
// =========================================================

import { $ } from "./ui.js";
import { isValidStudentNumber, signInStudent, signInLecturer, signOutUser } from "./firebase.js";

// Sets up the sign-in form and the sign-out button. Called once when the page loads.
export function setupSignIn() {
  $("signout").addEventListener("click", () => {
    signOutUser();
  });

  if ($("student-signin-form")) {
    $("student-signin-form").addEventListener("submit", handleStudentSignIn);
  }

  if ($("lecturer-signin-form")) {
    $("lecturer-signin-form").addEventListener("submit", handleLecturerSignIn);
  }
}

// Student signs in with their student number (e.g. ST1234567).
async function handleStudentSignIn(event) {
  event.preventDefault();

  const errorBox = $("auth-error");
  const number = $("signin-number").value.trim();
  errorBox.textContent = "";

  if (!isValidStudentNumber(number)) {
    errorBox.textContent = "Enter your student number: ST followed by 7 numbers, e.g. ST1234567.";
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

// Lecturer signs in with the PIN.
async function handleLecturerSignIn(event) {
  event.preventDefault();

  const errorBox = $("auth-error");
  const pin = $("signin-pin").value;
  errorBox.textContent = "";

  if (!pin) {
    errorBox.textContent = "Enter your PIN.";
    return;
  }

  const button = $("signin-btn");
  button.disabled = true;

  try {
    await signInLecturer(pin);
    $("signin-pin").value = "";
  } catch (error) {
    const code = (error && error.code) || "";
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
      errorBox.textContent = "That PIN isn't right. Try again.";
    } else {
      errorBox.textContent = signInMessage(error);
    }
  } finally {
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