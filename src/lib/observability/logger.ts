import { trace } from "@opentelemetry/api";
import { createRedactor } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Google Cloud Logging reads `severity`, so App Hosting / Cloud Run logs get the right level. */
const SEVERITY: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

export type LogFields = Record<string, unknown>;
export type LogSink = (line: string, level: LogLevel) => void;

export interface LoggerOptions {
  /** Service name, e.g. `sciencewerx-web`. Use the same value you pass to `initTelemetry`. */
  service: string;
  env?: string;
  version?: string;
  /** Minimum level written. Defaults to `LOG_LEVEL`, or `info`. */
  level?: LogLevel;
  /** Extra field names to redact on top of the defaults. */
  redactKeys?: string[];
  /** Where lines go. Defaults to stdout (debug/info) and stderr (warn/error). */
  sink?: LogSink;
  /** Fields added to every line. */
  bindings?: LogFields;
  /** Clock override for tests. */
  now?: () => Date;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fieldsOrError?: LogFields | unknown): void;
  /** A logger that adds `bindings` to every line. */
  child(bindings: LogFields): Logger;
}

const defaultSink: LogSink = (line, level) => {
  if (level === "warn" || level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

function resolveLevel(level: string | undefined): LogLevel {
  return level && level in LEVEL_RANK ? (level as LogLevel) : "info";
}

export function createLogger(options: LoggerOptions): Logger {
  const minRank = LEVEL_RANK[options.level ?? resolveLevel(process.env.LOG_LEVEL)];
  const redact = createRedactor(options.redactKeys);
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());

  const base: LogFields = { service: options.service };
  if (options.env) base.env = options.env;
  if (options.version) base.version = options.version;

  const build = (bindings: LogFields): Logger => {
    const write = (level: LogLevel, msg: string, fields?: LogFields) => {
      if (LEVEL_RANK[level] < minRank) return;

      const entry: LogFields = {
        time: now().toISOString(),
        level,
        severity: SEVERITY[level],
        msg,
        ...base,
      };

      const spanContext = trace.getActiveSpan()?.spanContext();
      if (spanContext && spanContext.traceId !== "00000000000000000000000000000000") {
        entry.trace_id = spanContext.traceId;
        entry.span_id = spanContext.spanId;
      }

      const core = { ...entry };
      const extra = redact({ ...bindings, ...fields }) as LogFields;
      for (const [key, value] of Object.entries(extra)) {
        // Reserved keys stay as written above so lines are always parseable the same way.
        if (!(key in core)) entry[key] = value;
      }

      let line: string;
      try {
        line = JSON.stringify(entry);
      } catch {
        // e.g. a BigInt field: keep the line, drop the fields.
        line = JSON.stringify({ ...core, fields: "[Unserializable]" });
      }
      sink(line, level);
    };

    return {
      debug: (msg, fields) => write("debug", msg, fields),
      info: (msg, fields) => write("info", msg, fields),
      warn: (msg, fields) => write("warn", msg, fields),
      error: (msg, fieldsOrError) => {
        if (fieldsOrError instanceof Error) write("error", msg, { err: fieldsOrError });
        else if (fieldsOrError && typeof fieldsOrError === "object")
          write("error", msg, fieldsOrError as LogFields);
        else if (fieldsOrError !== undefined) write("error", msg, { err: fieldsOrError });
        else write("error", msg);
      },
      child: (more) => build({ ...bindings, ...more }),
    };
  };

  return build(options.bindings ?? {});
}
