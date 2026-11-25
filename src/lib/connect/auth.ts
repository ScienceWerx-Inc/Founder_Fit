import { createHash, timingSafeEqual } from "node:crypto";
import { CONNECT_KEY_PATTERN, type ConnectCaller } from "./env";
import type { ConnectScope } from "./types";

export type CallerCheck =
  | { ok: true; caller: string }
  | { ok: false; status: 401; error: "unauthorized"; caller: null }
  | { ok: false; status: 403; error: "forbidden"; caller: string };

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Steps 1–3 of a Connect provider call: bearer shape, known caller (sha256 of the key compared with
 * timingSafeEqual against every entry, so timing doesn't reveal which entry was close), then scope.
 */
export function verifyConnectCaller(
  authorization: string | null,
  callers: readonly ConnectCaller[],
  scope: ConnectScope
): CallerCheck {
  const match = /^Bearer (\S+)$/.exec(authorization ?? "");
  if (!match || !CONNECT_KEY_PATTERN.test(match[1])) return { ok: false, status: 401, error: "unauthorized", caller: null };
  const presented = createHash("sha256").update(match[1], "utf8").digest();
  let found: ConnectCaller | null = null;
  for (const c of callers) {
    if (c.keyHash.length === presented.length && timingSafeEqual(c.keyHash, presented) && !found) found = c;
  }
  if (!found) return { ok: false, status: 401, error: "unauthorized", caller: null };
  if (!found.scopes.has(scope)) return { ok: false, status: 403, error: "forbidden", caller: found.name };
  return { ok: true, caller: found.name };
}

/** Step 4: the subject must be a syntactically valid email of at most 254 chars. Returns it lowercased. */
export function parseSubject(value: string | null): string | null {
  const email = (value ?? "").trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@"<>(),;:\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) return null;
  return email;
}

/** Logged instead of the email, so logs never hold the raw address. */
export function subjectHash(email: string): string {
  return sha256Hex(email.toLowerCase()).slice(0, 16);
}
