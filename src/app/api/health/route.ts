import { pingFirestore } from "@/lib/firebase/admin";
import { createHealthHandler } from "@/lib/observability";

// Google's public keys that verifyIdToken checks sign-in tokens against (free, no credentials).
const FIREBASE_AUTH_KEYS =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

async function fetchAuthKeys() {
  const res = await fetch(FIREBASE_AUTH_KEYS, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/**
 * Public health check for the ScienceWerx uptime monitor (every 10 minutes). Gemini is left
 * out on purpose: each call costs money and the narrative already falls back when it fails.
 * The response never includes config values.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createHealthHandler({
  service: "founderfit-web",
  checks: {
    // The first Firestore call on a cold instance loads the gRPC client, so it gets more time.
    firestore: { run: pingFirestore, timeoutMs: 10_000 },
    firebase_auth: { run: fetchAuthKeys, critical: false },
  },
});
