// Cookie-based session helpers.
//
// This is the smallest possible auth surface that closes the IDOR gap
// (any authenticated user can touch any project). It deliberately does
// NOT introduce NextAuth, OAuth, or password handling yet.

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { UserError } from '@/lib/errors';

const SESSION_COOKIE = 'vible_uid';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const PRODUCTION_GUEST_NAME = 'Guest';

export function currentUserId(): string {
  const c = cookies().get(SESSION_COOKIE);
  if (!c?.value) {
    throw new UserError('请先登录后再操作。', 'unauthorized');
  }
  return c.value;
}

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

export function signInAs(userId: string): void {
  cookies().set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export function signOut(): void {
  cookies().delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const c = cookies().get(SESSION_COOKIE);
  if (!c?.value) return null;
  return prisma.user.findUnique({ where: { id: c.value } });
}

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

export async function getOrCreateProductionGuestUser(): Promise<{ id: string; name: string }> {
  const existing = await prisma.user.findFirst({ where: { name: PRODUCTION_GUEST_NAME } });
  if (existing) return { id: existing.id, name: existing.name };
  return prisma.user.create({ data: { name: PRODUCTION_GUEST_NAME } });
}
