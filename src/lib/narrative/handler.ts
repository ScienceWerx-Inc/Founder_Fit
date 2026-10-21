import {
  NARRATIVE_AUDIENCES,
  NARRATIVE_SYSTEM_PROMPT,
  buildNarrativeUserPrompt,
  type NarrativeAudience,
  type NarrativeInput,
} from "./prompt";

export const MAX_BODY_BYTES = 200 * 1024;
const MAX_CANDIDATE_NAME = 200;

// Injected so the handler can be tested without Firebase Admin or Vertex AI.
export type NarrativeDeps = {
  verifyIdToken: (idToken: string) => Promise<{ uid: string }>;
  generate: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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

/** POST /api/narrative: verify the caller's Firebase ID token, then ask the model for the report narrative. */
export async function handleNarrativeRequest(req: Request, deps: NarrativeDeps): Promise<Response> {
  const match = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!match) return json(401, { error: "unauthorized" });
  try {
    await deps.verifyIdToken(match[1]);
  } catch {
    return json(401, { error: "unauthorized" });
  }

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
