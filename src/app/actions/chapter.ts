'use server';

import { prisma } from '@/lib/db';
import { safeJsonParse } from '@/lib/json';
import type { ChapterOutline } from '@/types/domain';
import {
  parseInput,
  createChapterActionSchema,
  saveChapterActionSchema,
  getChapterActionSchema,
} from '@/lib/validation';
import { ALLOWED_CHAPTER_STATUS, revalidateProject } from './_shared';

export async function createChapterAction(projectId: string, formData: FormData) {
  const raw = {
    projectId,
    title: String(formData.get('title') || '').trim() || '新章节',
  };
  const { title } = parseInput(raw, createChapterActionSchema, 'createChapterAction');
  await requireProjectOwner(projectId);
  const last = await prisma.chapter.findFirst({
    where: { projectId },
    orderBy: { chapterNumber: 'desc' },
  });
  const chapterNumber = (last?.chapterNumber || 0) + 1;
  const chapter = await prisma.chapter.create({
    data: { projectId, chapterNumber, title, status: 'draft' },
  });
  revalidateProject(projectId);
  return chapter;
}

export async function saveChapterAction(
  chapterId: string,
  data: { title?: string; content?: string; summary?: string; status?: string }
) {
  parseInput({ chapterId, data }, saveChapterActionSchema, 'saveChapterAction');
  await requireChapterOwner(chapterId);
  // zod has already enforced title (1-200) / summary (<= 2,000) / content (<= 1,000,000) /
  // status (CHAPTER_STATUSES). The `ALLOWED_CHAPTER_STATUS` check below is a
  // defense-in-depth guard against an older client payload slipping past zod
  // (e.g. a future "saveAnyStatus" code path). Keep it, but treat a mismatch
  // as "drop the field", not as a hard error.
  const safeData = {
    ...data,
    status: data.status && ALLOWED_CHAPTER_STATUS.has(data.status) ? data.status : undefined,
  };
  const chapter = await prisma.chapter.update({
    where: { id: chapterId },
    data: safeData,
  });
  revalidateProject(chapter.projectId);
  return chapter;
}

export async function getChapterAction(chapterId: string) {
  parseInput({ chapterId }, getChapterActionSchema, 'getChapterAction');
  await requireChapterOwner(chapterId);
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) return null;
  return {
    ...chapter,
    outline: safeJsonParse<ChapterOutline | null>(chapter.outline, null),
  };
}
