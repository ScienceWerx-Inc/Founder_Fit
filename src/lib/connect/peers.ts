// Consumer side of ScienceWerx Connect: GET /api/connect/peers.
// The signed-in FounderFit user (verified email, on the allowlist) gets the summary cards and
// certificates that peer apps hold for that same email. Peers are called in parallel, server-side;
// a peer that is unconfigured, down, slow or refusing is simply left out.

import { checkAccess, forbiddenBody, type AccessPolicy, type IdentityClaims } from "../access/policy";
import { fetchPeerCertificates, fetchPeerSummary, type FetchLike } from "./client";
import type { PeerCard, PeerCertificate, PeersResponse } from "./types";

/** Who FounderFit shows (ScienceWerx Connect v1 table). Only peers also listed in CONNECT_PEERS are called. */
export const FOUNDERFIT_SHOWS = {
  summary: ["istartup"],
  certificates: ["prismscore", "istartup"],
} as const;

export type PeersDeps = {
  verifyIdToken: (idToken: string) => Promise<IdentityClaims>;
  accessPolicy: AccessPolicy;
  peers: ReadonlyMap<string, string>;
  /** This app's CONNECT_KEY; null means Connect is off and nothing is called. */
  key: string | null;
  fetch?: FetchLike;
  timeoutMs?: number;
};

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function collectPeerData(
  subject: string,
  deps: Pick<PeersDeps, "peers" | "key" | "fetch" | "timeoutMs">
): Promise<PeersResponse> {
  if (!deps.key) return { cards: [], certificates: [] };
  const base = { key: deps.key, subject, fetch: deps.fetch, timeoutMs: deps.timeoutMs };
  const configured = (names: readonly string[]) =>
    names.filter((n) => deps.peers.has(n)).map((n) => ({ app: n, baseUrl: deps.peers.get(n)! }));

  const summaries = configured(FOUNDERFIT_SHOWS.summary).map(async ({ app, baseUrl }): Promise<PeerCard[]> => {
    const card = await fetchPeerSummary({ ...base, baseUrl });
    return card ? [{ app, ...card }] : [];
  });
  const certificates = configured(FOUNDERFIT_SHOWS.certificates).map(async ({ app, baseUrl }): Promise<PeerCertificate[]> =>
    (await fetchPeerCertificates({ ...base, baseUrl })).map((c) => ({ app, ...c }))
  );
  // The fetchers never reject, but allSettled keeps one bug from blanking every peer.
  const flat = <V,>(results: PromiseSettledResult<V[]>[]) => results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const [cards, certs] = await Promise.all([Promise.allSettled(summaries), Promise.allSettled(certificates)]);
  return { cards: flat(cards), certificates: flat(certs) };
}

export async function handlePeersRequest(req: Request, deps: PeersDeps): Promise<Response> {
  const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!match) return json(401, { error: "unauthorized" });
  let claims: IdentityClaims;
  try {
    claims = await deps.verifyIdToken(match[1]);
  } catch {
    return json(401, { error: "unauthorized" });
  }
  const access = checkAccess(claims, deps.accessPolicy);
  if (!access.allowed) return json(403, forbiddenBody(access.reason));
  // checkAccess guarantees a verified, non-empty email.
  const subject = claims.email!.trim().toLowerCase();
  return json(200, await collectPeerData(subject, deps));
}
