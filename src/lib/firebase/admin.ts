import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Server-only. verifyIdToken needs just the project id (it checks Google's public keys), no credentials.
// On App Hosting, FIREBASE_CONFIG is injected and initializeApp() picks it up.
function adminApp() {
  return (
    getApps()[0] ??
    initializeApp(process.env.FIREBASE_CONFIG ? undefined : { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
  );
}

/** Server-side Firestore (Admin SDK, bypasses the rules; used for collections clients can't touch). */
export function adminFirestore() {
  return getFirestore(adminApp());
}

export function verifyFirebaseIdToken(idToken: string) {
  return getAuth(adminApp()).verifyIdToken(idToken);
}

/**
 * Health check for /api/health: one read of an empty collection, which proves Firestore is
 * reachable with the server's credentials (Application Default Credentials on App Hosting).
 */
export function pingFirestore() {
  return adminFirestore().collection("_health").limit(1).get();
}
