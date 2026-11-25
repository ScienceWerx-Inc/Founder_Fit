import type { Firestore } from "firebase-admin/firestore";

// Per-user daily cap on /api/narrative so even an allowed account can't run up unbounded model cost.
// Counters live in Firestore (Admin SDK only; firestore.rules deny this collection to clients),
// one doc per user per UTC day, so the cap holds across server instances.

export const NARRATIVE_USAGE_COLLECTION = "narrativeUsage";
export const DEFAULT_NARRATIVE_DAILY_LIMIT = 30;

export type QuotaResult =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; used: number; limit: number; retryAfterSeconds: number };

/** FOUNDERFIT_NARRATIVE_DAILY_LIMIT: a positive integer; anything else falls back to the default. */
export function narrativeDailyLimitFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.FOUNDERFIT_NARRATIVE_DAILY_LIMIT ?? "").trim();
  if (!raw) return DEFAULT_NARRATIVE_DAILY_LIMIT;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  console.warn(`Ignoring invalid FOUNDERFIT_NARRATIVE_DAILY_LIMIT; using ${DEFAULT_NARRATIVE_DAILY_LIMIT}.`);
  return DEFAULT_NARRATIVE_DAILY_LIMIT;
}

export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

export function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * Atomically counts one narrative call for `uid` today, unless the limit is already reached.
 * `expireAt` lets a Firestore TTL policy on narrativeUsage clean up old counters (optional).
 */
export async function consumeNarrativeQuota(db: Firestore, uid: string, limit: number, now = new Date()): Promise<QuotaResult> {
  const day = utcDay(now);
  const ref = db.collection(NARRATIVE_USAGE_COLLECTION).doc(`${uid}_${day}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? Number(snap.get("count")) || 0 : 0;
    if (used >= limit) return { allowed: false, used, limit, retryAfterSeconds: secondsUntilNextUtcDay(now) };
    tx.set(ref, {
      uid,
      day,
      count: used + 1,
      updatedAt: now,
      expireAt: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
    });
    return { allowed: true, used: used + 1, limit };
  });
}
