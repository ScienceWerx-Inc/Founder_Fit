// Firestore security rules tests. Run with: npm run test:firestore (needs Java + firebase-tools).
import { after, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

let env;

// Same shape as the save in page.tsx finish().
function validAssessment(uid, overrides = {}) {
  return {
    ownerUid: uid,
    candidateName: "Sample Candidate",
    assetId: "sensing",
    assetName: "Distributed Methane-Leak Sensing Platform",
    ffiScore: 72,
    band: "anchor_with_complement",
    validityStatus: "clean",
    versions: { content_version: "v1.0.0", algo_version: "1.0.0", norms_version: "provisional-1" },
    context: { K1: "8-15", K2: "Industry R&D", K10: "1-3 years" },
    report: { result: { ffi: 72, gaps: [{ dimension: "C2", routes: ["coach"] }] }, vdp: { weights: { P1: 4.2 } } },
    narrative: null,
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

const assessments = (db, uid) => collection(db, "users", uid, "assessments");
const alice = () => env.authenticatedContext("alice").firestore();
const bob = () => env.authenticatedContext("bob").firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seedAliceDoc() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/alice/assessments/a1"), validAssessment("alice"));
  });
}

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-founder-fit",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host, port: Number(port) },
  });
});
beforeEach(() => env.clearFirestore());
after(() => env?.cleanup());

describe("create", () => {
  test("owner can create with exactly the expected fields", async () => {
    await assertSucceeds(addDoc(assessments(alice(), "alice"), validAssessment("alice")));
  });
  test("extra field is rejected (hasOnly)", async () => {
    await assertFails(addDoc(assessments(alice(), "alice"), validAssessment("alice", { isAdmin: true })));
  });
  test("missing field is rejected (hasAll)", async () => {
    const { narrative, ...missing } = validAssessment("alice");
    await assertFails(addDoc(assessments(alice(), "alice"), missing));
  });
  test("context with a key outside K1-K10 is rejected", async () => {
    await assertFails(addDoc(assessments(alice(), "alice"), validAssessment("alice", { context: { K1: "0-3", K99: "x" } })));
  });
  test("cannot create under another user's path", async () => {
    await assertFails(addDoc(assessments(alice(), "bob"), validAssessment("bob")));
  });
  test("ownerUid must match the path uid", async () => {
    await assertFails(addDoc(assessments(alice(), "alice"), validAssessment("bob")));
  });
  test("unauthenticated create is rejected", async () => {
    await assertFails(addDoc(assessments(anon(), "alice"), validAssessment("alice")));
  });
  test("non-integer ffiScore is rejected", async () => {
    await assertFails(addDoc(assessments(alice(), "alice"), validAssessment("alice", { ffiScore: 72.5 })));
  });
  test("ffiScore above 100 is rejected", async () => {
    await assertFails(addDoc(assessments(alice(), "alice"), validAssessment("alice", { ffiScore: 101 })));
  });
  test("unknown band is rejected", async () => {
    await assertFails(addDoc(assessments(alice(), "alice"), validAssessment("alice", { band: "superstar" })));
  });
  test("client-supplied createdAt is rejected", async () => {
    await assertFails(addDoc(assessments(alice(), "alice"), validAssessment("alice", { createdAt: new Date("2020-01-01") })));
  });
  test("narrative must be null on create", async () => {
    await assertFails(addDoc(assessments(alice(), "alice"), validAssessment("alice", { narrative: "pre-written" })));
  });
});

describe("read", () => {
  beforeEach(seedAliceDoc);
  test("owner can read and list own assessments", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice/assessments/a1")));
    await assertSucceeds(getDocs(assessments(alice(), "alice")));
  });
  test("another user cannot read", async () => {
    await assertFails(getDoc(doc(bob(), "users/alice/assessments/a1")));
    await assertFails(getDocs(assessments(bob(), "alice")));
  });
  test("unauthenticated cannot read", async () => {
    await assertFails(getDoc(doc(anon(), "users/alice/assessments/a1")));
  });
});

describe("update", () => {
  beforeEach(seedAliceDoc);
  test("owner can set the narrative", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "users/alice/assessments/a1"), { narrative: "Executive Summary ...", updatedAt: serverTimestamp() }));
  });
  test("owner cannot change ffiScore", async () => {
    await assertFails(updateDoc(doc(alice(), "users/alice/assessments/a1"), { ffiScore: 100, updatedAt: serverTimestamp() }));
  });
  test("owner cannot add a new field", async () => {
    await assertFails(updateDoc(doc(alice(), "users/alice/assessments/a1"), { narrative: "x", flagged: true, updatedAt: serverTimestamp() }));
  });
  test("another user cannot set the narrative", async () => {
    await assertFails(updateDoc(doc(bob(), "users/alice/assessments/a1"), { narrative: "x", updatedAt: serverTimestamp() }));
  });
});

describe("delete and other paths", () => {
  beforeEach(seedAliceDoc);
  test("owner can delete", async () => {
    await assertSucceeds(deleteDoc(doc(alice(), "users/alice/assessments/a1")));
  });
  test("another user cannot delete", async () => {
    await assertFails(deleteDoc(doc(bob(), "users/alice/assessments/a1")));
  });
  test("everything outside users/{uid}/assessments is closed", async () => {
    await assertFails(getDoc(doc(alice(), "users/alice")));
    await assertFails(setDoc(doc(alice(), "anything/x"), { a: 1 }));
  });
});
