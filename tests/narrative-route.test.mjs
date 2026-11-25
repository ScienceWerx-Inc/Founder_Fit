// /api/narrative handler (auth, allowlist, daily limit), /api/access, and Gemini request shape (Vertex AI and Developer API modes), with Firebase Admin and the SDK mocked (no network).
// Run with: npm test
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { MAX_BODY_BYTES, handleNarrativeRequest } from "../src/lib/narrative/handler.ts";
import { NARRATIVE_SYSTEM_PROMPT } from "../src/lib/narrative/prompt.ts";
import { verifyFirebaseIdToken } from "../src/lib/firebase/admin.ts";
import { accessPolicyFromEnv, checkAccess } from "../src/lib/access/policy.ts";
import { handleAccessRequest } from "../src/lib/access/handler.ts";
import {
  DEFAULT_NARRATIVE_DAILY_LIMIT,
  narrativeDailyLimitFromEnv,
  secondsUntilNextUtcDay,
  utcDay,
} from "../src/lib/narrative/quota.ts";

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

// Token -> decoded claims, as verifyIdToken would return them.
const TOKENS = {
  "good-token": { uid: "alice", email: "alice@sciencewerx.org", email_verified: true },
  "listed-token": { uid: "carol", email: "Carol.Guest@Gmail.com", email_verified: true },
  "outsider-token": { uid: "mallory", email: "mallory@gmail.com", email_verified: true },
  "unverified-token": { uid: "eve", email: "eve@sciencewerx.org", email_verified: false },
  "no-email-token": { uid: "anon" },
};

const PROD_POLICY = accessPolicyFromEnv({
  NODE_ENV: "production",
  FOUNDERFIT_ALLOWED_DOMAINS: "sciencewerx.org",
  FOUNDERFIT_ALLOWED_EMAILS: "carol.guest@gmail.com",
});

let deps;
beforeEach(() => {
  deps = {
    verifyIdToken: mock.fn(async (t) => {
      if (!(t in TOKENS)) throw new Error("auth/argument-error");
      return TOKENS[t];
    }),
    accessPolicy: PROD_POLICY,
    consumeQuota: mock.fn(async () => ({ allowed: true, used: 1, limit: 30 })),
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

describe("allowlist", () => {
  test("an allowed domain account gets a narrative", async () => {
    const res = await handleNarrativeRequest(request(), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(deps.consumeQuota.mock.calls[0].arguments, ["alice"]);
  });
  test("an individually allowed email gets a narrative (case-insensitive)", async () => {
    const res = await handleNarrativeRequest(request({ token: "listed-token" }), deps);
    assert.equal(res.status, 200);
  });
  test("403 for a signed-in account that isn't allowed; quota and model untouched", async () => {
    const res = await handleNarrativeRequest(request({ token: "outsider-token" }), deps);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "forbidden");
    assert.equal(body.reason, "not_allowed");
    assert.match(body.message, /isn't allowed/);
    assert.equal(deps.consumeQuota.mock.callCount(), 0);
    assert.equal(deps.generate.mock.callCount(), 0);
  });
  test("403 for an unverified email, even on an allowed domain", async () => {
    const res = await handleNarrativeRequest(request({ token: "unverified-token" }), deps);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).reason, "email_not_verified");
    assert.equal(deps.generate.mock.callCount(), 0);
  });
  test("403 for a token without an email", async () => {
    const res = await handleNarrativeRequest(request({ token: "no-email-token" }), deps);
    assert.equal(res.status, 403);
  });
  test("access is checked before the body is read (an outsider can't probe validation)", async () => {
    const res = await handleNarrativeRequest(request({ token: "outsider-token", raw: "{not json" }), deps);
    assert.equal(res.status, 403);
  });
});

describe("access policy", () => {
  const verified = (email) => ({ uid: "u", email, email_verified: true });
  test("no allowlist in production: nobody is allowed (fail closed)", () => {
    const p = accessPolicyFromEnv({ NODE_ENV: "production" });
    assert.deepEqual(checkAccess(verified("alice@sciencewerx.org"), p), { allowed: false, reason: "not_allowed" });
  });
  test("no allowlist in development: any verified account is allowed, unverified still is not", () => {
    for (const NODE_ENV of ["development", "test", undefined]) {
      const p = accessPolicyFromEnv({ NODE_ENV, FOUNDERFIT_ALLOWED_EMAILS: " , ", FOUNDERFIT_ALLOWED_DOMAINS: "" });
      assert.equal(checkAccess(verified("anyone@gmail.com"), p).allowed, true);
      assert.equal(checkAccess({ uid: "u", email: "anyone@gmail.com", email_verified: false }, p).allowed, false);
    }
  });
  test("a configured allowlist applies in development too", () => {
    const p = accessPolicyFromEnv({ NODE_ENV: "development", FOUNDERFIT_ALLOWED_DOMAINS: "sciencewerx.org" });
    assert.equal(checkAccess(verified("anyone@gmail.com"), p).allowed, false);
  });
  test("domains match exactly, case-insensitively, with or without a leading @", () => {
    const p = accessPolicyFromEnv({ NODE_ENV: "production", FOUNDERFIT_ALLOWED_DOMAINS: " @ScienceWerx.org , example.com" });
    assert.equal(checkAccess(verified("Bob@SCIENCEWERX.ORG"), p).allowed, true);
    assert.equal(checkAccess(verified("x@example.com"), p).allowed, true);
    assert.equal(checkAccess(verified("x@evil-sciencewerx.org"), p).allowed, false);
    assert.equal(checkAccess(verified("x@sub.sciencewerx.org"), p).allowed, false);
    assert.equal(checkAccess(verified("sciencewerx.org@gmail.com"), p).allowed, false);
  });
  test("email_verified must be exactly true", () => {
    const p = accessPolicyFromEnv({ NODE_ENV: "production", FOUNDERFIT_ALLOWED_DOMAINS: "sciencewerx.org" });
    assert.equal(checkAccess({ uid: "u", email: "a@sciencewerx.org", email_verified: "true" }, p).allowed, false);
    assert.equal(checkAccess({ uid: "u", email: "a@sciencewerx.org" }, p).allowed, false);
  });
});

describe("daily limit", () => {
  test("429 with Retry-After when the caller's daily limit is used up; the model isn't called", async () => {
    deps.consumeQuota = mock.fn(async () => ({ allowed: false, used: 30, limit: 30, retryAfterSeconds: 3600 }));
    const res = await handleNarrativeRequest(request(), deps);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "3600");
    const body = await res.json();
    assert.equal(body.error, "rate_limited");
    assert.equal(body.limit, 30);
    assert.match(body.message, /daily limit of 30/);
    assert.equal(deps.generate.mock.callCount(), 0);
  });
  test("invalid requests don't use up quota", async () => {
    await handleNarrativeRequest(request({ raw: "{not json" }), deps);
    await handleNarrativeRequest(request({ body: { ...validBody, audience: "investor" } }), deps);
    assert.equal(deps.consumeQuota.mock.callCount(), 0);
  });
  test("a failed generation still counts (the model was called)", async () => {
    deps.generate = mock.fn(async () => {
      throw new Error("boom");
    });
    const res = await handleNarrativeRequest(request(), deps);
    assert.equal(res.status, 502);
    assert.equal(deps.consumeQuota.mock.callCount(), 1);
  });
  test("503 when the quota store fails (fail closed), and the model isn't called", async () => {
    deps.consumeQuota = mock.fn(async () => {
      throw new Error("firestore unavailable");
    });
    const res = await handleNarrativeRequest(request(), deps);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "quota_unavailable" });
    assert.equal(deps.generate.mock.callCount(), 0);
  });
  test("development may proceed when the quota store fails", async () => {
    deps.consumeQuota = mock.fn(async () => {
      throw new Error("no credentials");
    });
    const res = await handleNarrativeRequest(request(), { ...deps, allowWhenQuotaUnavailable: true });
    assert.equal(res.status, 200);
  });
  test("FOUNDERFIT_NARRATIVE_DAILY_LIMIT parsing", (t) => {
    t.mock.method(console, "warn", () => {});
    assert.equal(narrativeDailyLimitFromEnv({}), DEFAULT_NARRATIVE_DAILY_LIMIT);
    assert.equal(narrativeDailyLimitFromEnv({ FOUNDERFIT_NARRATIVE_DAILY_LIMIT: " 5 " }), 5);
    for (const bad of ["0", "-1", "2.5", "lots"]) {
      assert.equal(narrativeDailyLimitFromEnv({ FOUNDERFIT_NARRATIVE_DAILY_LIMIT: bad }), DEFAULT_NARRATIVE_DAILY_LIMIT);
    }
  });
  test("the window is the UTC day", () => {
    const now = new Date("2026-11-25T23:59:30.000Z");
    assert.equal(utcDay(now), "2026-11-25");
    assert.equal(secondsUntilNextUtcDay(now), 30);
  });
});

describe("GET /api/access", () => {
  const get = (token) =>
    new Request("http://localhost/api/access", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  test("200 for an allowed account", async () => {
    const res = await handleAccessRequest(get("good-token"), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { allowed: true });
  });
  test("403 with a message for an account that isn't allowed", async () => {
    const res = await handleAccessRequest(get("outsider-token"), deps);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.reason, "not_allowed");
    assert.ok(body.message);
  });
  test("401 without or with a bad token", async () => {
    assert.equal((await handleAccessRequest(get(null), deps)).status, 401);
    assert.equal((await handleAccessRequest(get("forged"), deps)).status, 401);
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
  const GEMINI_ENV = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "GEMINI_MODEL", "NODE_ENV"];

  // Loads a fresh gemini.ts against a fake SDK with exactly the given env; returns what the SDK saw.
  async function loadGemini(t, env, response = { text: "Narrative text" }) {
    const constructed = [];
    const calls = [];
    class FakeGoogleGenAI {
      constructor(opts) {
        constructed.push(opts);
        this.models = { generateContent: async (req) => (calls.push(req), response) };
      }
    }
    t.mock.module("@google/genai", {
      namedExports: { GoogleGenAI: FakeGoogleGenAI, ThinkingLevel: { LOW: "LOW", MINIMAL: "MINIMAL" } },
    });
    const saved = { ...process.env };
    t.after(() => {
      process.env = saved;
    });
    for (const k of GEMINI_ENV) delete process.env[k];
    Object.assign(process.env, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "founder-fit-6a455" }, env);
    const mod = await import(`../src/lib/narrative/gemini.ts?v=${Math.random()}`);
    return { mod, constructed, calls };
  }

  function assertSafeConfig(req) {
    assert.equal(req.contents, "USER");
    assert.equal(req.config.systemInstruction, "SYSTEM");
    assert.equal(req.config.maxOutputTokens, 4096);
    assert.deepEqual(req.config.thinkingConfig, { thinkingLevel: "LOW" });
    for (const ignoredOrRejected of ["temperature", "topP", "topK", "frequencyPenalty", "presencePenalty", "candidateCount"]) {
      assert.ok(!(ignoredOrRejected in req.config), `${ignoredOrRejected} should not be sent`);
    }
  }

  test("Vertex AI mode (no GEMINI_API_KEY): enterprise, project, us-central1, default model, no API key", async (t) => {
    const { mod, constructed, calls } = await loadGemini(t, {});
    assert.equal(mod.geminiBackend(), "vertex-ai");
    assert.equal(await mod.generateWithGemini("SYSTEM", "USER"), "Narrative text");
    assert.deepEqual(constructed, [{ enterprise: true, project: "founder-fit-6a455", location: "us-central1" }]);
    assert.ok(!("apiKey" in constructed[0]));
    assert.equal(mod.DEFAULT_GEMINI_MODEL, "gemini-3.5-flash");
    assert.equal(calls[0].model, "gemini-3.5-flash");
    assertSafeConfig(calls[0]);
  });

  test("Developer API mode (GEMINI_API_KEY set in dev): apiKey only, no project/location, same request", async (t) => {
    const { mod, constructed, calls } = await loadGemini(t, { GEMINI_API_KEY: "test-key-123", NODE_ENV: "development" });
    assert.equal(mod.geminiBackend(), "developer-api");
    assert.equal(await mod.generateWithGemini("SYSTEM", "USER"), "Narrative text");
    assert.deepEqual(constructed, [{ enterprise: false, apiKey: "test-key-123" }]);
    assert.equal(calls[0].model, "gemini-3.5-flash");
    assertSafeConfig(calls[0]);
  });

  test("GEMINI_API_KEY is ignored in production: Vertex AI is used and a warning is logged", async (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const { mod, constructed } = await loadGemini(t, { GEMINI_API_KEY: "leaked-key", NODE_ENV: "production" });
    assert.equal(mod.geminiBackend(), "vertex-ai");
    await mod.generateWithGemini("SYSTEM", "USER");
    assert.deepEqual(constructed, [{ enterprise: true, project: "founder-fit-6a455", location: "us-central1" }]);
    assert.ok(!JSON.stringify(constructed).includes("leaked-key"));
    assert.equal(warn.mock.callCount(), 1);
  });

  test("an empty GEMINI_API_KEY (as in .env.local.example) means Vertex AI", async (t) => {
    const { mod, constructed } = await loadGemini(t, { GEMINI_API_KEY: "" });
    assert.equal(mod.geminiBackend(), "vertex-ai");
    await mod.generateWithGemini("SYSTEM", "USER");
    assert.equal(constructed[0].enterprise, true);
  });

  test("Vertex AI mode: model, project and location come from GEMINI_MODEL / GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION", async (t) => {
    const { mod, constructed, calls } = await loadGemini(t, { GOOGLE_CLOUD_PROJECT: "other-project", GOOGLE_CLOUD_LOCATION: "global", GEMINI_MODEL: "gemini-3.8-flash" });
    await mod.generateWithGemini("S", "U");
    assert.deepEqual(constructed[0], { enterprise: true, project: "other-project", location: "global" });
    assert.equal(calls[0].model, "gemini-3.8-flash");
  });

  test("Developer API mode: GEMINI_MODEL applies, and project/location env vars are not passed", async (t) => {
    const { mod, constructed, calls } = await loadGemini(t, { GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-3.8-flash", GOOGLE_CLOUD_PROJECT: "p", GOOGLE_CLOUD_LOCATION: "global" });
    await mod.generateWithGemini("S", "U");
    assert.deepEqual(constructed[0], { enterprise: false, apiKey: "k" });
    assert.equal(calls[0].model, "gemini-3.8-flash");
  });

  test("the client is created once and reused across calls", async (t) => {
    const { mod, constructed } = await loadGemini(t, {});
    await mod.generateWithGemini("S", "U");
    await mod.generateWithGemini("S", "U");
    assert.equal(constructed.length, 1);
  });

  test("a missing text in the Gemini response becomes an empty string (handler then returns 502)", async (t) => {
    const { mod } = await loadGemini(t, {}, { text: undefined });  // explicit undefined, not the default
    assert.equal(await mod.generateWithGemini("S", "U"), "");
  });
});

describe("GEMINI_API_KEY hygiene", () => {
  const repo = new URL("../", import.meta.url);
  const read = (p) => readFileSync(new URL(p, repo), "utf8");

  test("never exposed as NEXT_PUBLIC_ anywhere in the source", () => {
    const tracked = execFileSync("git", ["ls-files", "src", "next.config.mjs", ".env.local.example"], { cwd: repo, encoding: "utf8" }).split("\n").filter(Boolean);
    for (const f of tracked) assert.ok(!/NEXT_PUBLIC_GEMINI|NEXT_PUBLIC_GOOGLE_API_KEY/.test(read(f)), `${f} exposes a Gemini key to the browser`);
  });
  test("only read in the server-side Gemini module", () => {
    const users = execFileSync("git", ["grep", "-l", "GEMINI_API_KEY", "--", "src"], { cwd: repo, encoding: "utf8" }).split("\n").filter(Boolean);
    assert.deepEqual(users, ["src/lib/narrative/gemini.ts"]);
  });
  test(".env.local is gitignored and untracked; the example keeps the key empty", () => {
    assert.equal(execFileSync("git", ["ls-files", ".env.local"], { cwd: repo, encoding: "utf8" }).trim(), "");
    execFileSync("git", ["check-ignore", "-q", ".env.local"], { cwd: repo }); // throws if not ignored
    assert.match(read(".env.local.example"), /^GEMINI_API_KEY=$/m);
  });
  test("not configured in apphosting.yaml", (t) => {
    if (!existsSync(new URL("apphosting.yaml", repo))) return t.skip("apphosting.yaml not created yet");
    // Any env entry defining a Gemini/Google API key (as a value or a secret); comments may mention the name.
    assert.ok(!/^\s*-\s*variable:\s*(GEMINI_API_KEY|GOOGLE_API_KEY)\b/m.test(read("apphosting.yaml")));
  });
});
