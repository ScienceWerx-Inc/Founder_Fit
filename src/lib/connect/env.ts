// Parsing of the ScienceWerx Connect env vars. Pure (no Firebase, no network) so it is unit tested.
//
// CONNECT_KEY      this app's own caller key: "swc_" + 43 base64url chars. Secret.
// CONNECT_CALLERS  who may call this app: "name:sha256hex:scope|scope,..." (not secret; hashes only).
// CONNECT_PEERS    where peers live: "name=https://base-url,..." (not secret). Only listed peers are called.
//
// Malformed entries are skipped rather than failing the whole list, so one typo can't take the
// other integrations down; a skipped caller simply gets 401, a skipped peer is simply not called.

import type { ConnectScope } from "./types";

export const CONNECT_KEY_PATTERN = /^swc_[A-Za-z0-9_-]{43}$/;
const NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const SCOPES: ReadonlySet<string> = new Set<ConnectScope>(["summary", "certificates"]);

export type ConnectCaller = { name: string; keyHash: Buffer; scopes: ReadonlySet<ConnectScope> };

function entries(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseConnectCallers(value: string | undefined): ConnectCaller[] {
  const callers: ConnectCaller[] = [];
  for (const entry of entries(value)) {
    const [name, hash, scopeList, ...rest] = entry.split(":").map((s) => s.trim());
    if (rest.length || !name || !NAME_PATTERN.test(name.toLowerCase())) continue;
    if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) continue;
    const scopes = new Set(
      (scopeList ?? "")
        .split("|")
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is ConnectScope => SCOPES.has(s))
    );
    if (scopes.size === 0) continue;
    callers.push({ name: name.toLowerCase(), keyHash: Buffer.from(hash.toLowerCase(), "hex"), scopes });
  }
  return callers;
}

/** Peer base URLs by name. https only, except http on localhost for local development. */
export function parseConnectPeers(value: string | undefined): Map<string, string> {
  const peers = new Map<string, string>();
  for (const entry of entries(value)) {
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    const name = entry.slice(0, eq).trim().toLowerCase();
    if (!NAME_PATTERN.test(name)) continue;
    let url: URL;
    try {
      url = new URL(entry.slice(eq + 1).trim());
    } catch {
      continue;
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) continue;
    if (url.username || url.password || url.search || url.hash) continue;
    peers.set(name, url.origin + url.pathname.replace(/\/+$/, ""));
  }
  return peers;
}

/** This app's caller key, or null when unset or malformed (then no peer is called). */
export function connectKeyFromEnv(env: Record<string, string | undefined> = process.env): string | null {
  const key = (env.CONNECT_KEY ?? "").trim();
  return CONNECT_KEY_PATTERN.test(key) ? key : null;
}

export const DEFAULT_FOUNDERFIT_PUBLIC_URL = "https://founder-fit--founder-fit-6a455.us-east4.hosted.app";

/** Where a person opens FounderFit, used as the card link in our summary. */
export function founderFitPublicUrl(env: Record<string, string | undefined> = process.env): string {
  const value = (env.FOUNDERFIT_PUBLIC_URL ?? "").trim();
  if (!value) return DEFAULT_FOUNDERFIT_PUBLIC_URL;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    // fall through
  }
  return DEFAULT_FOUNDERFIT_PUBLIC_URL;
}
