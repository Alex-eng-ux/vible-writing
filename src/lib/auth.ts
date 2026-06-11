// Cookie-based session helpers.
//
// This is the smallest possible auth surface that closes the IDOR gap
// (any authenticated user can touch any project). It deliberately does
// NOT introduce NextAuth, OAuth, or password handling yet — see
// `docs/auth-design.md` for the upgrade path. The two things we need
// today are:
//
//   1. `currentUserId()` — read the signed cookie, throw if missing.
//   2. `requireProjectOwner(projectId)` — currentUserId + project owner
//      check, throw if not the owner.
//
// Both throw `UserError` so the existing error pipeline (formatUserFacingError
// → toast) keeps working unchanged.

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { UserError } from '@/lib/errors';

const SESSION_COOKIE = 'vible_uid';
// 30 days. Long enough for an MVP demo, short enough that a forgotten
// dev cookie doesn't grant access for a year.
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Read the current user id from the session cookie. Throws `UserError`
 * (`unauthorized`) if no cookie is present. Does NOT verify the user
 * actually exists in the DB — that check is folded into
 * `requireProjectOwner` (and into any page that needs a User row).
 */
export function currentUserId(): string {
  const c = cookies().get(SESSION_COOKIE);
  if (!c?.value) {
    throw new UserError('请先登录后再操作。', 'unauthorized');
  }
  return c.value;
}

/**
 * Verify the current user is the owner of the project. Throws:
 *   - `UserError('unauthorized')` if no session cookie
 *   - `UserError('project_not_found')` if the project doesn't exist
 *   - `UserError('forbidden')` if the current user is not the owner
 *
 * Use as the very first line of any server action that touches a
 * project. Returns the project row so callers don't have to re-fetch.
 */
export async function requireProjectOwner(projectId: string) {
  const userId = currentUserId();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });
  if (!project) {
    throw new UserError('项目不存在或已被删除。', 'project_not_found');
  }
  if (project.ownerId !== userId) {
    throw new UserError('您没有访问此项目的权限。', 'forbidden');
  }
  return { userId, project };
}

/**
 * Start a session for the given user. Sets the cookie via the response
 * API. This is the dev-only path; production should use a signed token
 * (NextAuth JWT, Lucia, etc.). Kept synchronous so it composes cleanly
 * with route handlers.
 */
export function signInAs(userId: string): void {
  cookies().set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * End the current session. Idempotent — safe to call when no cookie
 * is set.
 */
export function signOut(): void {
  cookies().delete(SESSION_COOKIE);
}

/**
 * Look up the current user. Returns `null` (not an error) when no
 * session is active. Useful for UI components that want to render a
 * "Log in" link rather than crashing.
 */
export async function getCurrentUser() {
  const c = cookies().get(SESSION_COOKIE);
  if (!c?.value) return null;
  return prisma.user.findUnique({ where: { id: c.value } });
}

/**
 * Get-or-create a user by display name. Used by the dev-only "log in
 * as <name>" flow. Not exposed in production builds.
 */
export async function getOrCreateDevUser(name: string): Promise<{ id: string; name: string }> {
  if (process.env.NODE_ENV === 'production') {
    throw new UserError('开发登录入口在生产环境已禁用。', 'dev_login_disabled');
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new UserError('请输入用户名。', 'validation_failed');
  }
  const existing = await prisma.user.findFirst({ where: { name: trimmed } });
  if (existing) return { id: existing.id, name: existing.name };
  return prisma.user.create({ data: { name: trimmed } });
}
