'use server';

import { getOrCreateBible } from '@/lib/bible';
import { prisma } from '@/lib/db';
import { UserError } from '@/lib/errors';
import { safeJsonParse } from '@/lib/json';
import type { ChapterOutline, CreativeBrief } from '@/types/domain';
import {
  parseInput,
  createChapterActionSchema,
  saveChapterActionSchema,
  getChapterActionSchema,
} from '@/lib/validation';
import {
  ALLOWED_CHAPTER_STATUS,
  revalidateProject,
  requireChapterOwner,
  requireProjectOwner,
} from './_shared';

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

export async function generateChapterAction(chapterId: string) {
  parseInput({ chapterId }, getChapterActionSchema, 'generateChapterAction');
  await requireChapterOwner(chapterId);

  const { generateChapter } = await import('@/lib/ai/service');
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) throw new UserError('Chapter not found', 'chapter_not_found');

  const project = await prisma.project.findUnique({ where: { id: chapter.projectId } });
  if (!project) throw new UserError('Project not found', 'project_not_found');

  const brief = safeJsonParse<CreativeBrief | null>(project.brief, null);
  const bible = await getOrCreateBible(project.id);
  const outline = safeJsonParse<ChapterOutline | null>(chapter.outline, null);
  const previousChapter = await prisma.chapter.findFirst({
    where: {
      projectId: project.id,
      chapterNumber: { lt: chapter.chapterNumber },
    },
    orderBy: { chapterNumber: 'desc' },
    select: { summary: true },
  });

  const { content, summary, mock } = await generateChapter({
    brief,
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    outline: outline ?? {
      goal: '',
      summary: '',
      requiredBeats: [],
      relatedCharacters: [],
      relatedForeshadowing: [],
    },
    previousChapterSummary: previousChapter?.summary || '',
    characters: bible.characters,
    locations: bible.locations,
    items: bible.items,
    worldRules: bible.worldRules,
    foreshadowing: bible.foreshadowing.filter((item) => item.status === 'active'),
    writingConstraints: brief?.writingConstraints ?? [],
  });

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      content,
      summary,
      status: 'generated',
    },
  });

  revalidateProject(project.id);
  return {
    chapter: {
      ...updated,
      outline: safeJsonParse<ChapterOutline | null>(updated.outline, null),
    },
    mock: !!mock,
  };
}

export async function continueChapterAction(chapterId: string) {
  parseInput({ chapterId }, getChapterActionSchema, 'continueChapterAction');
  await requireChapterOwner(chapterId);

  const { continueChapter } = await import('@/lib/ai/service');
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) throw new UserError('Chapter not found', 'chapter_not_found');

  const bible = await getOrCreateBible(chapter.projectId);
  const previousChapter = await prisma.chapter.findFirst({
    where: {
      projectId: chapter.projectId,
      chapterNumber: { lt: chapter.chapterNumber },
    },
    orderBy: { chapterNumber: 'desc' },
    select: { summary: true },
  });

  const { content, summary, mock } = await continueChapter({
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    existingContent: chapter.content,
    previousSummary: previousChapter?.summary || '',
    characters: bible.characters.map((item) => ({
      name: item.name,
      description: item.description,
      status: item.status,
    })),
  });

  const nextContent = chapter.content + content;
  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      content: nextContent,
      summary,
    },
  });

  revalidateProject(chapter.projectId);
  return {
    chapter: {
      ...updated,
      outline: safeJsonParse<ChapterOutline | null>(updated.outline, null),
    },
    mock: !!mock,
  };
}

export async function polishChapterAction(
  chapterId: string,
  target: 'selection' | 'full',
  selectionText?: string
) {
  parseInput({ chapterId }, getChapterActionSchema, 'polishChapterAction');
  await requireChapterOwner(chapterId);

  const { polishText } = await import('@/lib/ai/service');
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) throw new UserError('Chapter not found', 'chapter_not_found');

  if (target === 'selection' && !selectionText?.trim()) {
    throw new UserError('请先选中要润色的段落。', 'selection_required');
  }

  const sourceText = target === 'selection' ? selectionText!.trim() : chapter.content;
  const { content, mock } = await polishText({ text: sourceText, mode: target });

  let nextContent = content;
  if (target === 'selection') {
    if (chapter.content.split(selectionText as string).length !== 2) {
      throw new UserError('选中的内容已经变化，请重新选择后再试。', 'selection_stale');
    }
    nextContent = chapter.content.split(selectionText as string).join(content);
  }

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: { content: nextContent },
  });

  revalidateProject(chapter.projectId);
  return {
    chapter: {
      ...updated,
      outline: safeJsonParse<ChapterOutline | null>(updated.outline, null),
    },
    mock: !!mock,
  };
}