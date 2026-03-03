// ─────────────────────────────────────────────
// FIREBASE AUTH
// Handles authentication in the extension
// ─────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

// Firebase config from manifest / env
const firebaseConfig = {
  apiKey: "AIzaSyBVe-sMZEm_vGZtMc5hBu6xJZJLtQZqZqM",
  authDomain: "rewardsfindr-dev.firebaseapp.com",
  projectId: "rewardsfindr-dev",
  storageBucket: "rewardsfindr-dev.firebasestorage.app",
  messagingSenderId: "1051620863746",
  appId: "1:1051620863746:web:35aab2632b3e0e7e9b6e0a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, signInWithPopup, signOut, provider };
