// FounderFit's Connect summary against the Firestore emulator with the Admin SDK (as the route reads it).
// Run with: npm run test:firestore (needs Java + firebase-tools; emulators:exec sets FIRESTORE_EMULATOR_HOST).
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { founderFitSummaryLookup, latestAssessment } from "../src/lib/connect/founderfit-summary.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "run through npm run test:firestore so the emulator is used");
const app = initializeApp({ projectId: "demo-founder-fit" }, "connect-test");
const db = getFirestore(app);

const assessments = (uid) => db.collection("users").doc(uid).collection("assessments");
const doc = (ffiScore, createdAt, updatedAt = createdAt) => ({
  ownerUid: "alice",
  candidateName: "Alice",
  assetId: "a",
  assetName: "Asset",
  ffiScore,
  band: "anchor",
  validityStatus: "clean",
  versions: {},
  context: {},
  report: { result: { gaps: [], dimensions: [] } },
  narrative: null,
  schemaVersion: 1,
  createdAt: Timestamp.fromDate(new Date(createdAt)),
  updatedAt: Timestamp.fromDate(new Date(updatedAt)),
});

beforeEach(async () => {
  const snap = await assessments("alice").get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
});
after(() => deleteApp(app));

describe("latestAssessment", () => {
  test("returns the most recently created assessment, or null when there is none", async () => {
    assert.equal(await latestAssessment(db, "alice"), null);
    await assessments("alice").add(doc(50, "2026-11-01T00:00:00Z", "2026-11-25T00:00:00Z")); // older, narrative added later
    await assessments("alice").add(doc(72, "2026-11-20T00:00:00Z"));
    await assessments("bob").add(doc(99, "2026-11-24T00:00:00Z"));
    assert.equal((await latestAssessment(db, "alice")).ffiScore, 72);
  });

  test("end to end through the lookup: card from the stored doc", async () => {
    await assessments("alice").add(doc(72, "2026-11-20T00:00:00Z"));
    const lookup = founderFitSummaryLookup({
      findUserByEmail: async () => ({ uid: "alice", email: "alice@sciencewerx.org", emailVerified: true }),
      latestAssessment: (uid) => latestAssessment(db, uid),
      appUrl: "https://ff.example",
    });
    const r = await lookup("alice@sciencewerx.org");
    assert.equal(r.found, true);
    assert.equal(r.card.headline, "72 / 100 FFI · Anchor Founder");
    assert.equal(r.card.updatedAt, "2026-11-20T00:00:00.000Z");
  });
});
