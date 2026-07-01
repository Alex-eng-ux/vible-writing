// Shared helpers used by every server action file under `src/app/actions/`.
//
// This file is NOT marked `'use server'` because it only re-exports the
// `revalidatePath` helper and a constant — it has no async exports. The
// `actions.ts` barrel re-exports each domain module, which carry their own
// `'use server'` directive.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { CHAPTER_STATUSES } from '@/lib/validation';
import { requireProjectOwner as requireProjectOwnerAuth } from '@/lib/auth';
import { UserError } from '@/lib/errors';

/**
 * Whitelist of allowed Chapter.status values. Derived from the canonical
 * tuple in `@/types/domain` (re-exported via `@/lib/validation`) so a single
 * edit keeps both the zod schema and this runtime set in sync.
 */
export const ALLOWED_CHAPTER_STATUS: ReadonlySet<string> = new Set(CHAPTER_STATUSES);
export const requireProjectOwner = requireProjectOwnerAuth;

/**
 * Revalidate every project-scoped route. Call after any mutation that
 * affects the project's data (project itself, chapters, bible, outline,
 * consistency reports, etc.).
 */
export function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/prompt`);
  revalidatePath(`/projects/${projectId}/bible`);
  revalidatePath(`/projects/${projectId}/outline`);
  revalidatePath(`/projects/${projectId}/chapters`);
  revalidatePath(`/projects/${projectId}/consistency`);
}

// ---------- Authorization helpers -----------------------------------------
//
// Each helper enforces the same chain: cookie → user → project owner.
// Use the most specific one available (requireChapterOwner for actions
// that take a chapterId) so we don't have to do an extra Project.findUnique
// in every action.

/**
 * Resolve a chapter to its owning project, then verify the current user
 * is the owner. Throws `chapter_not_found` if the chapter is missing
 * (caller does NOT have to check again) and `forbidden` if not the owner.
 */
export async function requireChapterOwner(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { projectId: true },
  });
  if (!chapter) {
    throw new UserError('章节不存在或已被删除。', 'chapter_not_found');
  }
  return requireProjectOwner(chapter.projectId);
}

/**
 * Same as `requireChapterOwner` but for a ConsistencyReport: report →
 * chapter → project → owner check.
 */
export async function requireReportOwner(reportId: string) {
  const report = await prisma.consistencyReport.findUnique({
    where: { id: reportId },
    select: { chapter: { select: { projectId: true } } },
  });
  if (!report) {
    throw new UserError('报告不存在或已被删除。', 'report_not_found');
  }
  return requireProjectOwner(report.chapter.projectId);
}
