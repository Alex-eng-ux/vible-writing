'use server';

import { prisma } from '@/lib/db';
import { safeJsonParse, safeJsonStringify } from '@/lib/json';
import { generateOutline } from '@/lib/ai/service';
import { UserError } from '@/lib/errors';
import type { CreativeBrief, ChapterOutline } from '@/types/domain';
import {
  parseInput,
  generateOutlineActionSchema,
  updateChapterOutlineActionSchema,
} from '@/lib/validation';
import {
  revalidateProject,
  requireProjectOwner,
  requireChapterOwner,
} from './_shared';

export async function generateOutlineAction(projectId: string, totalChapters = 8, opts: { confirmReplace?: boolean } = {}) {
  parseInput(
    { projectId, totalChapters, opts },
    generateOutlineActionSchema,
    'generateOutlineAction'
  );
  await requireProjectOwner(projectId);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new UserError('Project not found', 'project_not_found');
  // `totalChapters` is already constrained to [3, 50] by
  // `generateOutlineActionSchema`. The clamp below is a defense-in-depth
  // guard for older client payloads that may bypass zod (e.g. a future
  // non-form Action call).
  const safeTotal = Math.max(3, Math.min(50, Number(totalChapters) || 8));
  const brief = safeJsonParse<CreativeBrief | null>(project.brief, null);
  if (!brief) throw new UserError('请先优化提示词', 'optimize_prompt_first');

  // Refuse to silently destroy existing chapter content unless the caller confirms.
  const existing = await prisma.chapter.findMany({
    where: { projectId },
    select: { id: true, chapterNumber: true, title: true },
  });
  if (existing.length > 0 && !opts.confirmReplace) {
    throw new UserError(
      `当前项目已有 ${existing.length} 个章节，重新生成会清空所有已写正文。请先在新 UI 中确认覆盖。`,
      'confirm_replace_required'
    );
  }

  const { chapters } = await generateOutline(brief, safeTotal);

  // Replace existing chapters atomically: delete + createMany in one transaction.
  await prisma.$transaction(async (tx) => {
    if (existing.length > 0) {
      await tx.chapter.deleteMany({ where: { projectId } });
    }
    await tx.chapter.createMany({
      data: chapters.map((c) => ({
        projectId,
        chapterNumber: c.chapterNumber,
        title: c.title,
        outline: safeJsonStringify({
          goal: c.goal,
          summary: c.summary,
          requiredBeats: c.requiredBeats,
          relatedCharacters: c.relatedCharacters,
          relatedForeshadowing: c.relatedForeshadowing,
        }),
        status: 'draft',
      })),
    });
  });

  // Re-read so the client receives the real database IDs.
  const created = await prisma.chapter.findMany({
    where: { projectId },
    orderBy: { chapterNumber: 'asc' },
  });

  revalidateProject(projectId);
  return created.map((c) => ({
    id: c.id,
    chapterNumber: c.chapterNumber,
    title: c.title,
  }));
}

export async function updateChapterOutlineAction(
  chapterId: string,
  outline: ChapterOutline
) {
  parseInput(
    { chapterId, outline },
    updateChapterOutlineActionSchema,
    'updateChapterOutlineAction'
  );
  await requireChapterOwner(chapterId);
  // Cap each string array to keep DB row small and prevent resource amplification.
  const MAX_BEATS = 50;
  const MAX_BEAT_LEN = 500;
  const MAX_RELATED = 30;
  const MAX_RELATED_LEN = 200;
  const trim = (arr: string[] | undefined, maxLen: number, each: number) =>
    (arr ?? [])
      .filter((s) => typeof s === 'string')
      .slice(0, maxLen)
      .map((s) => s.slice(0, each));
  const safeOutline: ChapterOutline = {
    goal: String(outline.goal || '').slice(0, MAX_BEAT_LEN * 4),
    summary: String(outline.summary || '').slice(0, MAX_BEAT_LEN * 4),
    requiredBeats: trim(outline.requiredBeats, MAX_BEATS, MAX_BEAT_LEN),
    relatedCharacters: trim(outline.relatedCharacters, MAX_RELATED, MAX_RELATED_LEN),
    relatedForeshadowing: trim(outline.relatedForeshadowing, MAX_RELATED, MAX_RELATED_LEN),
  };
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { outline: safeJsonStringify(safeOutline) },
  });
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (chapter) revalidateProject(chapter.projectId);
}
