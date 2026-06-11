// Retry / backoff helper for outbound LLM calls.
//
// Goals:
//   - Retry on **transient** failures only (5xx, 429, network / DNS / timeout).
//   - Never retry `UserError` — that's a domain failure, retrying won't help.
//   - Exponential backoff with light jitter so concurrent requests don't
//     synchronize their retries and DDoS the upstream.
//   - Default 3 attempts (1 initial + 2 retries). Configurable.
//   - Surface every retry attempt to the server log so operators can see
//     when the upstream is wobbling.
//
// This module is pure and has no I/O of its own — it only orchestrates
// caller-provided async work. That makes it easy to unit-test with a
// counter fake.

/**
 * Backoff schedule. The i-th retry waits `schedule[i]` ms. Length of the
 * array defines the max number of retries (NOT counting the initial
 * attempt). Defaults to 3 retries at 200 / 500 / 1,250 ms.
 */
export type BackoffSchedule = readonly number[];

export const DEFAULT_BACKOFF: BackoffSchedule = Object.freeze([200, 500, 1_250]);

export interface WithRetryOptions {
  /** How many retries (NOT counting the initial attempt). Default: schedule length. */
  retries?: number;
  /** Wait schedule in milliseconds. */
  schedule?: BackoffSchedule;
  /** Predicate: should this error be retried? Default: `isRetryableError`. */
  isRetryable?: (err: unknown) => boolean;
  /** Override the wall clock (tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Caller label for log messages. */
  label?: string;
}

/**
 * Decide whether a thrown error is worth retrying. The shape we inspect is
 * specific to `ChatModelError` (see `./providers/types.ts`) and a small
 * set of well-known transient Node / network errors.
 *
 * IMPORTANT: when adding new transient shapes here, also add a test in
 * `tests/retry.test.ts`. The default behavior must remain conservative
 * (don't retry what we don't recognize) — silent over-retry is worse
 * than fast failure.
 */
export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  // Domain errors are never retried.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((err as any).kind === 'user') return false;

  // ChatModelError: inspect the embedded status code when present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cause = (err as any).cause;
  if (cause && typeof cause === 'object') {
    const status = (cause as { status?: unknown }).status;
    if (typeof status === 'number') {
      // 5xx: server error, retry.
      // 429: rate limited, retry (with longer backoff at the caller's
      //      discretion).
      if (status >= 500 || status === 429) return true;
      // 408 Request Timeout also retryable.
      if (status === 408) return true;
      // 4xx: not retryable.
      if (status >= 400) return false;
    }
  }

  // Common Node network error codes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (err as any).code as string | undefined;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' || code === 'ECONNREFUSED') {
    return true;
  }

  // AbortError (timeout via AbortSignal.timeout).
  if ((err as Error).name === 'AbortError' || (err as Error).name === 'TimeoutError') {
    return true;
  }

  return false;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn` and retry it on transient errors according to `opts`.
 *
 * Throws the **last** error seen if every attempt fails. The original
 * `cause` chain is preserved by re-throwing the exact same Error object
 * the caller threw (so `InfraError.cause` and `ChatModelError.cause`
 * survive intact).
 *
 * On every retry, a `console.warn` is emitted with the attempt number,
 * the delay that was about to be applied, and a sanitized hint of the
 * error message. The full error object is NOT logged here — callers
 * usually log it themselves at the boundary (`logError`).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOptions = {}
): Promise<T> {
  const schedule = opts.schedule ?? DEFAULT_BACKOFF;
  const totalRetries = opts.retries ?? schedule.length;
  const isRetryable = opts.isRetryable ?? isRetryableError;
  const sleep = opts.sleep ?? defaultSleep;
  const label = opts.label ?? 'withRetry';

  let lastError: unknown;
  for (let attempt = 0; attempt <= totalRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === totalRetries) break;
      if (!isRetryable(err)) break;
      const delay = schedule[Math.min(attempt, schedule.length - 1)];
      // eslint-disable-next-line no-console
      console.warn(
        `[${label}] attempt ${attempt + 1} failed, retrying in ${delay}ms`,
        { message: (err as Error)?.message ?? String(err) }
      );
      await sleep(delay);
    }
  }
  throw lastError;
}
