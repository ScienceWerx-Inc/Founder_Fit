import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Server-only. verifyIdToken needs just the project id (it checks Google's public keys), no credentials.
// On App Hosting, FIREBASE_CONFIG is injected and initializeApp() picks it up.
function adminApp() {
  return (
    getApps()[0] ??
    initializeApp(process.env.FIREBASE_CONFIG ? undefined : { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID })
  );
}

export function verifyFirebaseIdToken(idToken: string) {
  return getAuth(adminApp()).verifyIdToken(idToken);
}
