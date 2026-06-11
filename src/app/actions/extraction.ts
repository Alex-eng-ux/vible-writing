'use server';

import { prisma } from '@/lib/db';
import { safeJsonParse, safeJsonStringify } from '@/lib/json';
import { getOrCreateBible } from '@/lib/bible';
import { UserError } from '@/lib/errors';
import type { CreativeBrief } from '@/types/domain';
import {
  parseInput,
  extractFactsActionSchema,
  listFactExtractionsActionSchema,
} from '@/lib/validation';
import { revalidateProject, requireChapterOwner } from './_shared';

export async function extractFactsAction(chapterId: string) {
  parseInput({ chapterId }, extractFactsActionSchema, 'extractFactsAction');
  await requireChapterOwner(chapterId);
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) throw new UserError('Chapter not found', 'chapter_not_found');
  const project = await prisma.project.findUnique({ where: { id: chapter.projectId } });
  const brief = safeJsonParse<CreativeBrief | null>(project?.brief || null, null);
  // F-D5: surface existing bible names so the LLM can be told to skip
  // duplicates instead of re-emitting characters we already track.
  const bible = project ? await getOrCreateBible(project.id) : null;
  const existingNames = bible
    ? {
        characters: bible.characters.map((r) => r.name),
        locations: bible.locations.map((r) => r.name),
        items: bible.items.map((r) => r.name),
        worldRules: bible.worldRules.map((r) => r.name),
        foreshadowing: bible.foreshadowing.map((r) => r.name),
      }
    : null;

  const { extractFacts } = await import('@/lib/ai/service');
  const { payload, mock } = await extractFacts({
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    content: chapter.content,
    brief,
    existingNames: existingNames ?? undefined,
  });

  const extraction = await prisma.factExtraction.create({
    data: {
      chapterId,
      payload: safeJsonStringify(payload),
      status: 'pending',
    },
  });

  revalidateProject(chapter.projectId);
  return { id: extraction.id, payload, mock: !!mock };
}

export async function listFactExtractionsAction(chapterId: string) {
  parseInput({ chapterId }, listFactExtractionsActionSchema, 'listFactExtractionsAction');
  await requireChapterOwner(chapterId);
  return prisma.factExtraction.findMany({
    where: { chapterId },
    orderBy: { createdAt: 'desc' },
  });
}
