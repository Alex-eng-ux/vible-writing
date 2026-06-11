// Tests for `src/lib/errors.ts`.
//
// Coverage:
//   - UserError / InfraError constructors (name / code / kind / message)
//   - isUserError / isInfraError / isAppError predicates
//   - logError routes to console.error vs console.warn correctly
//   - formatUserFacingError returns the right message for every input shape
//
// These are the building blocks every action depends on, so a regression
// here would silently break error UX in production.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UserError,
  InfraError,
  isUserError,
  isInfraError,
  isAppError,
  logError,
  formatUserFacingError,
} from '@/lib/errors';

describe('UserError', () => {
  it('sets kind, name, code, and message', () => {
    const e = new UserError('something wrong', 'something_wrong');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(UserError);
    expect(e.kind).toBe('user');
    expect(e.name).toBe('UserError');
    expect(e.code).toBe('something_wrong');
    expect(e.message).toBe('something wrong');
  });

  it('defaults code to "user_error"', () => {
    const e = new UserError('msg');
    expect(e.code).toBe('user_error');
  });
});

describe('InfraError', () => {
  it('sets kind, name, code, devMessage, and user message', () => {
    const e = new InfraError('db blew up', '服务暂时不可用', 'db_down');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(InfraError);
    expect(e.kind).toBe('infra');
    expect(e.name).toBe('InfraError');
    expect(e.code).toBe('db_down');
    expect(e.devMessage).toBe('db blew up');
    expect(e.message).toBe('服务暂时不可用');
  });

  it('uses the default user message when none provided', () => {
    const e = new InfraError('dev only');
    expect(e.message).toBe('系统暂时无法处理请求，请稍后重试。');
    expect(e.code).toBe('infra_error');
  });

  it('preserves the cause', () => {
    const root = new Error('ECONNRESET');
    const e = new InfraError('llm call failed', 'AI 暂时不可用', 'llm_unexpected_error', root);
    expect(e.cause).toBe(root);
  });

  it('omits cause when undefined', () => {
    const e = new InfraError('dev only');
    expect('cause' in e).toBe(false);
  });
});

describe('predicates', () => {
  it('isUserError matches only UserError', () => {
    expect(isUserError(new UserError('x'))).toBe(true);
    expect(isUserError(new InfraError('x'))).toBe(false);
    expect(isUserError(new Error('x'))).toBe(false);
    expect(isUserError('plain string')).toBe(false);
    expect(isUserError(null)).toBe(false);
    expect(isUserError(undefined)).toBe(false);
  });

  it('isInfraError matches only InfraError', () => {
    expect(isInfraError(new InfraError('x'))).toBe(true);
    expect(isInfraError(new UserError('x'))).toBe(false);
    expect(isInfraError(new Error('x'))).toBe(false);
  });

  it('isAppError matches either typed error', () => {
    expect(isAppError(new UserError('x'))).toBe(true);
    expect(isAppError(new InfraError('x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe('logError', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('logs InfraError via console.error with devMessage and code', () => {
    const cause = new Error('ECONNRESET');
    logError('testAction', new InfraError('boom', '短', 'boom_code', cause));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('[testAction]');
    expect(String(errorSpy.mock.calls[0][0])).toContain('boom_code');
    expect(String(errorSpy.mock.calls[0][0])).toContain('boom');
    // cause is passed as a second arg
    expect(errorSpy.mock.calls[0][1]).toEqual({ cause });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs UserError via console.warn, not console.error', () => {
    logError('testAction', new UserError('bad input', 'bad'));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('bad');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs unknown errors via console.error', () => {
    logError('testAction', new Error('mystery'));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('UntypedError');
  });

  it('logs plain values without throwing', () => {
    expect(() => logError('testAction', 'a string')).not.toThrow();
    expect(() => logError('testAction', null)).not.toThrow();
    expect(() => logError('testAction', undefined)).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('formatUserFacingError', () => {
  it('returns the UserError message verbatim', () => {
    expect(formatUserFacingError(new UserError('user-facing text'))).toBe('user-facing text');
  });

  it('returns the InfraError.userMessage', () => {
    const e = new InfraError('dev only', 'AI 暂时不可用');
    expect(formatUserFacingError(e)).toBe('AI 暂时不可用');
  });

  it('falls back to a generic Error.message', () => {
    expect(formatUserFacingError(new Error('generic'))).toBe('generic');
  });

  it('falls back to a default Chinese string for non-Error values', () => {
    expect(formatUserFacingError(null)).toBe('出了点问题，请稍后再试。');
    expect(formatUserFacingError(undefined)).toBe('出了点问题，请稍后再试。');
    expect(formatUserFacingError('a raw string')).toBe('出了点问题，请稍后再试。');
    expect(formatUserFacingError({})).toBe('出了点问题，请稍后再试。');
  });

  it('accepts a custom fallback', () => {
    expect(formatUserFacingError(null, 'fallback!')).toBe('fallback!');
  });

  it('returns the fallback for an Error with empty message', () => {
    expect(formatUserFacingError(new Error(''))).toBe('出了点问题，请稍后再试。');
  });
});
