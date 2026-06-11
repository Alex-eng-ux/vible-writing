'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { safeJsonParse, safeJsonStringify } from '@/lib/json';
import { getOrCreateBible } from '@/lib/bible';
import { optimizePrompt, generateStoryFoundation } from '@/lib/ai/service';
import { currentUserId } from '@/lib/auth';
import { UserError } from '@/lib/errors';
import type { CreativeBrief, ChapterOutline } from '@/types/domain';
import {
  parseInput,
  createProjectSchema,
  listProjectsActionSchema,
  getProjectActionSchema,
  getProjectDetailActionSchema,
  optimizePromptActionSchema,
  adoptBriefActionSchema,
} from '@/lib/validation';
import { revalidateProject, requireProjectOwner } from './_shared';

export async function createProjectAction(formData: FormData) {
  const raw = {
    rawIdea: String(formData.get('rawIdea') || '').trim(),
    title: String(formData.get('title') || '').trim() || '未命名作品',
    genre: String(formData.get('genre') || '').trim() || null,
    targetLength: String(formData.get('targetLength') || '').trim() || null,
    stylePreference: String(formData.get('stylePreference') || '').trim() || null,
  };
  const { rawIdea, title, genre, targetLength, stylePreference } = parseInput(
    raw,
    createProjectSchema,
    'createProjectAction'
  );
  const ownerId = currentUserId();

  const project = await prisma.project.create({
    data: {
      title,
      rawIdea,
      genre,
      targetLength,
      stylePreference,
      ownerId,
    },
  });
  revalidatePath('/');
  redirect(`/projects/${project.id}/prompt`);
}

export async function listProjectsAction() {
  parseInput(undefined, listProjectsActionSchema, 'listProjectsAction');
  const ownerId = currentUserId();
  // Filter by owner so a logged-in user only sees their own projects.
  return prisma.project.findMany({
    where: { ownerId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { chapters: true } } },
  });
}

export async function getProjectAction(projectId: string) {
  parseInput({ projectId }, getProjectActionSchema, 'getProjectAction');
  await requireProjectOwner(projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { chapters: { orderBy: { chapterNumber: 'asc' } } },
  });
  if (!project) return null;
  return {
    ...project,
    brief: safeJsonParse<CreativeBrief | null>(project.brief, null),
  };
}

export async function getProjectDetailAction(projectId: string) {
  parseInput({ projectId }, getProjectDetailActionSchema, 'getProjectDetailAction');
  await requireProjectOwner(projectId);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const [chapters, bible] = await Promise.all([
    prisma.chapter.findMany({
      where: { projectId },
      orderBy: { chapterNumber: 'asc' },
    }),
    getOrCreateBible(projectId),
  ]);
  return {
    project: { ...project, brief: safeJsonParse<CreativeBrief | null>(project.brief, null) },
    chapters: chapters.map((c) => ({
      ...c,
      outline: safeJsonParse<ChapterOutline | null>(c.outline, null),
    })),
    bible,
  };
}

export async function optimizePromptAction(projectId: string) {
  parseInput({ projectId }, optimizePromptActionSchema, 'optimizePromptAction');
  await requireProjectOwner(projectId);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new UserError('Project not found', 'project_not_found');

  const { mock, ...brief } = await optimizePrompt({
    rawIdea: project.rawIdea,
    genre: project.genre ?? undefined,
    targetLength: project.targetLength ?? undefined,
    stylePreference: project.stylePreference ?? undefined,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      brief: safeJsonStringify(brief),
      optimizedPrompt: brief.refinedIdea,
      title: project.title === '未命名作品' && brief.protagonist.name ? `${brief.protagonist.name} 的故事` : project.title,
    },
  });

  revalidateProject(projectId);
  return { brief, mock };
}

export async function adoptBriefAction(projectId: string, brief: CreativeBrief) {
  parseInput({ projectId, brief }, adoptBriefActionSchema, 'adoptBriefAction');
  await requireProjectOwner(projectId);
  // Build the initial Story Bible from the brief.
  const foundation = await generateStoryFoundation(brief);

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        brief: safeJsonStringify(brief),
        optimizedPrompt: brief.refinedIdea,
      },
    });
    await tx.storyBible.upsert({
      where: { projectId },
      create: {
        projectId,
        characters: safeJsonStringify(foundation.characters),
        locations: safeJsonStringify(foundation.locations),
        items: safeJsonStringify(foundation.items),
        worldRules: safeJsonStringify(foundation.worldRules),
        plotThreads: safeJsonStringify(foundation.plotThreads),
        foreshadowing: safeJsonStringify(foundation.foreshadowing),
        timelineEvents: safeJsonStringify(foundation.timelineEvents),
      },
      update: {
        characters: safeJsonStringify(foundation.characters),
        locations: safeJsonStringify(foundation.locations),
        items: safeJsonStringify(foundation.items),
        worldRules: safeJsonStringify(foundation.worldRules),
        plotThreads: safeJsonStringify(foundation.plotThreads),
        foreshadowing: safeJsonStringify(foundation.foreshadowing),
        timelineEvents: safeJsonStringify(foundation.timelineEvents),
      },
    });
  });

  revalidateProject(projectId);
}
