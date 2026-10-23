import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, setLogLevel } from "firebase/firestore";

// Each NEXT_PUBLIC_* var must be referenced literally so Next.js can inline it into the browser bundle.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length > 0) {
  throw new Error(`Firebase config is missing: ${missing.join(", ")}. Copy .env.local.example to .env.local and fill it in.`);
}

// Reuse the existing app across hot reloads instead of initializing twice.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Dev only: add ?fsdebug to the URL to print Firestore's connection/write logs in the browser console.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fsdebug")) {
  setLogLevel("debug");
}

// Optional local testing: point Firestore at the emulator (e.g. 127.0.0.1:8085). Never set this in production.
const emulatorHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
const globalForEmulator = globalThis as unknown as { __ffFirestoreEmulator?: boolean };
if (emulatorHost && process.env.NODE_ENV !== "production" && !globalForEmulator.__ffFirestoreEmulator) {
  const [host, port] = emulatorHost.split(":");
  connectFirestoreEmulator(db, host, Number(port));
  globalForEmulator.__ffFirestoreEmulator = true; // connecting twice throws after hot reloads
}
