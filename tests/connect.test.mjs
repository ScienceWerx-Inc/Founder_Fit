// ScienceWerx Connect: env parsing, caller verification, the FounderFit summary provider, and the
// /api/connect/peers consumer, with Firebase and peers faked (no network).
// Run with: npm test
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEFAULT_FOUNDERFIT_PUBLIC_URL,
  connectKeyFromEnv,
  founderFitPublicUrl,
  parseConnectCallers,
  parseConnectPeers,
} from "../src/lib/connect/env.ts";
import { parseSubject, subjectHash, verifyConnectCaller } from "../src/lib/connect/auth.ts";
import { handleSummaryRequest } from "../src/lib/connect/provider.ts";
import { buildFounderFitCard, founderFitSummaryLookup } from "../src/lib/connect/founderfit-summary.ts";
import { sanitizeCard, sanitizeCertificate } from "../src/lib/connect/client.ts";
import { collectPeerData, handlePeersRequest } from "../src/lib/connect/peers.ts";
import { accessPolicyFromEnv } from "../src/lib/access/policy.ts";

const KEY_A = "swc_" + "A".repeat(43);
const KEY_B = "swc_" + "b".repeat(42) + "-";
const KEY_UNKNOWN = "swc_" + "z".repeat(43);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const CALLERS_ENV = `istartup:${sha(KEY_A)}:summary|certificates, inkeep:${sha(KEY_B).toUpperCase()}:certificates`;

afterEach(() => mock.restoreAll());

describe("env parsing", () => {
  test("CONNECT_CALLERS: valid entries kept, malformed ones skipped", () => {
    const callers = parseConnectCallers(
      `${CALLERS_ENV}, bad-hash:1234:summary, noscope:${sha("x")}:, unknownscope:${sha("y")}:admin, Extra:${sha("z")}:summary:more`
    );
    assert.deepEqual(callers.map((c) => c.name), ["istartup", "inkeep"]);
    assert.deepEqual([...callers[0].scopes].sort(), ["certificates", "summary"]);
    assert.deepEqual([...callers[1].scopes], ["certificates"]);
    assert.equal(callers[1].keyHash.toString("hex"), sha(KEY_B)); // uppercase hex accepted
    assert.deepEqual(parseConnectCallers(undefined), []);
    assert.deepEqual(parseConnectCallers(""), []);
  });

  test("CONNECT_PEERS: https only (http on localhost), trailing slash trimmed", () => {
    const peers = parseConnectPeers(
      "istartup=https://istartupscore.com/, prismscore = https://www.prismscore.us ,local=http://localhost:3001, plain=http://evil.example, junk, =https://x.com, creds=https://u:p@x.com"
    );
    assert.deepEqual(Object.fromEntries(peers), {
      istartup: "https://istartupscore.com",
      prismscore: "https://www.prismscore.us",
      local: "http://localhost:3001",
    });
    assert.equal(parseConnectPeers(undefined).size, 0);
  });

  test("CONNECT_KEY must have the swc_ shape", () => {
    assert.equal(connectKeyFromEnv({ CONNECT_KEY: KEY_A }), KEY_A);
    assert.equal(connectKeyFromEnv({ CONNECT_KEY: ` ${KEY_A} ` }), KEY_A);
    assert.equal(connectKeyFromEnv({ CONNECT_KEY: "swc_short" }), null);
    assert.equal(connectKeyFromEnv({}), null);
  });

  test("FOUNDERFIT_PUBLIC_URL defaults to production", () => {
    assert.equal(founderFitPublicUrl({}), DEFAULT_FOUNDERFIT_PUBLIC_URL);
    assert.equal(founderFitPublicUrl({ FOUNDERFIT_PUBLIC_URL: "http://localhost:3000/" }), "http://localhost:3000");
    assert.equal(founderFitPublicUrl({ FOUNDERFIT_PUBLIC_URL: "javascript:alert(1)" }), DEFAULT_FOUNDERFIT_PUBLIC_URL);
  });
});

describe("caller verification", () => {
  const callers = parseConnectCallers(CALLERS_ENV);

  test("known key with the scope is accepted", () => {
    assert.deepEqual(verifyConnectCaller(`Bearer ${KEY_A}`, callers, "summary"), { ok: true, caller: "istartup" });
    assert.deepEqual(verifyConnectCaller(`Bearer ${KEY_B}`, callers, "certificates"), { ok: true, caller: "inkeep" });
  });

  test("missing, malformed or unknown key is 401", () => {
    for (const header of [null, "", KEY_A, `Basic ${KEY_A}`, "Bearer swc_short", `Bearer ${KEY_A}x`, `Bearer ${KEY_UNKNOWN}`]) {
      const r = verifyConnectCaller(header, callers, "summary");
      assert.equal(r.ok, false, String(header));
      assert.equal(r.status, 401);
      assert.equal(r.error, "unauthorized");
    }
    assert.equal(verifyConnectCaller(`Bearer ${KEY_A}`, [], "summary").status, 401);
  });

  test("known key without the scope is 403", () => {
    const r = verifyConnectCaller(`Bearer ${KEY_B}`, callers, "summary");
    assert.deepEqual(r, { ok: false, status: 403, error: "forbidden", caller: "inkeep" });
  });

  test("subject must be a valid email of at most 254 chars, lowercased", () => {
    assert.equal(parseSubject(" Person@Example.COM "), "person@example.com");
    assert.equal(parseSubject("a+tag@sub.example.org"), "a+tag@sub.example.org");
    for (const bad of [null, "", "nope", "a@b", "a b@c.com", "a@@c.com", `${"a".repeat(250)}@x.com`]) {
      assert.equal(parseSubject(bad), null, String(bad));
    }
  });
});

const ASSESSMENT = {
  ownerUid: "alice",
  candidateName: "Alice Founder",
  assetId: "methane",
  assetName: "Distributed Methane-Leak Sensing Platform",
  ffiScore: 67,
  band: "anchor_with_complement",
  validityStatus: "clean",
  narrative: "Executive Summary\nThe candidate is a long confidential narrative that must never leave FounderFit.",
  report: {
    result: {
      dimensions: [
        { code: "J1", label: "Domain expertise", percentile: 90, weight: 2 },
        { code: "P3", label: "Persistence", percentile: 70, weight: 1 },
        { code: "C2", label: "Selling", percentile: 30, weight: 3 },
      ],
      gaps: [
        { dimension: "C2", label: "Selling", shortfall: 25 },
        { dimension: "C5", label: "Hiring", shortfall: 12 },
      ],
      fit_pattern: { code: "discoverer", label: "The Discoverer" },
    },
    vdp: { secret: "raw answers" },
  },
  createdAt: { toDate: () => new Date("2026-11-20T10:00:00.000Z") },
  updatedAt: { toDate: () => new Date("2026-11-21T09:30:00.000Z") },
};

describe("FounderFit summary card", () => {
  test("headline, lines and date come from the stored assessment; no narrative or raw report", () => {
    const card = buildFounderFitCard(ASSESSMENT, "https://ff.example");
    assert.deepEqual(card, {
      title: "FounderFit assessment",
      headline: "67 / 100 FFI · Anchor with Complement",
      lines: [
        { label: "Venture", value: "Distributed Methane-Leak Sensing Platform" },
        { label: "Strongest area", value: "Domain expertise" },
        { label: "Biggest gap", value: "Selling" },
        { label: "Fit pattern", value: "The Discoverer" },
      ],
      url: "https://ff.example",
      updatedAt: "2026-11-21T09:30:00.000Z",
    });
    const serialized = JSON.stringify(card);
    assert.ok(!serialized.includes("confidential"));
    assert.ok(!serialized.includes("raw answers"));
  });

  test("validity problems show in the headline; missing report fields are left out; long values capped", () => {
    const card = buildFounderFitCard(
      { ffiScore: 41, band: "no_fit_anchor", validityStatus: "flagged", assetName: "x".repeat(300), report: null, createdAt: new Date("2026-01-02T00:00:00Z") },
      "https://ff.example"
    );
    assert.equal(card.headline, "41 / 100 FFI · No Fit — Anchor Role · validity flagged");
    assert.equal(card.lines.length, 1);
    assert.equal(card.lines[0].value.length, 120);
    assert.equal(card.updatedAt, "2026-01-02T00:00:00.000Z");
  });

  test("a doc without a score or a date yields no card", () => {
    assert.equal(buildFounderFitCard({ ...ASSESSMENT, ffiScore: "67" }, "u"), null);
    assert.equal(buildFounderFitCard({ ...ASSESSMENT, createdAt: null, updatedAt: null }, "u"), null);
  });
});

describe("GET /api/connect/v1/summary", () => {
  const USERS = {
    "alice@sciencewerx.org": { uid: "alice", email: "alice@sciencewerx.org", emailVerified: true },
    "eve@sciencewerx.org": { uid: "eve", email: "eve@sciencewerx.org", emailVerified: false },
    "new@sciencewerx.org": { uid: "newbie", email: "new@sciencewerx.org", emailVerified: true },
  };
  let deps, logs, lookupDeps;
  beforeEach(() => {
    logs = [];
    lookupDeps = {
      findUserByEmail: mock.fn(async (email) => USERS[email] ?? null),
      latestAssessment: mock.fn(async (uid) => (uid === "alice" ? ASSESSMENT : null)),
      appUrl: "https://ff.example",
    };
    deps = { callers: parseConnectCallers(CALLERS_ENV), lookup: founderFitSummaryLookup(lookupDeps), log: (e) => logs.push(e) };
  });

  const req = ({ key = KEY_A, subject = "alice@sciencewerx.org" } = {}) => {
    const headers = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    if (subject !== null) headers["X-Connect-Subject"] = subject;
    return new Request("http://localhost/api/connect/v1/summary", { headers });
  };

  test("found: verified user with an assessment gets a card", async () => {
    const res = await handleSummaryRequest(req({ subject: "Alice@SCIENCEWERX.org" }), deps);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.app, "founderfit");
    assert.equal(body.found, true);
    assert.equal(body.card.headline, "67 / 100 FFI · Anchor with Complement");
    assert.ok(body.card.lines.length <= 5);
    assert.equal(lookupDeps.findUserByEmail.mock.calls[0].arguments[0], "alice@sciencewerx.org");
    assert.deepEqual(logs, [{ caller: "istartup", endpoint: "summary", subject: subjectHash("alice@sciencewerx.org"), found: true, status: 200 }]);
    assert.ok(!JSON.stringify(logs).includes("alice@"), "raw email never logged");
  });

  test("unverified user: found:false and their assessments are never read", async () => {
    const body = await (await handleSummaryRequest(req({ subject: "eve@sciencewerx.org" }), deps)).json();
    assert.deepEqual(body, { app: "founderfit", found: false });
    assert.equal(lookupDeps.latestAssessment.mock.callCount(), 0);
  });

  test("verified user with no assessment: found:false", async () => {
    const body = await (await handleSummaryRequest(req({ subject: "new@sciencewerx.org" }), deps)).json();
    assert.deepEqual(body, { app: "founderfit", found: false });
  });

  test("unknown email: 200 found:false (uniform with the other not-found cases)", async () => {
    const res = await handleSummaryRequest(req({ subject: "nobody@example.com" }), deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { app: "founderfit", found: false });
  });

  test("no allowlist check: the summary does not depend on FOUNDERFIT_ALLOWED_*", async () => {
    // deps carry no access policy at all; a verified user outside any allowlist still gets their own card.
    USERS["guest@gmail.com"] = { uid: "alice", email: "guest@gmail.com", emailVerified: true };
    const body = await (await handleSummaryRequest(req({ subject: "guest@gmail.com" }), deps)).json();
    assert.equal(body.found, true);
    delete USERS["guest@gmail.com"];
  });

  test("auth order: 401 bad/unknown key, 403 missing scope, 400 bad subject; lookup not called", async () => {
    const cases = [
      [{ key: null }, 401, "unauthorized"],
      [{ key: "swc_nope" }, 401, "unauthorized"],
      [{ key: KEY_UNKNOWN, subject: "not-an-email" }, 401, "unauthorized"],
      [{ key: KEY_B, subject: "not-an-email" }, 403, "forbidden"],
      [{ subject: "not-an-email" }, 400, "bad_subject"],
      [{ subject: null }, 400, "bad_subject"],
    ];
    for (const [opts, status, error] of cases) {
      const res = await handleSummaryRequest(req(opts), deps);
      assert.equal(res.status, status, JSON.stringify(opts));
      assert.deepEqual(await res.json(), { error });
    }
    assert.equal(lookupDeps.findUserByEmail.mock.callCount(), 0);
  });

  test("a failing lookup is a 500 without details", async () => {
    mock.method(console, "error", () => {});
    lookupDeps.findUserByEmail = async () => {
      throw new Error("firestore down: secret detail");
    };
    deps.lookup = founderFitSummaryLookup(lookupDeps);
    const res = await handleSummaryRequest(req(), deps);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "unavailable" });
    assert.equal(logs.at(-1).status, 500);
  });
});

describe("peer response sanitizing", () => {
  test("cards: lines capped at 5 and 120 chars, non-http links rejected", () => {
    const card = sanitizeCard({
      title: "iStartup readiness",
      headline: "312 / 500",
      lines: Array.from({ length: 8 }, (_, i) => ({ label: `L${i}`, value: "v".repeat(500) })),
      url: "https://istartupscore.com/r",
      updatedAt: "2026-11-20T10:00:00.000Z",
    });
    assert.equal(card.lines.length, 5);
    assert.equal(card.lines[0].value.length, 120);
    assert.equal(sanitizeCard({ title: "t", headline: "h", url: "javascript:alert(1)" }), null);
    assert.equal(sanitizeCard(null), null);
  });

  test("certificates: unknown status or bad link dropped", () => {
    const good = { code: "PS-1", title: "Plan", issuer: "PrismScore", status: "VALID", verifyUrl: "https://www.prismscore.us/verify/PS-1", issuedAt: "2026-01-01T00:00:00Z" };
    assert.equal(sanitizeCertificate(good).issuedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(sanitizeCertificate(good).expiresAt, null);
    assert.equal(sanitizeCertificate({ ...good, status: "PENDING" }), null);
    assert.equal(sanitizeCertificate({ ...good, verifyUrl: "data:text/html,x" }), null);
  });
});

describe("GET /api/connect/peers", () => {
  const PEERS = parseConnectPeers("istartup=https://istartup.test,prismscore=https://prism.test,inkguard=https://inkguard.test");
  const TOKENS = {
    "good-token": { uid: "alice", email: "Alice@ScienceWerx.org", email_verified: true },
    "unverified-token": { uid: "eve", email: "eve@sciencewerx.org", email_verified: false },
    "outsider-token": { uid: "mallory", email: "mallory@gmail.com", email_verified: true },
  };
  const ISTARTUP_CARD = {
    title: "iStartup readiness",
    headline: "312 / 500 · Investor-ready soon",
    lines: [{ label: "Weakest area", value: "Traction" }],
    url: "https://istartup.test/report",
    updatedAt: "2026-11-20T10:00:00.000Z",
  };
  const cert = (code) => ({ code, title: `Cert ${code}`, issuer: "Issuer", issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: null, status: "VALID", verifyUrl: `https://verify.test/${code}` });

  let calls, routes, deps;
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new TypeError("fetch failed");
    return route(init);
  };
  beforeEach(() => {
    calls = [];
    routes = {
      "https://istartup.test/api/connect/v1/summary": () => Response.json({ app: "istartup", found: true, card: ISTARTUP_CARD }),
      "https://istartup.test/api/connect/v1/certificates": () => Response.json({ app: "istartup", found: true, certificates: [cert("IS-1")] }),
      "https://prism.test/api/connect/v1/certificates": () => Response.json({ app: "prismscore", found: true, certificates: [cert("PS-1"), cert("PS-2")] }),
    };
    deps = {
      verifyIdToken: async (t) => {
        if (!(t in TOKENS)) throw new Error("auth/argument-error");
        return TOKENS[t];
      },
      accessPolicy: accessPolicyFromEnv({ NODE_ENV: "production", FOUNDERFIT_ALLOWED_DOMAINS: "sciencewerx.org" }),
      peers: PEERS,
      key: KEY_A,
      fetch: fakeFetch,
    };
  });
  const req = (token) => new Request("http://localhost/api/connect/peers", { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  test("merges istartup summary with prismscore + istartup certificates, called with the user's lowercased email", async () => {
    const res = await handlePeersRequest(req("good-token"), deps);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.deepEqual(body.cards, [{ app: "istartup", ...ISTARTUP_CARD }]);
    assert.deepEqual(body.certificates.map((c) => `${c.app}:${c.code}`).sort(), ["istartup:IS-1", "prismscore:PS-1", "prismscore:PS-2"]);
    assert.equal(calls.length, 3, "summary of istartup, certificates of prismscore and istartup; inkguard never called");
    for (const { init } of calls) {
      assert.equal(init.headers.Authorization, `Bearer ${KEY_A}`);
      assert.equal(init.headers["X-Connect-Subject"], "alice@sciencewerx.org");
      assert.equal(init.redirect, "error");
      assert.ok(init.signal instanceof AbortSignal);
    }
  });

  test("fail soft: down, erroring, not-found and malformed peers are just missing", async () => {
    routes["https://istartup.test/api/connect/v1/summary"] = () => new Response("oops", { status: 500 });
    routes["https://istartup.test/api/connect/v1/certificates"] = () => new Response("not json", { status: 200 });
    delete routes["https://prism.test/api/connect/v1/certificates"]; // network error
    const body = await (await handlePeersRequest(req("good-token"), deps)).json();
    assert.deepEqual(body, { cards: [], certificates: [] });

    routes["https://istartup.test/api/connect/v1/summary"] = () => Response.json({ app: "istartup", found: false });
    routes["https://prism.test/api/connect/v1/certificates"] = () => Response.json({ found: true, certificates: [cert("PS-1")] });
    const body2 = await (await handlePeersRequest(req("good-token"), deps)).json();
    assert.deepEqual(body2.cards, []);
    assert.deepEqual(body2.certificates.map((c) => c.code), ["PS-1"]);
  });

  test("a slow peer times out without holding up the others", async () => {
    routes["https://istartup.test/api/connect/v1/summary"] = (init) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(Response.json({ found: true, card: ISTARTUP_CARD })), 5000);
        init.signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(init.signal.reason);
        });
      });
    const started = Date.now();
    const body = await collectPeerData("alice@sciencewerx.org", { ...deps, timeoutMs: 50 });
    assert.ok(Date.now() - started < 2000);
    assert.deepEqual(body.cards, []);
    assert.equal(body.certificates.length, 3);
  });

  test("no CONNECT_KEY or no configured peers: nothing is called", async () => {
    assert.deepEqual(await collectPeerData("a@b.co", { ...deps, key: null }), { cards: [], certificates: [] });
    assert.deepEqual(await collectPeerData("a@b.co", { ...deps, peers: new Map() }), { cards: [], certificates: [] });
    assert.equal(calls.length, 0);
  });

  test("requires a valid ID token, a verified email and the allowlist", async () => {
    assert.equal((await handlePeersRequest(req(null), deps)).status, 401);
    assert.equal((await handlePeersRequest(req("bogus"), deps)).status, 401);
    const unverified = await handlePeersRequest(req("unverified-token"), deps);
    assert.equal(unverified.status, 403);
    assert.equal((await unverified.json()).reason, "email_not_verified");
    const outsider = await handlePeersRequest(req("outsider-token"), deps);
    assert.equal(outsider.status, 403);
    assert.equal((await outsider.json()).reason, "not_allowed");
    assert.equal(calls.length, 0);
  });
});
