import {
  NARRATIVE_AUDIENCES,
  NARRATIVE_SYSTEM_PROMPT,
  buildNarrativeUserPrompt,
  type NarrativeAudience,
  type NarrativeInput,
} from "./prompt";
import type { QuotaResult } from "./quota";
import { checkAccess, forbiddenBody, type AccessPolicy, type IdentityClaims } from "../access/policy";

export const MAX_BODY_BYTES = 200 * 1024;
const MAX_CANDIDATE_NAME = 200;

// Injected so the handler can be tested without Firebase Admin or Vertex AI.
export type NarrativeDeps = {
  verifyIdToken: (idToken: string) => Promise<IdentityClaims>;
  /** Who may call the model (FOUNDERFIT_ALLOWED_EMAILS / FOUNDERFIT_ALLOWED_DOMAINS). */
  accessPolicy: AccessPolicy;
  /** Counts one call against the caller's daily limit, or reports that it is used up. */
  consumeQuota: (uid: string) => Promise<QuotaResult>;
  /** Development only: if the quota store can't be reached, allow the call instead of answering 503. */
  allowWhenQuotaUnavailable?: boolean;
  generate: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseInput(body: unknown): NarrativeInput | null {
  if (!isPlainObject(body)) return null;
  const { audience, candidateName, asset_context, result } = body;
  if (typeof audience !== "string" || !NARRATIVE_AUDIENCES.includes(audience as NarrativeAudience)) return null;
  if (typeof candidateName !== "string") return null;
  if (!isPlainObject(asset_context) || !isPlainObject(result)) return null;
  return { audience: audience as NarrativeAudience, candidateName: candidateName.slice(0, MAX_CANDIDATE_NAME), asset_context, result };
}

/**
 * POST /api/narrative: verify the caller's Firebase ID token, check the allowlist and the caller's
 * daily limit, then ask the model for the report narrative.
 */
export async function handleNarrativeRequest(req: Request, deps: NarrativeDeps): Promise<Response> {
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

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const input = parseInput(body);
  if (!input) return json(400, { error: "invalid_request" });

  // Counted after validation (malformed requests never reach the model) and before the model call
  // (a failed generation still cost money, so it counts).
  try {
    const quota = await deps.consumeQuota(claims.uid);
    if (!quota.allowed) {
      return json(
        429,
        {
          error: "rate_limited",
          limit: quota.limit,
          message: `You've reached the daily limit of ${quota.limit} narratives. It resets at midnight UTC.`,
        },
        { "Retry-After": String(quota.retryAfterSeconds) }
      );
    }
  } catch (e) {
    console.error("Narrative quota check failed:", e);
    if (!deps.allowWhenQuotaUnavailable) return json(503, { error: "quota_unavailable" });
  }

  try {
    const narrative = (await deps.generate(NARRATIVE_SYSTEM_PROMPT, buildNarrativeUserPrompt(input))).trim();
    if (!narrative) return json(502, { error: "narrative_unavailable" });
    return json(200, { narrative });
  } catch (e) {
    // Details stay in the server log; the client shows the deterministic fallback.
    console.error("Narrative generation failed:", e);
    return json(502, { error: "narrative_unavailable" });
  }
}
