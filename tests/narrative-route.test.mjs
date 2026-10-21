// /api/narrative handler and Gemini request shape, with Firebase Admin and Vertex AI mocked (no network).
// Run with: npm test
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { MAX_BODY_BYTES, handleNarrativeRequest } from "../src/lib/narrative/handler.ts";
import { NARRATIVE_SYSTEM_PROMPT } from "../src/lib/narrative/prompt.ts";
import { verifyFirebaseIdToken } from "../src/lib/firebase/admin.ts";

const validBody = {
  audience: "decision_maker",
  candidateName: "Sample Candidate",
  asset_context: { name: "Distributed Methane-Leak Sensing Platform", top_demands: [{ code: "C2", weight: 9 }] },
  result: { ffi: 67, band: "anchor_with_complement", validity: { status: "clean" }, gaps: [] },
};

function request({ token = "good-token", body = validBody, raw, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  if (token !== null) h.Authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/narrative", { method: "POST", headers: h, body: raw ?? JSON.stringify(body) });
}

let deps;
beforeEach(() => {
  deps = {
    verifyIdToken: mock.fn(async (t) => {
      if (t !== "good-token") throw new Error("auth/argument-error");
      return { uid: "alice" };
    }),
    generate: mock.fn(async () => "  Executive Summary\nThe candidate ...  "),
  };
  mock.method(console, "error", () => {});
});
afterEach(() => mock.restoreAll());

describe("auth", () => {
  test("401 without an Authorization header, and nothing else runs", async () => {
    const res = await handleNarrativeRequest(request({ token: null }), deps);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthorized" });
    assert.equal(deps.verifyIdToken.mock.callCount(), 0);
    assert.equal(deps.generate.mock.callCount(), 0);
  });
  test("401 with a non-Bearer Authorization header", async () => {
    const res = await handleNarrativeRequest(request({ token: null, headers: { Authorization: "Token abc" } }), deps);
    assert.equal(res.status, 401);
  });
  test("401 with a bad token, and Gemini is never called", async () => {
    const res = await handleNarrativeRequest(request({ token: "forged" }), deps);
    assert.equal(res.status, 401);
    assert.equal(deps.verifyIdToken.mock.callCount(), 1);
    assert.equal(deps.generate.mock.callCount(), 0);
  });
  test("the real Firebase Admin verifier rejects a malformed token (no network needed)", async () => {
    await assert.rejects(verifyFirebaseIdToken("not-a-real-jwt"));
    const res = await handleNarrativeRequest(request({ token: "not-a-real-jwt" }), { ...deps, verifyIdToken: verifyFirebaseIdToken });
    assert.equal(res.status, 401);
    assert.equal(deps.generate.mock.callCount(), 0);
  });
});

describe("request validation", () => {
  test(`413 when the body is larger than ${MAX_BODY_BYTES / 1024} KB`, async () => {
    const big = { ...validBody, result: { ...validBody.result, padding: "x".repeat(MAX_BODY_BYTES) } };
    const res = await handleNarrativeRequest(request({ body: big }), deps);
    assert.equal(res.status, 413);
    assert.equal(deps.generate.mock.callCount(), 0);
  });
  test("413 when Content-Length declares an oversized body", async () => {
    const res = await handleNarrativeRequest(request({ headers: { "Content-Length": String(MAX_BODY_BYTES + 1) } }), deps);
    assert.equal(res.status, 413);
  });
  test("a body just under the limit is accepted", async () => {
    const base = JSON.stringify({ ...validBody, result: { ...validBody.result, padding: "" } });
    const fill = MAX_BODY_BYTES - Buffer.byteLength(base);
    const res = await handleNarrativeRequest(request({ body: { ...validBody, result: { ...validBody.result, padding: "x".repeat(fill) } } }), deps);
    assert.equal(res.status, 200);
  });
  test("400 for invalid JSON", async () => {
    const res = await handleNarrativeRequest(request({ raw: "{not json" }), deps);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_json" });
  });
  for (const [label, body] of [
    ["unknown audience", { ...validBody, audience: "investor" }],
    ["missing result", { ...validBody, result: undefined }],
    ["result is an array", { ...validBody, result: [] }],
    ["candidateName not a string", { ...validBody, candidateName: 42 }],
    ["body is an array", [validBody]],
  ]) {
    test(`400 for ${label}`, async () => {
      const res = await handleNarrativeRequest(request({ body }), deps);
      assert.equal(res.status, 400);
      assert.equal(deps.generate.mock.callCount(), 0);
    });
  }
});

describe("generation", () => {
  test("success returns the trimmed narrative built from the server-side prompt", async () => {
    const res = await handleNarrativeRequest(request(), deps);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { narrative: "Executive Summary\nThe candidate ..." });

    const [systemPrompt, userPrompt] = deps.generate.mock.calls[0].arguments;
    assert.equal(systemPrompt, NARRATIVE_SYSTEM_PROMPT);
    assert.match(userPrompt, /AUDIENCE: decision_maker/);
    assert.match(userPrompt, /CANDIDATE NAME: Sample Candidate/);
    assert.ok(userPrompt.includes(JSON.stringify(validBody.result, null, 2)));
    assert.ok(userPrompt.includes(JSON.stringify(validBody.asset_context, null, 2)));
  });
  test("long candidate names are cut to 200 characters in the prompt", async () => {
    await handleNarrativeRequest(request({ body: { ...validBody, candidateName: "y".repeat(500) } }), deps);
    const userPrompt = deps.generate.mock.calls[0].arguments[1];
    assert.ok(userPrompt.includes(`CANDIDATE NAME: ${"y".repeat(200)}\n`));
  });
  test("a Gemini failure returns 502 without leaking the error (client shows the fallback)", async () => {
    deps.generate = mock.fn(async () => {
      throw new Error("7 PERMISSION_DENIED: aiplatform.endpoints.predict on projects/founder-fit-6a455");
    });
    const res = await handleNarrativeRequest(request(), deps);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.deepEqual(body, { error: "narrative_unavailable" });
    assert.ok(!JSON.stringify(body).includes("PERMISSION_DENIED"));
    assert.equal(console.error.mock.callCount(), 1);
  });
  test("an empty Gemini response returns 502", async () => {
    deps.generate = mock.fn(async () => "   ");
    const res = await handleNarrativeRequest(request(), deps);
    assert.equal(res.status, 502);
  });
});

describe("Gemini request (SDK mocked)", () => {
  test("uses Vertex AI (enterprise), the configured project/location/model, and Gemini 3.x-safe config", async (t) => {
    const constructed = [];
    const calls = [];
    class FakeGoogleGenAI {
      constructor(opts) {
        constructed.push(opts);
        this.models = {
          generateContent: async (req) => {
            calls.push(req);
            return { text: "Narrative text" };
          },
        };
      }
    }
    t.mock.module("@google/genai", {
      namedExports: { GoogleGenAI: FakeGoogleGenAI, ThinkingLevel: { LOW: "LOW", MINIMAL: "MINIMAL" } },
    });
    const saved = { ...process.env };
    t.after(() => {
      process.env = saved;
    });
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_LOCATION;
    delete process.env.GEMINI_MODEL;
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "founder-fit-6a455";

    const { generateWithGemini, DEFAULT_GEMINI_MODEL } = await import(`../src/lib/narrative/gemini.ts?v=${Date.now()}`);
    const text = await generateWithGemini("SYSTEM", "USER");

    assert.equal(text, "Narrative text");
    assert.deepEqual(constructed, [{ enterprise: true, project: "founder-fit-6a455", location: "us-central1" }]);
    assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.5-flash");
    const req = calls[0];
    assert.equal(req.model, "gemini-3.5-flash");
    assert.equal(req.contents, "USER");
    assert.equal(req.config.systemInstruction, "SYSTEM");
    assert.equal(req.config.maxOutputTokens, 4096);
    assert.deepEqual(req.config.thinkingConfig, { thinkingLevel: "LOW" });
    for (const ignoredOrRejected of ["temperature", "topP", "topK", "frequencyPenalty", "presencePenalty", "candidateCount"]) {
      assert.ok(!(ignoredOrRejected in req.config), `${ignoredOrRejected} should not be sent`);
    }
  });

  test("model and location come from GEMINI_MODEL / GOOGLE_CLOUD_LOCATION when set", async (t) => {
    const constructed = [];
    const calls = [];
    class FakeGoogleGenAI {
      constructor(opts) {
        constructed.push(opts);
        this.models = { generateContent: async (req) => (calls.push(req), { text: "ok" }) };
      }
    }
    t.mock.module("@google/genai", { namedExports: { GoogleGenAI: FakeGoogleGenAI, ThinkingLevel: { LOW: "LOW" } } });
    const saved = { ...process.env };
    t.after(() => {
      process.env = saved;
    });
    Object.assign(process.env, { GOOGLE_CLOUD_PROJECT: "other-project", GOOGLE_CLOUD_LOCATION: "global", GEMINI_MODEL: "gemini-3.8-flash" });

    const { generateWithGemini } = await import(`../src/lib/narrative/gemini.ts?v=${Date.now()}-env`);
    await generateWithGemini("S", "U");
    assert.deepEqual(constructed[0], { enterprise: true, project: "other-project", location: "global" });
    assert.equal(calls[0].model, "gemini-3.8-flash");
  });

  test("a missing text in the Gemini response becomes an empty string (handler then returns 502)", async (t) => {
    class FakeGoogleGenAI {
      constructor() {
        this.models = { generateContent: async () => ({ text: undefined }) };
      }
    }
    t.mock.module("@google/genai", { namedExports: { GoogleGenAI: FakeGoogleGenAI, ThinkingLevel: { LOW: "LOW" } } });
    const { generateWithGemini } = await import(`../src/lib/narrative/gemini.ts?v=${Date.now()}-empty`);
    assert.equal(await generateWithGemini("S", "U"), "");
  });
});
