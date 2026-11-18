/**
 * Builds the `/api/health` endpoint every ScienceWerx app exposes. The uptime monitor checks it
 * every 10 minutes and the portal dashboard shows each dependency's result.
 *
 * ```ts
 * // src/app/api/health/route.ts
 * import { createHealthHandler } from "@/lib/observability";
 * export const dynamic = "force-dynamic";
 * export const GET = createHealthHandler({
 *   service: "grant-align-web",
 *   checks: { firestore: () => db.collection("_health").limit(1).get() },
 * });
 * ```
 *
 * A check passes when its promise resolves. It fails when it rejects or takes longer than
 * `timeoutMs`, and is `degraded` when slower than `slowMs`. A check marked `critical: false`
 * can make the response degraded, never down.
 *
 * The response is public, so a failed check reports only the error's type and code (e.g.
 * `Error (PERMISSION_DENIED)`) or our own timeout message. Driver messages can contain hostnames,
 * IPs, ports and paths; the full error goes to the server log instead.
 */

export type HealthStatus = "ok" | "degraded" | "down";

export type HealthCheck =
  | (() => Promise<unknown>)
  | { run: () => Promise<unknown>; critical?: boolean; timeoutMs?: number; slowMs?: number };

export interface HealthOptions {
  service: string;
  version?: string;
  checks: Record<string, HealthCheck>;
  timeoutMs?: number;
  slowMs?: number;
}

export interface HealthReport {
  status: HealthStatus;
  service: string;
  version?: string;
  time: string;
  checks: Record<string, { status: HealthStatus; latencyMs: number; error?: string }>;
}

export async function runHealthChecks(options: HealthOptions): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(options.checks).map(async ([name, check]) => {
      const spec = typeof check === "function" ? { run: check } : check;
      const timeoutMs = spec.timeoutMs ?? options.timeoutMs ?? 5_000;
      const slowMs = spec.slowMs ?? options.slowMs ?? 1_500;
      const critical = spec.critical ?? true;
      const started = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          spec.run(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new HealthTimeout(`timed out after ${timeoutMs} ms`)), timeoutMs);
          }),
        ]);
        const latencyMs = Math.round(performance.now() - started);
        const status: HealthStatus = latencyMs > slowMs ? "degraded" : "ok";
        return [name, { status, latencyMs }] as const;
      } catch (error) {
        const latencyMs = Math.round(performance.now() - started);
        const message = publicError(error);
        console.error(`[health] ${name} failed:`, error);
        const status: HealthStatus = critical ? "down" : "degraded";
        return [name, { status, latencyMs, error: message }] as const;
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const statuses = entries.map(([, r]) => r.status);
  const status: HealthStatus = statuses.includes("down")
    ? "down"
    : statuses.includes("degraded")
      ? "degraded"
      : "ok";

  return {
    status,
    service: options.service,
    ...(options.version ? { version: options.version } : {}),
    time: new Date().toISOString(),
    checks: Object.fromEntries(entries),
  };
}

/** A route handler: 200 when ok or degraded, 503 when down. Never cached. */
export function createHealthHandler(options: HealthOptions): () => Promise<Response> {
  return async () => {
    const report = await runHealthChecks(options);
    return new Response(JSON.stringify(report), {
      status: report.status === "down" ? 503 : 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  };
}

class HealthTimeout extends Error {}

/** Type and code only: never the message, which can carry hostnames, IPs or paths. */
export function publicError(error: unknown): string {
  if (error instanceof HealthTimeout) return error.message;
  if (!(error instanceof Error)) return "Error";
  const code = (error as { code?: unknown }).code;
  const safeCode = typeof code === "string" || typeof code === "number" ? String(code).slice(0, 40) : "";
  return safeCode && /^[\w.-]+$/.test(safeCode) ? `${error.name} (${safeCode})` : error.name;
}
