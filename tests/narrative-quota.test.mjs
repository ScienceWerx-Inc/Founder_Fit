// consumeNarrativeQuota() against the Firestore emulator with the Admin SDK (as the route uses it).
// Run with: npm run test:firestore (needs Java + firebase-tools; emulators:exec sets FIRESTORE_EMULATOR_HOST).
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { NARRATIVE_USAGE_COLLECTION, consumeNarrativeQuota } from "../src/lib/narrative/quota.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "run through npm run test:firestore so the emulator is used");
const app = initializeApp({ projectId: "demo-founder-fit" }, "quota-test");
const db = getFirestore(app);

async function clear() {
  const snap = await db.collection(NARRATIVE_USAGE_COLLECTION).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
beforeEach(clear);
after(() => deleteApp(app));

const noon = new Date("2026-11-25T12:00:00.000Z");

describe("consumeNarrativeQuota", () => {
  test("counts up to the limit, then refuses until the next UTC day", async () => {
    for (let i = 1; i <= 3; i++) {
      assert.deepEqual(await consumeNarrativeQuota(db, "alice", 3, noon), { allowed: true, used: i, limit: 3 });
    }
    assert.deepEqual(await consumeNarrativeQuota(db, "alice", 3, noon), { allowed: false, used: 3, limit: 3, retryAfterSeconds: 12 * 3600 });
    const doc = await db.doc(`${NARRATIVE_USAGE_COLLECTION}/alice_2026-11-25`).get();
    assert.equal(doc.get("count"), 3);
    assert.equal(doc.get("uid"), "alice");

    const tomorrow = new Date("2026-11-26T00:00:01.000Z");
    assert.equal((await consumeNarrativeQuota(db, "alice", 3, tomorrow)).allowed, true);
  });
  test("each user has their own counter", async () => {
    await consumeNarrativeQuota(db, "alice", 1, noon);
    assert.equal((await consumeNarrativeQuota(db, "alice", 1, noon)).allowed, false);
    assert.equal((await consumeNarrativeQuota(db, "bob", 1, noon)).allowed, true);
  });
  test("concurrent calls never exceed the limit (transaction)", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeNarrativeQuota(db, "carol", 4, noon)));
    assert.equal(results.filter((r) => r.allowed).length, 4);
    assert.equal((await db.doc(`${NARRATIVE_USAGE_COLLECTION}/carol_2026-11-25`).get()).get("count"), 4);
  });
});
