import { type Attributes, type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Logger } from "./logger";
import { recordError as recordForDashboard } from "./runtime";

export const TRACER_NAME = "@sciencewerx-inc/observability";

export const getTracer = () => trace.getTracer(TRACER_NAME);

/**
 * Runs `fn` inside a new active span. The span ends when `fn` returns or its promise settles;
 * a thrown error is recorded on the span and rethrown.
 */
export function withSpan<T>(
  name: string,
  fn: (span: Span) => T,
  options: { attributes?: Attributes } = {},
): T {
  return getTracer().startActiveSpan(name, { attributes: options.attributes }, (span) => {
    const fail = (error: unknown) => {
      recordError(span, error);
      span.end();
      throw error;
    };

    let result: T;
    try {
      result = fn(span);
    } catch (error) {
      return fail(error);
    }

    if (result instanceof Promise) {
      return result.then(
        (value) => {
          span.end();
          return value;
        },
        (error) => fail(error),
      ) as T;
    }

    span.end();
    return result;
  });
}

function recordError(span: Span, error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error));
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
}

/**
 * Reports a handled error: logs it, marks the active span (if any) as failed and sends it
 * to the portal dashboard (once observability is started).
 * Use it where you catch an error and carry on; unhandled errors inside `withSpan` are recorded already.
 */
export function captureException(
  error: unknown,
  logger: Logger,
  context: { msg?: string; attributes?: Attributes } = {},
): void {
  const span = trace.getActiveSpan();
  if (span) {
    recordError(span, error);
    if (context.attributes) span.setAttributes(context.attributes);
  }
  logger.error(context.msg ?? "unhandled error", { err: error, ...context.attributes });
  recordForDashboard(error);
}
