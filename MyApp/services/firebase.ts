import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase, ref, onValue, set, update, get } from "firebase/database";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged
} from "firebase/auth";

const firebaseConfig = {
  // PASTE YOUR ACTUAL CONFIG KEYS HERE (The ones you copied earlier)
  apiKey: "AIzaSyCnPP-RxUItN2CJIeUpQRm8gogwSMIYRm0",
  authDomain: "jeeproute-eb9a6.firebaseapp.com",
  databaseURL: "https://jeeproute-eb9a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jeeproute-eb9a6",
  storageBucket: "jeeproute-eb9a6.firebasestorage.app",
  messagingSenderId: "392669265278",
  appId: "1:392669265278:web:50ec974143410642e8c72f",
  measurementId: "G-5K3M3W0JSK"
};

// ✅ FIX: Check if app is already initialized to prevent crashes during reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const db = getDatabase(app);
const auth = getAuth(app);

export { 
  db, ref, onValue, set, update, get,
  auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
};