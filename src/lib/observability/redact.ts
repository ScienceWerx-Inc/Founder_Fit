/** Keys whose values are never written to logs. Matching ignores case and `-`/`_`. */
export const DEFAULT_REDACT_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authorization",
  "cookie",
  "setcookie",
  "apikey",
  "privatekey",
  "clientsecret",
  "cardnumber",
  "cvv",
  "ssn",
] as const;

export const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;

const normalize = (key: string) => key.toLowerCase().replace(/[-_]/g, "");

export function createRedactor(extraKeys: readonly string[] = []) {
  const keys = new Set([...DEFAULT_REDACT_KEYS, ...extraKeys].map(normalize));

  const walk = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Error) return serializeError(value, (v) => walk(v, depth + 1, seen));
    if (value instanceof Date) return value.toISOString();
    if (seen.has(value)) return "[Circular]";
    if (depth >= MAX_DEPTH) return "[Truncated]";
    seen.add(value);

    if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1, seen));

    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = keys.has(normalize(key)) ? REDACTED : walk(inner, depth + 1, seen);
    }
    return out;
  };

  return (value: unknown) => walk(value, 0, new WeakSet());
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: unknown;
  cause?: unknown;
}

export function serializeError(
  error: Error,
  mapCause: (cause: unknown) => unknown = (c) => c,
): SerializedError {
  const out: SerializedError = { name: error.name, message: error.message, stack: error.stack };
  const code = (error as { code?: unknown }).code;
  if (code !== undefined) out.code = code;
  if (error.cause !== undefined) out.cause = mapCause(error.cause);
  return out;
}
