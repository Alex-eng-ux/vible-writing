'use server';

import { prisma } from '@/lib/db';
import { safeJsonParse, safeJsonStringify } from '@/lib/json';
import { getOrCreateBible } from '@/lib/bible';
import { UserError } from '@/lib/errors';
import type { CreativeBrief, ChapterOutline, ConsistencyIssue } from '@/types/domain';
import {
  parseInput,
  checkConsistencyActionSchema,
  listConsistencyReportsActionSchema,
  generateFixSuggestionActionSchema,
  markIssueResolvedActionSchema,
  dismissIssueActionSchema,
} from '@/lib/validation';
import {
  revalidateProject,
  requireProjectOwner,
  requireChapterOwner,
  requireReportOwner,
} from './_shared';

export async function checkConsistencyAction(chapterId: string) {
  parseInput({ chapterId }, checkConsistencyActionSchema, 'checkConsistencyAction');
  await requireChapterOwner(chapterId);
  const { checkConsistency } = await import('@/lib/ai/service');
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) throw new UserError('Chapter not found', 'chapter_not_found');
  const project = await prisma.project.findUnique({ where: { id: chapter.projectId } });
  if (!project) throw new UserError('Project not found', 'project_not_found');
  const brief = safeJsonParse<CreativeBrief | null>(project.brief, null);
  const bible = await getOrCreateBible(project.id);
  const outline = safeJsonParse<ChapterOutline | null>(chapter.outline, null);

  const { issues, mock } = await checkConsistency({
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    content: chapter.content,
    outline: outline ?? undefined,
    storyBible: {
      characters: bible.characters,
      locations: bible.locations,
      items: bible.items,
      worldRules: bible.worldRules,
      foreshadowing: bible.foreshadowing,
      timelineEvents: bible.timelineEvents,
    },
    writingConstraints: brief?.writingConstraints ?? [],
  });

  const report = await prisma.consistencyReport.create({
    data: {
      projectId: project.id,
      chapterId,
      issues: safeJsonStringify(issues),
      status: 'open',
    },
  });

  revalidateProject(project.id);
  return { id: report.id, createdAt: report.createdAt.toISOString(), issues, mock: !!mock };
}

export async function listConsistencyReportsAction(projectId: string) {
  parseInput({ projectId }, listConsistencyReportsActionSchema, 'listConsistencyReportsAction');
  await requireProjectOwner(projectId);
  return prisma.consistencyReport.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { chapter: { select: { id: true, title: true, chapterNumber: true } } },
  });
}

export async function generateFixSuggestionAction(
  reportId: string,
  issueIndex: number
) {
  parseInput(
    { reportId, issueIndex },
    generateFixSuggestionActionSchema,
    'generateFixSuggestionAction'
  );
  await requireReportOwner(reportId);
  const { generateFixSuggestion } = await import('@/lib/ai/service');
  const report = await prisma.consistencyReport.findUnique({ where: { id: reportId } });
  if (!report) throw new UserError('Report not found', 'report_not_found');
  const chapter = await prisma.chapter.findUnique({ where: { id: report.chapterId } });
  if (!chapter) throw new UserError('Chapter not found', 'chapter_not_found');
  const issues = safeJsonParse<ConsistencyIssue[]>(report.issues, []);
  if (!Number.isInteger(issueIndex) || issueIndex < 0 || issueIndex >= issues.length) {
    throw new UserError('Issue index out of range', 'issue_index_out_of_range');
  }
  const issue = issues[issueIndex];
  const { suggestion, mock } = await generateFixSuggestion({
    issue,
    chapterContent: chapter.content,
  });

  return { suggestion, mock: !!mock };
}

export async function markIssueResolvedAction(reportId: string, issueIndex: number) {
  parseInput(
    { reportId, issueIndex },
    markIssueResolvedActionSchema,
    'markIssueResolvedAction'
  );
  await requireReportOwner(reportId);
  await prisma.$transaction(async (tx) => {
    const report = await tx.consistencyReport.findUnique({ where: { id: reportId } });
    if (!report) return;
    const issues = safeJsonParse<ConsistencyIssue[]>(report.issues, []);
    if (!Number.isInteger(issueIndex) || issueIndex < 0 || issueIndex >= issues.length) return;
    issues[issueIndex] = { ...issues[issueIndex], status: 'resolved' };
    await tx.consistencyReport.update({
      where: { id: reportId },
      data: { issues: safeJsonStringify(issues) },
    });
    revalidateProject(report.projectId);
  });
}

export async function dismissIssueAction(reportId: string, issueIndex: number) {
  parseInput(
    { reportId, issueIndex },
    dismissIssueActionSchema,
    'dismissIssueAction'
  );
  await requireReportOwner(reportId);
  await prisma.$transaction(async (tx) => {
    const report = await tx.consistencyReport.findUnique({ where: { id: reportId } });
    if (!report) return;
    const issues = safeJsonParse<ConsistencyIssue[]>(report.issues, []);
    if (!Number.isInteger(issueIndex) || issueIndex < 0 || issueIndex >= issues.length) return;
    issues[issueIndex] = { ...issues[issueIndex], status: 'dismissed' };
    await tx.consistencyReport.update({
      where: { id: reportId },
      data: { issues: safeJsonStringify(issues) },
    });
    revalidateProject(report.projectId);
  });
}
