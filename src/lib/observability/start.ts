import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
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
  const processor = options.traceRequests !== false ? new RequestMetricsProcessor(collector) : undefined;
  const flusher = startFlusher(collector, transport, {
    intervalMs: options.intervalMs,
    onError: (error) => console.warn(`[observability] could not send telemetry: ${error}`),
    beforeFlush: () => processor?.sweep(),
  });

  const runtime: ObservabilityRuntime = {
    collector,
    flusher,
    project: options.project,
    service: options.service,
  };
  setRuntime(runtime);
  if (processor) installRequestTracing(processor);
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
/** Every unmatched path (a 404 with no route pattern) is counted under this one route. */
export const NOT_FOUND_ROUTE = "(not found)";

interface PendingBubble {
  key: string;
  endMs: number;
  record: { method: string; route: string; status: number; durationMs: number };
}

/** How long a middleware span waits for its routed request to start before it counts on its own. */
const BUBBLE_GRACE_MS = 1_000;

export class RequestMetricsProcessor implements SpanProcessor {
  /**
   * With middleware, Next emits two root spans per routed request, one after the other: the
   * middleware phase ("bubble": no route, status 200 even when the request later fails) and
   * then the routed request. A bubble is held here until either its routed request starts
   * (same method and path, within BUBBLE_GRACE_MS) and it is dropped, or the grace period
   * passes: middleware answered by itself (an auth redirect, say) and the bubble is the only
   * record of the request, so it is counted.
   */
  private pending: PendingBubble[] = [];
  /**
   * Request spans by span id, recorded at start. Whether a span is a bubble is only known when
   * it ends (Next sets `next.bubble` late), so bubbles are removed from here at their end and
   * what remains are routed requests.
   */
  private starts = new Map<string, { key: string; startMs: number }>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly collector: Collector,
    private readonly now: () => number = () => Date.now(),
  ) {}

  onStart(span: Span): void {
    const readable = span as unknown as ReadableSpan;
    const attrs = readable.attributes ?? {};
    if (attrs["next.span_type"] !== "BaseServer.handleRequest" || isNested(readable)) return;
    this.starts.set(readable.spanContext().spanId, {
      key: requestKey(attrs),
      startMs: hrMs(readable.startTime),
    });
    if (this.starts.size > 5000) {
      const cutoff = this.now() - 60_000;
      this.starts.forEach((s, id) => {
        if (s.startMs < cutoff) this.starts.delete(id);
      });
    }
  }

  onEnd(span: ReadableSpan): void {
    const attrs = span.attributes;
    // Only top-level request spans: Next 16 renders a 404 page as a nested request span with no
    // status, which would count the request twice.
    if (attrs["next.span_type"] !== "BaseServer.handleRequest" || isNested(span)) return;
    const method = String(attrs["http.method"] ?? attrs["http.request.method"] ?? "GET");
    const status = Number(attrs["http.status_code"] ?? attrs["http.response.status_code"] ?? 0);
    const pattern = attrs["next.route"] ?? attrs["http.route"];
    const target = String(attrs["http.target"] ?? attrs["url.path"] ?? "/");
    const isBubble = attrs["next.bubble"] === true;
    // A routed request's start stays recorded until the sweep after it ends; a bubble's goes now.
    if (isBubble) this.starts.delete(span.spanContext().spanId);
    if (isStaticAsset(target)) return;
    const durationMs = span.duration[0] * 1000 + span.duration[1] / 1e6;

    if (isBubble) {
      this.pending.push({
        key: requestKey(attrs),
        endMs: hrMs(span.endTime),
        record: {
          method,
          route: status === 404 ? NOT_FOUND_ROUTE : normalizePath(target),
          status: status || 200,
          durationMs,
        },
      });
      if (this.pending.length > 1000) this.pending.splice(0, this.pending.length - 1000);
      this.scheduleSweep();
      return;
    }

    // Next 15 reports app-router API routes as `/api/x/route`; Next 16 as `/api/x`. Unmatched
    // paths (404s) share one route, so a scanner probing random URLs cannot fill the route cap.
    const routed =
      typeof pattern === "string" && pattern && !/^\/(?:_not-found|404)(?:\/page)?$/.test(pattern);
    const route = routed
      ? (pattern as string).replace(/\/(?:route|page)$/, "") || "/"
      : status === 404
        ? NOT_FOUND_ROUTE
        : normalizePath(target);
    this.collector.recordRequest({ method, route, status: status || 200, durationMs });
  }

  /**
   * Settles held middleware spans whose grace period is over (all of them with `force`): one
   * whose routed request started right after it is dropped, the rest are counted.
   */
  sweep(force = false): void {
    const now = this.now();
    const cutoff = now - BUBBLE_GRACE_MS;
    const keep: PendingBubble[] = [];
    for (const p of this.pending) {
      if (!force && p.endMs > cutoff) {
        keep.push(p);
        continue;
      }
      let routed: string | undefined;
      this.starts.forEach((s, id) => {
        if (!routed && s.key === p.key && s.startMs >= p.endMs - 5 && s.startMs - p.endMs <= BUBBLE_GRACE_MS)
          routed = id;
      });
      if (routed) this.starts.delete(routed);
      else this.collector.recordRequest(p.record);
    }
    this.pending = keep;
    this.starts.forEach((s, id) => {
      if (s.startMs < cutoff - 60_000) this.starts.delete(id);
    });
    if (keep.length === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleSweep(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweep(), BUBBLE_GRACE_MS);
    this.timer.unref?.();
  }

  forceFlush(): Promise<void> {
    this.sweep(true);
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    this.sweep(true);
    return Promise.resolve();
  }
}

/** A child of a span in this process (a parent from another service, via traceparent, is fine). */
function isNested(span: ReadableSpan): boolean {
  return !!span.parentSpanContext && !span.parentSpanContext.isRemote;
}

function requestKey(attrs: Record<string, unknown>): string {
  return `${String(attrs["http.method"] ?? attrs["http.request.method"] ?? "GET")} ${String(attrs["http.target"] ?? attrs["url.path"] ?? "/")}`;
}

function hrMs(t: [number, number]): number {
  return t[0] * 1000 + t[1] / 1e6;
}

function installRequestTracing(processor: RequestMetricsProcessor): void {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  const provider = new BasicTracerProvider({ spanProcessors: [processor] });
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
