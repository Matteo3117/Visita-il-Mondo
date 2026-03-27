// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDbu4IyUDWHD3REIxoylaH6KN5uvZab0So",
  authDomain: "visita-il-mondo.firebaseapp.com",
  projectId: "visita-il-mondo",
  storageBucket: "visita-il-mondo.firebasestorage.app",
  messagingSenderId: "536159604392",
  appId: "1:536159604392:web:f47a58691e71fb13193c9d"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
