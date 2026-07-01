// Zod-based input validation for server actions.
//
// Goals:
//   1. Catch malformed / oversized / out-of-range inputs at the action boundary
//      before they reach Prisma or the LLM.
//   2. Replace ad-hoc string-length checks with declarative schemas.
//   3. Give every action a single, predictable failure surface (a plain
//      `Error` with a human-readable Chinese message).
//
// This file intentionally does NOT re-export any of the action signatures or
// domain types - the consumers in `src/app/actions.ts` keep their existing
// shapes; we only narrow inputs at the boundary.

import { z } from 'zod';
import {
  BIBLE_CATEGORIES,
  BIBLE_RECORD_STATUSES,
  CHAPTER_STATUSES,
} from '@/types/domain';
import { UserError } from '@/lib/errors';

export { BIBLE_CATEGORIES, BIBLE_RECORD_STATUSES, CHAPTER_STATUSES };

const cuidLike = z
  .string()
  .trim()
  .min(1, 'id 不能为空')
  .max(64, 'id 长度超出允许范围');

export const CreativeBriefSchema = z.object({
  completenessScore: z
    .number()
    .min(0, 'completenessScore 不能小于 0')
    .max(100, 'completenessScore 不能大于 100'),
  refinedIdea: z.string().min(1, 'refinedIdea 不能为空').max(20_000, 'refinedIdea 过长'),
  genre: z.string().min(1, 'genre 不能为空').max(200, 'genre 过长'),
  tone: z.string().min(1, 'tone 不能为空').max(200, 'tone 过长'),
  targetAudience: z
    .string()
    .min(1, 'targetAudience 不能为空')
    .max(500, 'targetAudience 过长'),
  protagonist: z.object({
    name: z.string().max(200, 'protagonist.name 过长').optional(),
    summary: z
      .string()
      .min(1, 'protagonist.summary 不能为空')
      .max(5_000, 'protagonist.summary 过长'),
  }),
  coreConflict: z.string().min(1, 'coreConflict 不能为空').max(5_000, 'coreConflict 过长'),
  worldDirection: z
    .string()
    .min(1, 'worldDirection 不能为空')
    .max(5_000, 'worldDirection 过长'),
  writingConstraints: z
    .array(z.string().min(1).max(2_000))
    .max(50, 'writingConstraints 数量超出限制'),
  missingInfo: z
    .array(z.string().min(1).max(2_000))
    .max(50, 'missingInfo 数量超出限制'),
  directions: z.array(z.string().min(1).max(2_000)).max(10, 'directions 数量超出限制'),
  followUpQuestions: z
    .array(z.string().min(1).max(2_000))
    .max(50, 'followUpQuestions 数量超出限制'),
});

export const BibleRecordSchema = z.object({
  id: cuidLike,
  name: z
    .string()
    .trim()
    .min(1, '记录名称不能为空')
    .max(500, '记录名称长度必须在 1-500 之间'),
  description: z
    .string()
    .max(50_000, '描述长度不能超过 50,000 字符')
    .default(''),
  status: z.enum(BIBLE_RECORD_STATUSES),
  sourceChapterId: cuidLike.optional(),
  evidence: z.string().max(50_000, 'evidence 过长').optional(),
  updatedAt: z
    .string()
    .min(1, 'updatedAt 不能为空')
    .max(64, 'updatedAt 长度超出允许范围'),
  attributes: z.record(z.unknown()).optional(),
});

export const ChapterOutlineSchema = z.object({
  goal: z.string().max(5_000, 'goal 过长'),
  summary: z.string().max(5_000, 'summary 过长'),
  requiredBeats: z
    .array(z.string().min(1).max(500))
    .max(50, 'requiredBeats 数量超出限制'),
  relatedCharacters: z
    .array(z.string().min(1).max(200))
    .max(30, 'relatedCharacters 数量超出限制'),
  relatedForeshadowing: z
    .array(z.string().min(1).max(200))
    .max(30, 'relatedForeshadowing 数量超出限制'),
});

export const createProjectSchema = z.object({
  rawIdea: z
    .string()
    .trim()
    .min(1, '请填写原始创意')
    .max(20_000, '原始创意长度超出允许范围'),
  title: z
    .string()
    .trim()
    .min(1, '标题不能为空')
    .max(200, '标题长度必须在 1-200 之间'),
  genre: z
    .string()
    .trim()
    .max(200, '题材长度超出允许范围')
    .nullable()
    .optional(),
  targetLength: z
    .string()
    .trim()
    .max(200, '目标长度字段过长')
    .nullable()
    .optional(),
  stylePreference: z
    .string()
    .trim()
    .max(2_000, '风格偏好过长')
    .nullable()
    .optional(),
});

export const optimizePromptActionSchema = z.object({
  projectId: cuidLike.describe('项目 ID'),
});

export const adoptBriefActionSchema = z.object({
  projectId: cuidLike.describe('项目 ID'),
  brief: CreativeBriefSchema,
});

export const addBibleRecordActionSchema = z.object({
  projectId: cuidLike.describe('项目 ID'),
  category: z.enum(BIBLE_CATEGORIES).describe('圣经分类'),
  record: BibleRecordSchema,
});

const factsCategoriesShape = BIBLE_CATEGORIES.reduce((acc, key) => {
  acc[key] = z.array(BibleRecordSchema);
  return acc;
}, {} as Record<(typeof BIBLE_CATEGORIES)[number], z.ZodType<unknown[]>>);

const factsObjectSchema = z.object(factsCategoriesShape);

export const applyFactsToBibleActionSchema = z
  .object({
    projectId: cuidLike.describe('项目 ID'),
    facts: factsObjectSchema,
    appliedExtractionId: cuidLike.optional(),
  })
  .superRefine((value, ctx) => {
    const total = BIBLE_CATEGORIES.reduce(
      (sum, key) => sum + (value.facts[key]?.length ?? 0),
      0
    );
    const MAX_TOTAL = 500;
    if (total > MAX_TOTAL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['facts'],
        message: `一次最多写入 ${MAX_TOTAL} 条事实，当前 ${total} 条`,
      });
    }
  });

export const updateBibleRecordActionSchema = addBibleRecordActionSchema;

export const deleteBibleRecordActionSchema = z.object({
  projectId: cuidLike.describe('项目 ID'),
  category: z.enum(BIBLE_CATEGORIES).describe('圣经分类'),
  recordId: cuidLike.describe('记录 ID'),
});

export const generateOutlineActionSchema = z.object({
  projectId: cuidLike.describe('项目 ID'),
  totalChapters: z
    .number()
    .int('totalChapters 必须是整数')
    .min(3, 'totalChapters 必须在 3 到 50 之间')
    .max(50, 'totalChapters 必须在 3 到 50 之间'),
  opts: z
    .object({
      confirmReplace: z.boolean().optional(),
    })
    .default({}),
});

export const updateChapterOutlineActionSchema = z.object({
  chapterId: cuidLike.describe('章节 ID'),
  outline: ChapterOutlineSchema,
});

export const createChapterActionSchema = z.object({
  projectId: cuidLike.describe('项目 ID'),
  title: z
    .string()
    .trim()
    .min(1, '章节标题不能为空')
    .max(200, '章节标题长度必须在 1-200 之间'),
});

export const saveChapterActionSchema = z.object({
  chapterId: cuidLike.describe('章节 ID'),
  data: z.object({
    title: z
      .string()
      .min(1, '章节标题不能为空')
      .max(200, '章节标题长度必须在 1-200 之间')
      .optional(),
    content: z
      .string()
      .min(1, '章节正文不能为空')
      .max(1_000_000, '单章正文超过 1,000,000 字符上限')
      .optional(),
    summary: z
      .string()
      .max(2_000, '章节摘要超过 2,000 字符上限')
      .optional(),
    status: z.enum(CHAPTER_STATUSES).optional(),
  }),
});

export const getChapterActionSchema = z.object({
  chapterId: cuidLike.describe('章节 ID'),
});

export const extractFactsActionSchema = getChapterActionSchema;
export const listFactExtractionsActionSchema = getChapterActionSchema;
export const checkConsistencyActionSchema = getChapterActionSchema;

export const listConsistencyReportsActionSchema = z.object({
  projectId: cuidLike.describe('项目 ID'),
});

export const generateFixSuggestionActionSchema = z.object({
  reportId: cuidLike.describe('报告 ID'),
  issueIndex: z
    .number()
    .int('issueIndex 必须是整数')
    .min(0, 'issueIndex 不能小于 0'),
});

export const markIssueResolvedActionSchema = generateFixSuggestionActionSchema;
export const dismissIssueActionSchema = generateFixSuggestionActionSchema;

export const getProjectActionSchema = z.object({
  projectId: cuidLike.describe('项目 ID'),
});

export const getProjectDetailActionSchema = getProjectActionSchema;

export const voidSchema = z.void();
export const listProjectsActionSchema = voidSchema;

export function parseInput<T>(
  value: unknown,
  schema: z.ZodType<T>,
  label: string
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length > 0 ? `${first.path.join('.')}: ` : '';
    throw new UserError(`${label}: ${path}${first.message}`, 'validation_failed');
  }
  return result.data;
}
