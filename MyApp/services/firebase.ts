import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

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


const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, onValue, set };
