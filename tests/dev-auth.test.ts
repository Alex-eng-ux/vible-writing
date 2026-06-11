// Tests for `src/app/actions/dev-auth.ts`.
//
// The two actions — `devSignInAction` and `devSignOutAction` — are
// wrappers around the auth helpers. We mock the helpers and the Next.js
// cache/navigation modules so the suite runs in pure JS.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInAs = vi.fn();
const signOut = vi.fn();
const getOrCreateDevUser = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((url: string) => {
  // Mimic Next.js' `redirect` by throwing a sentinel error.
  const e: Error & { __redirect?: string } = new Error(`NEXT_REDIRECT:${url}`);
  e.__redirect = url;
  throw e;
});

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/lib/auth', () => ({
  getOrCreateDevUser,
  signInAs,
  signOut,
}));

const { devSignInAction, devSignOutAction } = await import('@/app/actions/dev-auth');

function expectRedirect(err: unknown, expectedUrl: string) {
  expect(err).toBeInstanceOf(Error);
  expect((err as Error & { __redirect?: string }).__redirect).toBe(expectedUrl);
}

describe('devSignInAction', () => {
  beforeEach(() => {
    signInAs.mockReset();
    getOrCreateDevUser.mockReset();
    revalidatePath.mockReset();
    redirect.mockClear();
  });

  it('looks up the user by name, signs in, revalidates, and redirects to /', async () => {
    const user = { id: 'u1', name: 'alice' };
    getOrCreateDevUser.mockResolvedValue(user);
    const fd = new FormData();
    fd.set('name', '  alice  ');

    let caught: unknown;
    try {
      await devSignInAction(fd);
    } catch (e) {
      caught = e;
    }

    expect(getOrCreateDevUser).toHaveBeenCalledWith('alice');
    expect(signInAs).toHaveBeenCalledWith('u1');
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expectRedirect(caught, '/');
  });

  it('passes through a blank name unchanged', async () => {
    const user = { id: 'u2', name: '' };
    getOrCreateDevUser.mockResolvedValue(user);
    const fd = new FormData();
    fd.set('name', '   ');

    let caught: unknown;
    try {
      await devSignInAction(fd);
    } catch (e) {
      caught = e;
    }

    // `getOrCreateDevUser` itself rejects on blank names; the action
    // passes the (already-trimmed) empty string in. We don't assert on
    // its rejection here — just that the action forwards the input
    // exactly as it trimmed it.
    expect(getOrCreateDevUser).toHaveBeenCalledWith('');
    expect(caught).toBeDefined();
  });
});

describe('devSignOutAction', () => {
  beforeEach(() => {
    signOut.mockReset();
    revalidatePath.mockReset();
    redirect.mockClear();
  });

  it('signs out, revalidates, and redirects to /', async () => {
    let caught: unknown;
    try {
      await devSignOutAction();
    } catch (e) {
      caught = e;
    }
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expectRedirect(caught, '/');
  });
});
