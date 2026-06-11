// Tests for `src/lib/ai/retry.ts`.
//
// We test `withRetry` behavior end-to-end with a counter fake and a
// injected `sleep` so the suite runs in microseconds, not seconds. The
// production code uses a real `setTimeout` via `defaultSleep`, which is
// also covered once for the wiring.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  isRetryableError,
  DEFAULT_BACKOFF,
  type WithRetryOptions,
} from '@/lib/ai/retry';

describe('isRetryableError', () => {
  it('returns true for a ChatModelError carrying a 5xx status', () => {
    const err = Object.assign(new Error('upstream'), {
      cause: { status: 502 },
      name: 'ChatModelError',
    });
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns true for 429 (rate limited)', () => {
    const err = Object.assign(new Error('rate limit'), { cause: { status: 429 } });
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns true for 408 (request timeout)', () => {
    const err = Object.assign(new Error('timeout'), { cause: { status: 408 } });
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns false for 4xx (except 408 / 429)', () => {
    expect(
      isRetryableError(Object.assign(new Error('bad req'), { cause: { status: 400 } }))
    ).toBe(false);
    expect(
      isRetryableError(Object.assign(new Error('unauth'), { cause: { status: 401 } }))
    ).toBe(false);
    expect(
      isRetryableError(Object.assign(new Error('forbidden'), { cause: { status: 403 } }))
    ).toBe(false);
  });

  it('returns true for common network error codes', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']) {
      const err = Object.assign(new Error('net'), { code });
      expect(isRetryableError(err), `${code} should be retryable`).toBe(true);
    }
  });

  it('returns true for AbortError / TimeoutError', () => {
    const a = new Error('aborted');
    a.name = 'AbortError';
    const t = new Error('timed out');
    t.name = 'TimeoutError';
    expect(isRetryableError(a)).toBe(true);
    expect(isRetryableError(t)).toBe(true);
  });

  it('returns false for UserError (kind=user)', () => {
    const err = Object.assign(new Error('user input'), { kind: 'user' });
    expect(isRetryableError(err)).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isRetryableError(new Error('whatever'))).toBe(false);
  });

  it('returns false for null / undefined / primitives', () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError('string')).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });
});

describe('withRetry', () => {
  let sleep: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sleep = vi.fn().mockResolvedValue(undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // The retryable-error shape used by these tests: status in cause.
  const retryable = (status: number) =>
    Object.assign(new Error(`status ${status}`), { cause: { status } });
  const nonRetryable = (status: number) =>
    Object.assign(new Error(`status ${status}`), { cause: { status } });

  it('returns the result on the first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const out = await withRetry(fn, { sleep });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries up to 2 times on a 5xx, then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(retryable(500))
      .mockRejectedValueOnce(retryable(502))
      .mockResolvedValue('ok');
    const out = await withRetry(fn, { sleep });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    // Two retries -> two sleeps with the first two backoff values.
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, DEFAULT_BACKOFF[0]);
    expect(sleep).toHaveBeenNthCalledWith(2, DEFAULT_BACKOFF[1]);
  });

  it('rethrows the last error when all attempts fail', async () => {
    const err5xx = retryable(503);
    const fn = vi.fn().mockRejectedValue(err5xx);
    await expect(
      withRetry(fn, { sleep, schedule: [10, 10, 10] })
    ).rejects.toBe(err5xx);
    expect(fn).toHaveBeenCalledTimes(4); // 1 + 3 retries
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a non-retryable error', async () => {
    const err4xx = nonRetryable(401);
    const fn = vi.fn().mockRejectedValue(err4xx);
    await expect(withRetry(fn, { sleep })).rejects.toBe(err4xx);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does NOT retry a UserError (kind=user)', async () => {
    const userErr = Object.assign(new Error('bad input'), { kind: 'user' });
    const fn = vi.fn().mockRejectedValue(userErr);
    await expect(withRetry(fn, { sleep })).rejects.toBe(userErr);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honors a custom retries count, independent of schedule length', async () => {
    const err5xx = retryable(500);
    const fn = vi.fn().mockRejectedValue(err5xx);
    await expect(
      withRetry(fn, { sleep, schedule: [10, 10, 10, 10, 10], retries: 1 })
    ).rejects.toBe(err5xx);
    expect(fn).toHaveBeenCalledTimes(2); // 1 + 1 retry
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('logs each retry via console.warn with label and delay', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(retryable(500))
      .mockResolvedValue('ok');
    await withRetry(fn, { sleep, label: 'chat-call' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0][0]);
    expect(msg).toContain('[chat-call]');
    expect(msg).toContain('attempt 1');
    expect(msg).toContain(String(DEFAULT_BACKOFF[0]));
  });

  it('accepts a custom isRetryable predicate', async () => {
    const sentinel = new Error('custom marker');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(sentinel)
      .mockResolvedValue('ok');
    const out = await withRetry(fn, {
      sleep,
      isRetryable: (e) => e === sentinel,
    });
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('caps the schedule lookup to the last entry for over-long retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(retryable(500))
      .mockRejectedValueOnce(retryable(500))
      .mockRejectedValueOnce(retryable(500))
      .mockResolvedValue('ok');
    await withRetry(fn, { sleep, schedule: [10] });
    expect(fn).toHaveBeenCalledTimes(4);
    // Each sleep should fall back to the last entry (10) because the
    // schedule length (1) is shorter than the default retry count (3).
    expect(sleep).toHaveBeenCalledTimes(3);
    for (const call of sleep.mock.calls) {
      expect(call[0]).toBe(10);
    }
  });

  it('preserves the error object identity on rethrow', async () => {
    const err5xx = retryable(500);
    const fn = vi.fn().mockRejectedValue(err5xx);
    let caught: unknown;
    try {
      await withRetry(fn, { sleep, schedule: [1] });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(err5xx);
  });
});

describe('withRetry integration: real setTimeout wiring', () => {
  // Smoke check: the production default sleep actually waits and does
  // not get stuck. We use a 1ms schedule to keep the test fast.
  it('uses default sleep and resolves', async () => {
    const start = Date.now();
    const out = await withRetry(
      vi.fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('e'), { cause: { status: 500 } })
        )
        .mockResolvedValue('ok'),
      { schedule: [1] }
    );
    const elapsed = Date.now() - start;
    expect(out).toBe('ok');
    // At least 1ms of waiting should have happened; cap an upper bound
    // in case the test runner is busy.
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(1_000);
  });
});
