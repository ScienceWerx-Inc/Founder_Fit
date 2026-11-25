import { checkAccess, forbiddenBody, type AccessPolicy, type IdentityClaims } from "./policy";

export type AccessDeps = {
  verifyIdToken: (idToken: string) => Promise<IdentityClaims>;
  accessPolicy: AccessPolicy;
};

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * GET /api/access: tells the signed-in client whether its account may use FounderFit, so the UI can
 * say so right after sign-in. Same policy as /api/narrative; it costs nothing and returns no config.
 */
export async function handleAccessRequest(req: Request, deps: AccessDeps): Promise<Response> {
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
  return json(200, { allowed: true });
}
