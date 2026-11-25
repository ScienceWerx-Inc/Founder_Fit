// Provider side of ScienceWerx Connect: GET /api/connect/v1/summary for FounderFit.
//
// Access decision: a call needs a known caller key with the `summary` scope and a subject whose
// Firebase account has a verified email. It does NOT check FounderFit's allowlist
// (FOUNDERFIT_ALLOWED_*): the allowlist gates using FounderFit (and its paid model); here the person
// is reading a summary of their own existing results inside another ScienceWerx app, and the calling
// app has already signed them in with that verified email. Someone removed from the allowlist still
// sees their own past result elsewhere, and nobody gains FounderFit access through this route.

import { parseSubject, subjectHash, verifyConnectCaller } from "./auth";
import type { ConnectCaller } from "./env";
import type { ConnectCard, ConnectSummaryResponse } from "./types";

export const APP_NAME = "founderfit";

export type ConnectLogEntry = {
  caller: string | null;
  endpoint: "summary";
  subject: string | null;
  found: boolean | null;
  status: number;
};

export type SummaryLookup = (email: string) => Promise<{ found: false } | { found: true; card: ConnectCard }>;

export type ProviderDeps = {
  callers: readonly ConnectCaller[];
  lookup: SummaryLookup;
  log?: (entry: ConnectLogEntry) => void;
};

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function logConnectCall(entry: ConnectLogEntry): void {
  // One JSON line; Cloud Logging reads `severity`. Subject is a hash, never the email.
  const severity = entry.status >= 500 ? "ERROR" : entry.status >= 400 ? "WARNING" : "INFO";
  console.log(JSON.stringify({ severity, message: "connect call", ...entry }));
}

export async function handleSummaryRequest(req: Request, deps: ProviderDeps): Promise<Response> {
  const log = deps.log ?? logConnectCall;
  const check = verifyConnectCaller(req.headers.get("authorization"), deps.callers, "summary");
  if (!check.ok) {
    log({ caller: check.caller, endpoint: "summary", subject: null, found: null, status: check.status });
    return json(check.status, { error: check.error });
  }
  const email = parseSubject(req.headers.get("x-connect-subject"));
  if (!email) {
    log({ caller: check.caller, endpoint: "summary", subject: null, found: null, status: 400 });
    return json(400, { error: "bad_subject" });
  }
  const subject = subjectHash(email);
  let result: Awaited<ReturnType<SummaryLookup>>;
  try {
    result = await deps.lookup(email);
  } catch (error) {
    console.error("connect summary lookup failed", error instanceof Error ? error.message : error);
    log({ caller: check.caller, endpoint: "summary", subject, found: null, status: 500 });
    return json(500, { error: "unavailable" });
  }
  log({ caller: check.caller, endpoint: "summary", subject, found: result.found, status: 200 });
  const body: ConnectSummaryResponse = result.found
    ? { app: APP_NAME, found: true, card: result.card }
    : { app: APP_NAME, found: false };
  return json(200, body);
}
