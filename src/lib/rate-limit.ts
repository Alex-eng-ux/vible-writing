// In-memory token-bucket rate limiter for Next.js middleware.
//
// Goals (MVP):
//   - Cheap, zero-dependency, runs in the edge runtime.
//   - One bucket per "subject": for now we key on the client IP, but the
//     `subjectFor(req)` hook makes it trivial to add per-user keying
//     later (e.g. when a real session cookie is present).
//   - `allow(subject)` returns a `RateLimitDecision` with the verdict
//     plus a `Retry-After`-style hint so the middleware can surface
//     429s with sane backoff to the client.
//
// Limitations to know about:
//   - **In-memory only.** Each lambda / worker has its own bucket, so
//     the effective limit is N×bucket across the deployment. For a
//     single-user MVP this is fine; a multi-instance deploy needs a
//     shared store (Redis, Upstash, Cloudflare KV).
//   - **Per-process state is wiped on cold start.** A bursty attacker
//     can intentionally trigger cold starts to reset the limit; for
//     MVP we accept this.
//   - **No clock skew handling** beyond a 1-second safety margin.
//
// The data structure is `Map<subject, BucketState>` with a periodic
// prune so the map can't grow without bound under churn.

export interface RateLimitConfig {
  /** Tokens added per second. Defaults to 1 (= 60 req/min steady). */
  refillPerSecond?: number;
  /** Maximum bucket size (= burst capacity). Defaults to 20. */
  burst?: number;
  /** Map entries older than this are pruned. Defaults to 10 min. */
  pruneAfterMs?: number;
}

export type RateLimitDecision =
  | { ok: true; remaining: number; resetMs: number }
  | { ok: false; remaining: 0; retryAfterMs: number };

interface BucketState {
  tokens: number;
  /** Wall-clock ms when this bucket was last touched. */
  updatedAt: number;
}

const DEFAULTS: Required<RateLimitConfig> = {
  refillPerSecond: 1,
  burst: 20,
  pruneAfterMs: 10 * 60_000,
};

const buckets = new Map<string, BucketState>();

/**
 * Derive a stable per-client subject from a request. Today this is the
 * IP; once we have a real session cookie we can mix that in.
 */
export function subjectFor(req: Request): string {
  // `x-forwarded-for` first (CDN/Proxy), then `x-real-ip`, then remote.
  // Edge runtimes give us `req.headers` only — there's no `remoteAddress`
  // at the middleware layer, so we MUST rely on the headers being set
  // honestly by the edge gateway.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return `ip:${first}`;
  }
  const xri = req.headers.get('x-real-ip');
  if (xri) return `ip:${xri}`;
  return 'ip:unknown';
}

/**
 * Try to consume one token from the bucket for `subject`. Returns
 * whether the request is allowed and a hint for the caller.
 */
export function allow(
  subject: string,
  config: RateLimitConfig = {},
  now: number = Date.now()
): RateLimitDecision {
  const cfg = { ...DEFAULTS, ...config };
  const state = buckets.get(subject);
  const elapsedMs = state ? now - state.updatedAt : 0;
  const refilled = state
    ? Math.min(cfg.burst, state.tokens + (elapsedMs / 1000) * cfg.refillPerSecond)
    : cfg.burst;
  if (refilled >= 1) {
    buckets.set(subject, { tokens: refilled - 1, updatedAt: now });
    return {
      ok: true,
      remaining: Math.floor(refilled - 1),
      resetMs: 0,
    };
  }
  // Not enough tokens: how long until one more is available?
  const deficit = 1 - refilled;
  const retryAfterMs = Math.max(1, Math.ceil((deficit / cfg.refillPerSecond) * 1000));
  if (state) {
    buckets.set(subject, { tokens: refilled, updatedAt: now });
  } else {
    buckets.set(subject, { tokens: 0, updatedAt: now });
  }
  return { ok: false, remaining: 0, retryAfterMs };
}

/**
 * Remove buckets that have not been touched for the configured TTL.
 * Called by middleware to keep the map bounded under churn.
 */
export function prune(config: RateLimitConfig = {}, now: number = Date.now()) {
  const cfg = { ...DEFAULTS, ...config };
  for (const [key, state] of buckets) {
    if (now - state.updatedAt > cfg.pruneAfterMs) buckets.delete(key);
  }
}

/** Test-only: clear all bucket state. */
export function _resetForTests() {
  buckets.clear();
}
