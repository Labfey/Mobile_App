import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase, ref, onValue, set, update, get, remove } from "firebase/database";
import { 
  initializeAuth,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged
} from "firebase/auth";
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth'; 
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyCnPP-RxUItN2CJIeUpQRm8gogwSMIYRm0",
  authDomain: "jeeproute-eb9a6.firebaseapp.com",
  databaseURL: "https://jeeproute-eb9a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jeeproute-eb9a6",
  storageBucket: "jeeproute-eb9a6.firebasestorage.app",
  messagingSenderId: "392669265278",
  appId: "1:392669265278:web:50ec974143410642e8c72f",
  measurementId: "G-5K3M3W0JSK"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export { 
  app,
  db, ref, onValue, set, update, get, remove,
  auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
};