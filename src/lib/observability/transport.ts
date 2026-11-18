import type { Collector, TelemetryBatch } from "./collector";

export interface Transport {
  send(batch: TelemetryBatch): Promise<void>;
}

/** POSTs batches to the ScienceWerx portal's /api/observability/ingest. */
export function httpTransport(url: string, token: string, fetchImpl: typeof fetch = fetch): Transport {
  return {
    async send(batch) {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const error = new Error(`observability ingest HTTP ${response.status}`) as Error & {
          status?: number;
        };
        error.status = response.status;
        throw error;
      }
    },
  };
}

export interface Flusher {
  /** Sends what has been collected. Never throws. */
  flush(): Promise<void>;
  /** Flushes soon (used after an error, so errors show up without waiting a full interval). */
  flushSoon(): void;
  stop(): void;
}

/**
 * Sends a batch every `intervalMs`. A failed send is put back and retried with the next
 * batch, except on 4xx (bad token, rejected batch), which drops it so a misconfigured app
 * does not keep growing its memory.
 */
export function startFlusher(
  collector: Collector,
  transport: Transport,
  options: {
    intervalMs?: number;
    soonMs?: number;
    onError?: (error: unknown) => void;
    /** Runs before each batch is taken, to move anything still held into the collector. */
    beforeFlush?: () => void;
  } = {},
): Flusher {
  const intervalMs = options.intervalMs ?? 60_000;
  const soonMs = options.soonMs ?? 10_000;
  let inFlight: Promise<void> | null = null;
  let soonTimer: ReturnType<typeof setTimeout> | null = null;
  let warned = false;

  const flush = (): Promise<void> => {
    if (inFlight) return inFlight;
    options.beforeFlush?.();
    const batch = collector.drain();
    if (!batch) return Promise.resolve();
    inFlight = transport
      .send(batch)
      .catch((error: unknown) => {
        const status = (error as { status?: number }).status;
        if (!(status && status >= 400 && status < 500)) collector.restore(batch);
        if (!warned) {
          warned = true;
          options.onError?.(error);
        }
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const interval = setInterval(() => void flush(), intervalMs);
  interval.unref?.();

  return {
    flush,
    flushSoon() {
      if (soonTimer) return;
      soonTimer = setTimeout(() => {
        soonTimer = null;
        void flush();
      }, soonMs);
      soonTimer.unref?.();
    },
    stop() {
      clearInterval(interval);
      if (soonTimer) clearTimeout(soonTimer);
    },
  };
}
