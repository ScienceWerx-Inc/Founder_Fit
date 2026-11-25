// Calls a peer's Connect API server-side and turns its answer into display-safe data.
// Fail soft: any network error, timeout, non-200 or malformed body yields null, never a throw.
// Peer data ends up in our page, so every field is type-checked, length-capped, and links must be
// http(s) (no javascript: URLs).

import type { CertificateStatus, ConnectCard, ConnectCertificate, ConnectLine, ConnectScope } from "./types";

export const PEER_TIMEOUT_MS = 4000;
const MAX_LINES = 5;
const MAX_VALUE = 120;
const MAX_TITLE = 200;
const MAX_CERTIFICATES = 50;
const STATUSES: ReadonlySet<string> = new Set<CertificateStatus>(["VALID", "EXPIRED", "REVOKED"]);

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type PeerCallOptions = {
  baseUrl: string;
  key: string;
  subject: string;
  timeoutMs?: number;
  fetch?: FetchLike;
};

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function date(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function sanitizeCard(value: unknown): ConnectCard | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const title = str(c.title, MAX_TITLE);
  const headline = str(c.headline, MAX_TITLE);
  const url = httpUrl(c.url);
  if (!title || !headline || !url) return null;
  const lines: ConnectLine[] = [];
  for (const l of Array.isArray(c.lines) ? c.lines : []) {
    const label = str(l?.label, 60);
    const v = str(l?.value, MAX_VALUE);
    if (label && v) lines.push({ label, value: v });
    if (lines.length === MAX_LINES) break;
  }
  return { title, headline, lines, url, updatedAt: date(c.updatedAt) ?? "" };
}

export function sanitizeCertificate(value: unknown): ConnectCertificate | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const code = str(c.code, 64);
  const title = str(c.title, MAX_TITLE);
  const issuer = str(c.issuer, MAX_TITLE);
  const verifyUrl = httpUrl(c.verifyUrl);
  const status = typeof c.status === "string" && STATUSES.has(c.status) ? (c.status as CertificateStatus) : null;
  if (!code || !title || !issuer || !verifyUrl || !status) return null;
  return { code, title, issuer, issuedAt: date(c.issuedAt), expiresAt: date(c.expiresAt), status, verifyUrl };
}

async function callPeer(scope: ConnectScope, o: PeerCallOptions): Promise<Record<string, unknown> | null> {
  const doFetch = o.fetch ?? (fetch as FetchLike);
  try {
    const res = await doFetch(`${o.baseUrl}/api/connect/v1/${scope}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${o.key}`, "X-Connect-Subject": o.subject, Accept: "application/json" },
      // Never follow a redirect with our key attached; the configured base URL must be the final one.
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(o.timeoutMs ?? PEER_TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const body = await res.json();
    return body && typeof body === "object" && body.found === true ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function fetchPeerSummary(o: PeerCallOptions): Promise<ConnectCard | null> {
  const body = await callPeer("summary", o);
  return body ? sanitizeCard(body.card) : null;
}

export async function fetchPeerCertificates(o: PeerCallOptions): Promise<ConnectCertificate[]> {
  const body = await callPeer("certificates", o);
  if (!body || !Array.isArray(body.certificates)) return [];
  return body.certificates
    .slice(0, MAX_CERTIFICATES)
    .map(sanitizeCertificate)
    .filter((c): c is ConnectCertificate => c !== null);
}
