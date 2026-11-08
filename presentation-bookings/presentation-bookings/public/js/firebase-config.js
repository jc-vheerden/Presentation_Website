// =========================================================
// Your Firebase settings – the only JavaScript file you need to edit.
// =========================================================

// 1. Your Firebase web app settings.
export const firebaseConfig = {
  apiKey: "AIzaSyD0qd9wSGYu12Xfzfx0JdcVKh7Mdt7hWlM",
  authDomain: "presentation-bookings.firebaseapp.com",
  projectId: "presentation-bookings",
  storageBucket: "presentation-bookings.firebasestorage.app",
  messagingSenderId: "472118212495",
  appId: "1:472118212495:web:d0a59973d96e12b41b7dfa",
};

// 2. The lecturer's login account.
//    Create this user in Firebase (Authentication > Users > Add user) with
//    this email and your PIN as the password. The PIN is NOT stored in this
//    code: Firebase checks it.
export const LECTURER_LOGIN_EMAIL = "lecturer@emeris.com";

// 3. Behind the scenes each student number becomes a login like
//    st1234567@student.com
export const STUDENT_EMAIL_DOMAIN = "student.com";