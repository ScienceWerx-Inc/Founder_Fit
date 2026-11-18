import type { Logger } from "./logger";
import { recordError } from "./runtime";
import type { ObservabilityOptions } from "./start";
import { withSpan } from "./tracing";

/**
 * Everything a Next.js app needs, from `instrumentation.ts` at the project root (or in src/):
 *
 * ```ts
 * import { registerObservability, captureRequestError } from "@/lib/observability/next";
 *
 * export const register = () => registerObservability({ project: "grant-align", service: "grant-align-web" });
 * export const onRequestError = captureRequestError;
 * ```
 *
 * The Node-only parts are imported lazily, so the edge bundle never sees them.
 */
export async function registerObservability(options: ObservabilityOptions): Promise<void> {
  // Keep this exact `if` form: Next.js inlines NEXT_RUNTIME, and webpack only drops the import
  // from the edge bundle when it sits inside a constant-false `if` block (an early `return`
  // is not enough, and the edge build then fails on Node-only modules).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startObservability } = await import("./start");
    startObservability(options);
  }
}

/** Minimal shape of Next.js's `onRequestError` arguments (Next 15+). */
interface NextRequestInfo {
  path: string;
  method: string;
}
interface NextErrorContext {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
}

/** Export as `onRequestError` from instrumentation.ts: every uncaught server error lands on the dashboard. */
export function captureRequestError(error: unknown, request: NextRequestInfo, ctx: NextErrorContext): void {
  const digest = (error as { digest?: unknown }).digest;
  recordError(error, {
    route: `${request.method} ${ctx.routePath ?? request.path.split("?")[0]}`,
    ...(typeof digest === "string" ? { digest } : {}),
  });
}

type RouteHandler<C> = (request: Request, context: C) => Response | Promise<Response>;

/**
 * Optional wrapper for a route handler: a span, one structured log line per request (method,
 * path, status, duration) and errors logged before they are rethrown to Next.js.
 */
export function withRouteHandler<C>(name: string, logger: Logger, handler: RouteHandler<C>): RouteHandler<C> {
  return (request, context) =>
    withSpan(`route ${name}`, async (span) => {
      const started = performance.now();
      const path = new URL(request.url).pathname;
      const fields = { route: name, method: request.method, path };
      try {
        const response = await handler(request, context);
        span.setAttribute("http.response.status_code", response.status);
        const level = response.status >= 500 ? "error" : "info";
        logger[level]("request", {
          ...fields,
          status: response.status,
          duration_ms: Math.round(performance.now() - started),
        });
        return response;
      } catch (error) {
        logger.error("request failed", {
          ...fields,
          err: error,
          duration_ms: Math.round(performance.now() - started),
        });
        throw error;
      }
    });
}
