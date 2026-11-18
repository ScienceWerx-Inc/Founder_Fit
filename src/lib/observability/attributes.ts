/**
 * Attribute names shared by all ScienceWerx services, so dashboards and queries work across products.
 * Prefer the OpenTelemetry semantic conventions for anything they already cover (HTTP, DB, etc.).
 */
export const Attr = {
  /** Product the work belongs to, e.g. `sciencewerx`, `founderfit`, `ipwerx`. */
  PRODUCT: "sw.product",
  /** Customer organization / tenant id. */
  ORG_ID: "sw.org.id",
  /** Signed-in user id (the internal id, never an email). */
  USER_ID: "sw.user.id",
  /** Feature or workflow name, e.g. `grant-align.match`. */
  FEATURE: "sw.feature",
  /** Background job or queue name. */
  JOB: "sw.job",
  /** AI model used for the operation. */
  AI_MODEL: "sw.ai.model",
} as const;

export type AttrName = (typeof Attr)[keyof typeof Attr];

/** Canonical deployment environment names. */
export type DeploymentEnv = "development" | "staging" | "production";

/**
 * APP_ENV wins; then Vercel's VERCEL_ENV (previews run with NODE_ENV=production but are not
 * production); then NODE_ENV.
 */
export function resolveEnv(
  value = process.env.APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
): DeploymentEnv {
  if (value === "production" || value === "prod") return "production";
  if (value === "staging" || value === "preview") return "staging";
  return "development";
}
