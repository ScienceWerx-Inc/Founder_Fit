/**
 * Aggregates requests and errors in memory and turns them into one batch per flush.
 * Pure apart from the clock, so the wire format (see PROTOCOL.md) is fully unit-tested.
 */

/** Upper bounds (ms) of the latency histogram. The last bucket is "3 s or slower". */
export const LATENCY_BUCKETS_MS = [100, 300, 1000, 3000] as const;
const MAX_ROUTES = 200;
const MAX_ERRORS = 50;
const OTHER_ROUTE = "OTHER";

export interface RouteStats {
  /** `METHOD /pattern`, e.g. `GET /api/projects/[id]`. */
  route: string;
  count: number;
  /** Responses with status >= 500. */
  errors: number;
  /** Responses with status 400–499. */
  clientErrors: number;
  durationSumMs: number;
  durationMaxMs: number;
  /** Counts per LATENCY_BUCKETS_MS bucket, plus one for slower: length 5. */
  buckets: number[];
}

export interface ErrorGroup {
  fingerprint: string;
  name: string;
  message: string;
  stack?: string;
  route?: string;
  /** Next.js error digest, shown to users on the error page. */
  digest?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export interface TelemetryBatch {
  version: 1;
  project: string;
  service: string;
  env: string;
  release?: string;
  instance: string;
  window: { start: string; end: string };
  routes: RouteStats[];
  errors: ErrorGroup[];
}

export interface CollectorOptions {
  project: string;
  service: string;
  env: string;
  release?: string;
  now?: () => Date;
}

export class Collector {
  private routes = new Map<string, RouteStats>();
  private errors = new Map<string, ErrorGroup>();
  private windowStart: Date;
  private readonly instance = Math.random().toString(36).slice(2, 10);
  private readonly now: () => Date;

  constructor(private readonly options: CollectorOptions) {
    this.now = options.now ?? (() => new Date());
    this.windowStart = this.now();
  }

  recordRequest(input: { method: string; route: string; status: number; durationMs: number }): void {
    let key = `${input.method.toUpperCase()} ${input.route}`;
    if (!this.routes.has(key) && this.routes.size >= MAX_ROUTES) key = OTHER_ROUTE;
    const stats = this.routes.get(key) ?? {
      route: key,
      count: 0,
      errors: 0,
      clientErrors: 0,
      durationSumMs: 0,
      durationMaxMs: 0,
      buckets: [0, 0, 0, 0, 0],
    };
    const ms = Math.max(0, Math.round(input.durationMs));
    stats.count++;
    if (input.status >= 500) stats.errors++;
    else if (input.status >= 400) stats.clientErrors++;
    stats.durationSumMs += ms;
    stats.durationMaxMs = Math.max(stats.durationMaxMs, ms);
    const bucket = LATENCY_BUCKETS_MS.findIndex((limit) => ms < limit);
    const index = bucket === -1 ? LATENCY_BUCKETS_MS.length : bucket;
    stats.buckets[index] = (stats.buckets[index] ?? 0) + 1;
    this.routes.set(key, stats);
  }

  recordError(error: unknown, context: { route?: string; digest?: string } = {}): void {
    const err = toError(error);
    const message = scrub(err.message).slice(0, 1000);
    const stack = err.stack ? scrub(err.stack).slice(0, 4000) : undefined;
    const fingerprint = fingerprintOf(err.name, message, stack, context.route);
    const at = this.now().toISOString();
    const existing = this.errors.get(fingerprint);
    if (existing) {
      existing.count++;
      existing.lastSeen = at;
      return;
    }
    if (this.errors.size >= MAX_ERRORS) return;
    this.errors.set(fingerprint, {
      fingerprint,
      name: err.name,
      message,
      ...(stack ? { stack } : {}),
      ...(context.route ? { route: context.route } : {}),
      ...(context.digest ? { digest: context.digest } : {}),
      count: 1,
      firstSeen: at,
      lastSeen: at,
    });
  }

  /** Returns everything recorded since the last call (or null if nothing was) and starts a new window. */
  drain(): TelemetryBatch | null {
    const end = this.now();
    const batch: TelemetryBatch = {
      version: 1,
      project: this.options.project,
      service: this.options.service,
      env: this.options.env,
      ...(this.options.release ? { release: this.options.release } : {}),
      instance: this.instance,
      window: { start: this.windowStart.toISOString(), end: end.toISOString() },
      routes: [...this.routes.values()],
      errors: [...this.errors.values()],
    };
    this.routes.clear();
    this.errors.clear();
    this.windowStart = end;
    return batch.routes.length === 0 && batch.errors.length === 0 ? null : batch;
  }

  /** Puts a batch that failed to send back, so it goes out with the next one. */
  restore(batch: TelemetryBatch): void {
    for (const r of batch.routes) {
      const s = this.routes.get(r.route);
      if (!s) {
        if (this.routes.size < MAX_ROUTES) this.routes.set(r.route, { ...r, buckets: [...r.buckets] });
        continue;
      }
      s.count += r.count;
      s.errors += r.errors;
      s.clientErrors += r.clientErrors;
      s.durationSumMs += r.durationSumMs;
      s.durationMaxMs = Math.max(s.durationMaxMs, r.durationMaxMs);
      s.buckets = s.buckets.map((n, i) => n + (r.buckets[i] ?? 0));
    }
    for (const e of batch.errors) {
      const s = this.errors.get(e.fingerprint);
      if (s) {
        s.count += e.count;
        if (e.firstSeen < s.firstSeen) s.firstSeen = e.firstSeen;
      } else if (this.errors.size < MAX_ERRORS) this.errors.set(e.fingerprint, { ...e });
    }
    const start = new Date(batch.window.start);
    if (start < this.windowStart) this.windowStart = start;
  }
}

/**
 * Turns a concrete URL path into a route pattern when the framework did not give us one,
 * so `/api/users/8f3a…` and `/api/users/91bc…` count as one route.
 */
export function normalizePath(path: string): string {
  const clean = path.split("?")[0]?.split("#")[0] || "/";
  return (
    clean
      .split("/")
      .map((seg) =>
        /^\d+$/.test(seg) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) ||
        /^[0-9a-f]{12,}$/i.test(seg) ||
        /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(seg) ||
        (/^[A-Za-z0-9_-]{20,}$/.test(seg) && /\d/.test(seg))
          ? "[id]"
          : seg,
      )
      .join("/") || "/"
  );
}

/** Removes emails, JWTs and obvious credentials from error text before it leaves the app. */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]")
    .replace(
      /\b(Bearer|token|api[_-]?key|secret|password)(["']?\s*[=:]\s*["']?|\s+)[^\s"',;]+/gi,
      "$1$2[redacted]",
    );
}

/**
 * Same error from the same place → same fingerprint. Numbers and ids in the message are
 * masked so "user 123 not found" and "user 456 not found" group together.
 */
export function fingerprintOf(name: string, message: string, stack?: string, route?: string): string {
  const normalizedMessage = message
    .replace(/[0-9a-f]{8,}/gi, "x")
    .replace(/\d+/g, "#")
    .slice(0, 200);
  const frame =
    stack
      ?.split("\n")
      .find((line) => line.trim().startsWith("at "))
      ?.replace(/:\d+:\d+\)?$/, "")
      .replace(/\?[^)\s]*/, "")
      .trim() ?? "";
  return hash64([name, normalizedMessage, frame, route ?? ""].join("|"));
}

/**
 * 64-bit hash as 16 hex chars, from two 32-bit FNV-1a passes with different offsets. Plain JS
 * without BigInt or `node:crypto`, so it bundles for any runtime and any TS target. Not
 * cryptographic; it only has to group identical errors.
 */
export function hash64(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "object" && value && "message" in value) {
    const e = new Error(String((value as { message: unknown }).message));
    e.name = String((value as { name?: unknown }).name ?? "Error");
    return e;
  }
  return new Error(String(value));
}
