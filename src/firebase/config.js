import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDKwMsOOgYo-WsHTWESW-3GUkAGdKsCOBQ",
  authDomain: "umovil-4f1ed.firebaseapp.com",
  projectId: "umovil-4f1ed",
  storageBucket: "umovil-4f1ed.firebasestorage.app",
  messagingSenderId: "691939611989",
  appId: "1:691939611989:web:6cf0383f911774ca198bdc",
  measurementId: "G-L9041V55WH"
};

// 1. Inicializar la App evitando duplicados en Expo
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// 2. Inicializar Auth de forma robusta con Persistencia Nativa
let auth;
if (getApps().length === 0) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} else {
  auth = getAuth(app);
}

// 3. Inicializar Firestore
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, 
});

export { app, auth, db };