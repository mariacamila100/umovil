import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDKwMsOOgYo-WsHTWESW-3GUkAGdKsCOBQ",
  authDomain: "umovil-4f1ed.firebaseapp.com",
  projectId: "umovil-4f1ed",
  storageBucket: "umovil-4f1ed.firebasestorage.app",
  messagingSenderId: "691939611989",
  appId: "1:691939611989:web:6cf0383f911774ca198bdc",
  measurementId: "G-L9041V55WH"
};

// 1. Inicializar la App de Firebase
const app = initializeApp(firebaseConfig);

// 2. Inicializar los servicios que sí usa tu Login
const auth = getAuth(app);
const db = getFirestore(app);

// 3. ¡SÚPER IMPORTANTE! Exportar los servicios para que LoginScreen los pueda leer
export { auth, db };