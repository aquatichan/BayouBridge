// Small helpers shared by the agents. No SDK imports here so the coordinator
// (and the offline demo) never depends on the Anthropic client being loadable.

/** Why a document's Claude extraction was replaced by the rules engine. */
export type FallbackReason = "timeout" | "refusal" | "validation" | "error";

/** An extraction failure that already knows its fallback reason. */
export class ExtractionError extends Error {
  constructor(public reason: FallbackReason, message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export function fallbackReason(err: unknown): FallbackReason {
  if (err instanceof ExtractionError) return err.reason;
  if (err instanceof TimeoutError) return "timeout";
  return "error";
}

/**
 * Resolve with `p`, or reject with a TimeoutError after `ms`. The timer is
 * always cleared, so nothing keeps the dev server busy after the race ends.
 * If `signal` aborts first, rejects with its reason (or a plain abort error).
 */
export async function withTimeout<T>(p: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
    if (signal) {
      onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error(`${label} aborted`));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([p, limit]);
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}
