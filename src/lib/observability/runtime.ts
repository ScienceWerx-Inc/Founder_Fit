import type { Collector } from "./collector";
import type { Flusher } from "./transport";

/**
 * The running collector, shared through globalThis so every bundle of the app (route
 * handlers, server components, instrumentation) reports into the same one, and so Next.js
 * dev reloads do not start a second flusher. No Node imports here: it is safe in any runtime.
 */
export interface ObservabilityRuntime {
  collector: Collector;
  flusher: Flusher;
  project: string;
  service: string;
}

const KEY = Symbol.for("sciencewerx.observability");
type Holder = { [KEY]?: ObservabilityRuntime };

export function getRuntime(): ObservabilityRuntime | undefined {
  return (globalThis as Holder)[KEY];
}

export function setRuntime(runtime: ObservabilityRuntime | undefined): void {
  (globalThis as Holder)[KEY] = runtime;
}

/** Records a handled error for the dashboard. A no-op until observability is started. */
export function recordError(error: unknown, context: { route?: string; digest?: string } = {}): void {
  const runtime = getRuntime();
  if (!runtime) return;
  runtime.collector.recordError(error, context);
  runtime.flusher.flushSoon();
}
