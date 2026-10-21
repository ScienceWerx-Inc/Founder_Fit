// Saves real runScoring() output through createAssessment() into the Firestore emulator, under the real rules.
// Run with: npm run test:firestore (needs Java + firebase-tools).
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, doc, getDoc, Timestamp } from "firebase/firestore";
import { createAssessment } from "../src/lib/assessments.ts";

// page.tsx can't export its scoring code (Next.js pages only export the page), so compile that region for the test.
async function loadScoring() {
  const src = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const start = src.indexOf("const CONSTANTS = {");
  const end = src.indexOf("const BAND_LABELS = {");
  assert.ok(start > 0 && end > start, "scoring region markers not found in page.tsx");
  const exportsLine = "\nexport { runScoring, sampleCandidate, PRESET_ASSETS, VERSIONS, FC_BLOCKS, SCENARIOS, CALIBRATION, CONTEXT_ITEMS };\n";
  const js = ts.transpileModule(src.slice(start, end) + exportsLine, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), "ff-scoring-")), "scoring.mjs");
  writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

let env;
let S;

// Mirrors finish() in page.tsx for a sample candidate on a given asset.
// attested: IP review ticked + buyer-access waiver (like autofill); otherwise gates are left unattested.
function scoreSample(asset, { empty = false, attested = false } = {}) {
  const s = S.sampleCandidate();
  const assessment = empty
    ? { forcedChoice: [], scenarios: [], calibration: [], latencies: [] }
    : { forcedChoice: s.forcedChoice, scenarios: s.scenarios, calibration: s.calibration, latencies: s.latencies };
  const attestations = {
    ip_conflict_reviewed: asset.scores.D9 >= 4 ? attested : undefined,
    waivers: attested && asset.scores.D7 >= 4 ? [{ gate_code: "GATE_BUYER_ACCESS", note: "Commercial co-founder identified." }] : [],
  };
  return { s, out: S.runScoring({ asset: asset.scores, assessment, adjacency: { scores: s.adjacency }, attestations }) };
}

const asAlice = () => env.authenticatedContext("alice").firestore();

before(async () => {
  S = await loadScoring();
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-founder-fit",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host, port: Number(port) },
  });
});
beforeEach(() => env.clearFirestore());
after(() => env?.cleanup());

describe("createAssessment with real scoring output", () => {
  test("raw runScoring output contains undefined values (why sanitizing is needed)", async () => {
    const { out } = scoreSample(S.PRESET_ASSETS[0]);
    const hasUndefined = (v) => v === undefined || (v && typeof v === "object" && Object.values(v).some(hasUndefined));
    assert.ok(hasUndefined(out), "expected undefined fields in scoring output");
    // addDoc throws synchronously on invalid data, so wrap it to turn the throw into a rejection.
    await assert.rejects(async () => addDoc(collection(asAlice(), "users", "alice", "assessments"), { report: out }), /undefined/i);
  });

  test("saves and reads back the sample candidate on every preset asset", async (t) => {
    assert.ok(S.PRESET_ASSETS.length > 0);
    for (const asset of S.PRESET_ASSETS) {
      for (const attested of [false, true]) {
        await t.test(`${asset.id} (${attested ? "attested" : "unattested"} gates)`, async (t) => {
          const { s, out } = scoreSample(asset, { attested });
          const db = asAlice();

          const id = await createAssessment(db, "alice", {
            candidateName: "Sample Candidate",
            assetId: asset.id,
            assetName: asset.name,
            context: s.context,
            versions: S.VERSIONS,
            output: out,
          });
          const d = (await getDoc(doc(db, "users", "alice", "assessments", id))).data();

          assert.equal(d.ownerUid, "alice");
          assert.equal(d.candidateName, "Sample Candidate");
          assert.equal(d.assetId, asset.id);
          assert.equal(d.assetName, asset.name);
          assert.equal(d.ffiScore, out.result.ffi);
          assert.equal(d.band, out.result.band);
          assert.equal(d.validityStatus, out.result.validity.status);
          assert.deepEqual(d.versions, S.VERSIONS);
          assert.deepEqual(d.context, s.context);
          assert.equal(Object.keys(d.context).length, S.CONTEXT_ITEMS.length);
          assert.deepEqual(d.report, JSON.parse(JSON.stringify(out)));
          assert.equal(d.narrative, null);
          assert.equal(d.schemaVersion, 1);
          assert.ok(d.createdAt instanceof Timestamp && d.updatedAt instanceof Timestamp);

          const bytes = Buffer.byteLength(JSON.stringify(d.report));
          assert.ok(bytes < 200 * 1024, `report is ${bytes} bytes; expected well under the 1 MiB doc limit`);
          t.diagnostic(`${asset.id}${attested ? " attested" : ""}: ffi=${out.result.ffi} band=${out.result.band} validity=${out.result.validity.status} gates=${out.result.gates.map((g) => g.code + (g.passed ? ":pass" : g.waived ? ":waived" : ":fail")).join(",")} report=${(bytes / 1024).toFixed(1)} KiB`);
        });
      }
    }
  });

  test("an assessment with no answers (void validity) still saves", async () => {
    const { out } = scoreSample(S.PRESET_ASSETS[0], { empty: true });
    const id = await createAssessment(asAlice(), "alice", {
      candidateName: "", assetId: S.PRESET_ASSETS[0].id, assetName: S.PRESET_ASSETS[0].name,
      context: {}, versions: S.VERSIONS, output: out,
    });
    assert.ok(id);
  });

  test("empty name becomes 'Anonymous Candidate' and long names are cut to 200 chars", async () => {
    const { s, out } = scoreSample(S.PRESET_ASSETS[0]);
    const db = asAlice();
    const base = { assetId: S.PRESET_ASSETS[0].id, assetName: S.PRESET_ASSETS[0].name, context: s.context, versions: S.VERSIONS, output: out };

    const anonId = await createAssessment(db, "alice", { ...base, candidateName: "   " });
    assert.equal((await getDoc(doc(db, "users", "alice", "assessments", anonId))).data().candidateName, "Anonymous Candidate");

    const longId = await createAssessment(db, "alice", { ...base, candidateName: "x".repeat(300) });
    assert.equal((await getDoc(doc(db, "users", "alice", "assessments", longId))).data().candidateName.length, 200);
  });

  test("cannot save into another user's collection", async () => {
    const { s, out } = scoreSample(S.PRESET_ASSETS[0]);
    await assertFails(createAssessment(asAlice(), "bob", {
      candidateName: "x", assetId: "sensing", assetName: "x", context: s.context, versions: S.VERSIONS, output: out,
    }));
  });
});
