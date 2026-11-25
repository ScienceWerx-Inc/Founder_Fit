// Who may use FounderFit. Pure functions (no Firebase imports) so they can be unit tested and
// shared by /api/access and /api/narrative.
//
// FOUNDERFIT_ALLOWED_EMAILS   comma-separated addresses, case-insensitive (e.g. "a@x.com, b@y.org")
// FOUNDERFIT_ALLOWED_DOMAINS  comma-separated email domains, exact match (e.g. "sciencewerx.org")
//
// A signed-in account is allowed when its email is verified AND it matches either list.
// When both lists are empty: production (NODE_ENV=production) allows nobody (fail closed, so a
// missing config can't open the paid model to every Google account); development allows any
// verified account so local work needs no setup.

export type AccessPolicy = {
  emails: ReadonlySet<string>;
  domains: ReadonlySet<string>;
  /** True when no allowlist is configured; then `openWhenUnset` decides. */
  unset: boolean;
  /** Development only: with no allowlist, any verified account is allowed. */
  openWhenUnset: boolean;
};

/** The claims of a verified Firebase ID token that the policy looks at. */
export type IdentityClaims = { uid: string; email?: string; email_verified?: boolean };

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "email_not_verified" | "not_allowed" };

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function accessPolicyFromEnv(env: Record<string, string | undefined> = process.env): AccessPolicy {
  const emails = new Set(parseList(env.FOUNDERFIT_ALLOWED_EMAILS));
  const domains = new Set(parseList(env.FOUNDERFIT_ALLOWED_DOMAINS).map((d) => d.replace(/^@/, "")));
  const unset = emails.size === 0 && domains.size === 0;
  return { emails, domains, unset, openWhenUnset: env.NODE_ENV !== "production" };
}

export function checkAccess(claims: IdentityClaims, policy: AccessPolicy): AccessDecision {
  const email = (claims.email ?? "").trim().toLowerCase();
  if (!email || claims.email_verified !== true) return { allowed: false, reason: "email_not_verified" };
  if (policy.unset) return policy.openWhenUnset ? { allowed: true } : { allowed: false, reason: "not_allowed" };
  if (policy.emails.has(email)) return { allowed: true };
  const at = email.lastIndexOf("@");
  if (at > 0 && policy.domains.has(email.slice(at + 1))) return { allowed: true };
  return { allowed: false, reason: "not_allowed" };
}

export const ACCESS_DENIED_MESSAGES: Record<"email_not_verified" | "not_allowed", string> = {
  email_not_verified: "This Google account's email address isn't verified, so it can't use FounderFit.",
  not_allowed: "This account isn't allowed to use FounderFit. Sign in with an approved account, or ask a ScienceWerx admin for access.",
};

/** 403 body shared by the access check and the narrative route. */
export function forbiddenBody(reason: "email_not_verified" | "not_allowed") {
  return { error: "forbidden", reason, message: ACCESS_DENIED_MESSAGES[reason] };
}
