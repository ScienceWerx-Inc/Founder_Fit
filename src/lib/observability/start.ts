import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider, type ReadableSpan, type SpanProcessor } from "@opentelemetry/sdk-trace-base";
import { resolveEnv } from "./attributes";
import { Collector, normalizePath } from "./collector";
import { getRuntime, type ObservabilityRuntime, setRuntime } from "./runtime";
import { httpTransport, startFlusher, type Transport } from "./transport";

export const DEFAULT_INGEST_URL = "https://sciencewerx.org/api/observability/ingest";

export interface ObservabilityOptions {
  /** Project id as registered in the portal, e.g. `grant-align`. */
  project: string;
  /** Deployable within the project, e.g. `grant-align-web`. */
  service: string;
  /** Defaults to OBSERVABILITY_TOKEN. Without a token nothing is collected or sent. */
  token?: string;
  /** Defaults to OBSERVABILITY_URL, then the production portal. */
  ingestUrl?: string;
  /** Defaults to APP_VERSION, then the Cloud Run revision or Vercel commit. */
  release?: string;
  env?: string;
  /** Flush interval. Defaults to 60 s. */
  intervalMs?: number;
  /** For tests. */
  transport?: Transport;
  /** Record request metrics from Next.js server spans. Defaults to true. */
  traceRequests?: boolean;
}

/**
 * Starts collecting and sending telemetry for this Node.js process. Idempotent: later calls
 * return the running instance. Returns undefined when no token is configured, so local
 * development and preview builds stay silent unless they opt in.
 */
export function startObservability(options: ObservabilityOptions): ObservabilityRuntime | undefined {
  const existing = getRuntime();
  if (existing) return existing;

  const token = options.token ?? process.env.OBSERVABILITY_TOKEN;
  if (!token && !options.transport) return undefined;

  const collector = new Collector({
    project: options.project,
    service: options.service,
    env: options.env ?? resolveEnv(),
    release: options.release ?? defaultRelease(),
  });
  const transport =
    options.transport ??
    httpTransport(options.ingestUrl ?? process.env.OBSERVABILITY_URL ?? DEFAULT_INGEST_URL, token as string);
  const flusher = startFlusher(collector, transport, {
    intervalMs: options.intervalMs,
    onError: (error) => console.warn(`[observability] could not send telemetry: ${error}`),
  });

  const runtime: ObservabilityRuntime = {
    collector,
    flusher,
    project: options.project,
    service: options.service,
  };
  setRuntime(runtime);
  if (options.traceRequests !== false) installRequestTracing(collector);
  return runtime;
}

export function stopObservabilityForTests(): void {
  getRuntime()?.flusher.stop();
  setRuntime(undefined);
}

/**
 * Next.js creates an OpenTelemetry span for every request once a tracer provider is
 * registered. The root span (`BaseServer.handleRequest`) carries the method, route pattern
 * and status, which is all the dashboard needs, so no span is ever exported.
 */
export class RequestMetricsProcessor implements SpanProcessor {
  constructor(private readonly collector: Collector) {}

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes;
    if (attrs["next.span_type"] !== "BaseServer.handleRequest") return;
    // With middleware, Next wraps each request in an outer "bubble" span: no route, and status
    // 200 even when the inner request failed. The inner span has the real route and status.
    if (attrs["next.bubble"] === true) return;
    const method = String(attrs["http.method"] ?? attrs["http.request.method"] ?? "GET");
    const status = Number(attrs["http.status_code"] ?? attrs["http.response.status_code"] ?? 0);
    const pattern = attrs["next.route"] ?? attrs["http.route"];
    const target = String(attrs["http.target"] ?? attrs["url.path"] ?? "/");
    if (isStaticAsset(target)) return;
    // Next 15 reports app-router API routes as `/api/x/route`; Next 16 as `/api/x`.
    const route =
      typeof pattern === "string" && pattern
        ? pattern.replace(/\/(?:route|page)$/, "") || "/"
        : normalizePath(target);
    const durationMs = span.duration[0] * 1000 + span.duration[1] / 1e6;
    this.collector.recordRequest({ method, route, status: status || 200, durationMs });
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

function installRequestTracing(collector: Collector): void {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  const provider = new BasicTracerProvider({ spanProcessors: [new RequestMetricsProcessor(collector)] });
  if (!trace.setGlobalTracerProvider(provider)) {
    console.warn("[observability] another tracer provider is already registered; request metrics are off");
  }
}

function isStaticAsset(path: string): boolean {
  return (
    path.startsWith("/_next/") ||
    /\.(?:js|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|txt|xml)(?:\?|$)/i.test(path)
  );
}

function defaultRelease(): string | undefined {
  return (
    process.env.APP_VERSION ||
    process.env.K_REVISION ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    undefined
  );
}
