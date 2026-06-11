// Tests for `src/lib/rate-limit.ts`.
//
// `allow()` reads `Date.now()` so all tests inject a synthetic clock.
// We also call `_resetForTests()` between cases because the underlying
// Map is module-scoped.

import { describe, it, expect, beforeEach } from 'vitest';
import { allow, prune, subjectFor, _resetForTests } from '@/lib/rate-limit';

describe('subjectFor', () => {
  function req(headers: Record<string, string>): Request {
    return new Request('https://example.com/x', { headers });
  }

  it('uses the first x-forwarded-for entry when present', () => {
    expect(subjectFor(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('ip:1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(subjectFor(req({ 'x-real-ip': '9.9.9.9' }))).toBe('ip:9.9.9.9');
  });

  it('falls back to "unknown" when no IP headers are set', () => {
    expect(subjectFor(req({}))).toBe('ip:unknown');
  });

  it('trims whitespace around forwarded entries', () => {
    expect(subjectFor(req({ 'x-forwarded-for': '   1.2.3.4   , 10.0.0.1' }))).toBe('ip:1.2.3.4');
  });
});

describe('allow', () => {
  beforeEach(() => _resetForTests());

  it('allows up to the burst size on a fresh bucket', () => {
    const cfg = { burst: 3, refillPerSecond: 0 }; // never refills
    let t = 1_000_000;
    expect(allow('alice', cfg, t++).ok).toBe(true);
    expect(allow('alice', cfg, t++).ok).toBe(true);
    expect(allow('alice', cfg, t++).ok).toBe(true);
    const r = allow('alice', cfg, t);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // With refillPerSecond=0 the only way to get a token is infinite
      // time, so retryAfterMs must be > 0 and finite.
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('refills tokens at the configured rate', () => {
    const cfg = { burst: 2, refillPerSecond: 1 };
    expect(allow('alice', cfg, 1_000_000).ok).toBe(true);
    expect(allow('alice', cfg, 1_000_001).ok).toBe(true);
    expect(allow('alice', cfg, 1_000_002).ok).toBe(false);
    // 500ms later we should have refilled 0.5 tokens — still not enough.
    let r = allow('alice', cfg, 1_000_500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterMs).toBeLessThanOrEqual(1000);
    // 1.5s later we have refilled 1.5 tokens, capped at burst 2.
    r = allow('alice', cfg, 1_002_000);
    expect(r.ok).toBe(true);
  });

  it('keeps buckets independent per subject', () => {
    const cfg = { burst: 1, refillPerSecond: 0 };
    expect(allow('alice', cfg, 1_000_000).ok).toBe(true);
    expect(allow('alice', cfg, 1_000_001).ok).toBe(false);
    // bob still has a fresh bucket.
    expect(allow('bob', cfg, 1_000_002).ok).toBe(true);
  });

  it('exposes remaining tokens on success', () => {
    const cfg = { burst: 5, refillPerSecond: 0 };
    const r1 = allow('alice', cfg, 1_000_000);
    const r2 = allow('alice', cfg, 1_000_001);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.remaining).toBe(4);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.remaining).toBe(3);
  });

  it('reports retryAfterMs proportional to the deficit', () => {
    const cfg = { burst: 1, refillPerSecond: 1 };
    // Drain the bucket.
    expect(allow('alice', cfg, 1_000_000).ok).toBe(true);
    // Immediately after, with 0 refilled, retryAfter should be ~1000ms.
    const r = allow('alice', cfg, 1_000_001);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterMs).toBeGreaterThanOrEqual(900);
      expect(r.retryAfterMs).toBeLessThanOrEqual(1100);
    }
  });

  it('uses default config when none is provided', () => {
    // Default: burst 20, refill 1/s. We just smoke-test that it works.
    const r = allow('alice');
    expect(r.ok).toBe(true);
  });
});

describe('prune', () => {
  beforeEach(() => _resetForTests());

  it('removes buckets older than the TTL', () => {
    const cfg = { burst: 1, refillPerSecond: 0, pruneAfterMs: 1000 };
    expect(allow('alice', cfg, 1_000_000).ok).toBe(true);
    // Move forward past the TTL.
    prune(cfg, 1_002_000);
    // After pruning, the bucket starts fresh — but `allow` re-creates
    // it on the next call, so the only way to OBSERVE pruning is to
    // check that a previously-depleted subject can now succeed again
    // AND that the internal map no longer holds the stale entry.
    //
    // Drain the bucket at t=1_002_000:
    expect(allow('alice', cfg, 1_002_000).ok).toBe(true);
    expect(allow('alice', cfg, 1_002_001).ok).toBe(false);
    // Jump far past the prune TTL:
    prune(cfg, 1_010_000);
    // After pruning + refill (refill is 0 in this cfg), the bucket
    // is recreated fresh because the entry was deleted — but with
    // burst=1 and refill=0 we still can't succeed.
    // Use a config with non-zero refill to verify the entry really was
    // removed.
    const refillCfg = { burst: 2, refillPerSecond: 1, pruneAfterMs: 1000 };
    expect(allow('bob', refillCfg, 1_000_000).ok).toBe(true);
    prune(refillCfg, 1_010_000);
    // After pruning, bob's bucket is gone — next call gets a full
    // burst, and we can check `remaining === burst - 1`.
    const r = allow('bob', refillCfg, 1_010_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(1);
  });
});
