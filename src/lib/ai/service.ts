// Unified AI service. Every AI capability lives here.
// All public functions:
//   - have TypeScript types
//   - return structured objects
//   - have a deterministic mock fallback
//   - are safe to call from server actions / API routes
//
// The actual HTTP plumbing lives behind the `ChatModel` abstraction in
// `./providers/`. To add a new model backend, edit one file under
// `./providers/` and one branch in `./providers/registry.ts` — nothing here
// needs to change.

import { PROMPTS } from './prompts';
import {
  mockOptimizePrompt,
  mockGenerateOutline,
  mockGenerateChapter,
  mockContinueChapter,
  mockPolishText,
  mockExtractFacts,
  mockCheckConsistency,
  mockGenerateFix,
  mockStoryFoundation,
} from './mock';
import type {
  ChapterGenerationContext,
  ChapterOutline,
  CreativeBrief,
  FactExtractionPayload,
  ConsistencyIssue,
  FixSuggestion,
  BibleRecord,
} from '@/types/domain';
import { getModel, isMockMode as registryIsMockMode } from './providers/registry';
import { InfraError, UserError, isInfraError, logError } from '@/lib/errors';
import { withRetry } from './retry';

// ---------- Model wiring (re-exports for back-compat) ----------

// ChapterEditor.tsx imports this type from '@/lib/ai/service'.
// Re-export it from the domain types so that import path keeps working.
export type { ChapterGenerationContext };

// layout.tsx (and any other external caller) imports `isMockMode` from
// '@/lib/ai/service'. Re-export from the registry so the public surface is
// unchanged.
export const isMockMode: () => boolean = registryIsMockMode;

function safeJson<T>(raw: string): T {
  // Strip code fences if the model wrapped JSON in ```json ... ```.
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const inner = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
      return JSON.parse(inner) as T;
    } catch {
      // fall through to non-greedy extraction
    }
  }
  // Try strict parse first.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Non-greedy extraction: find the first balanced JSON object/array.
    const objMatch = trimmed.match(/\{[\s\S]*?\}/);
    const arrMatch = trimmed.match(/\[[\s\S]*?\]/);
    const candidate = objMatch?.[0] || arrMatch?.[0];
    if (candidate) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // fall through
      }
    }
    throw new InfraError(
      'safeJson failed to parse LLM response as JSON',
      'AI 返回的格式无法解析，已切换到占位数据。',
      'llm_invalid_json'
    );
  }
}

async function runOrMock<T>(prompt: string, mockFn: () => T): Promise<{ value: T; mock: boolean }> {
  if (isMockMode()) return { value: mockFn(), mock: true };
  try {
    const model = getModel();
    if (!model) return { value: mockFn(), mock: true };
    const raw = await model.complete([{ role: 'user', content: prompt }], { jsonMode: true });
    return { value: safeJson<T>(raw), mock: false };
  } catch (err) {
    // We deliberately degrade to mock data on any LLM failure so the
    // editor still works when the user's API key is bad, the network is
    // flaky, or the model returns a weird shape. The original InfraError
    // is logged on the server for debugging.
    if (!isInfraError(err)) {
      logError('runOrMock', new InfraError(
        (err as Error)?.message || String(err),
        'AI 服务暂时不可用，已切换到占位数据。',
        'llm_unexpected_error',
        err
      ));
    } else {
      logError('runOrMock', err);
    }
    return { value: mockFn(), mock: true };
  }
}

// ---------- Public API ----------

export type OptimizePromptResult = CreativeBrief & { mock: boolean };

export async function optimizePrompt(input: {
  rawIdea: string;
  genre?: string;
  targetLength?: string;
  stylePreference?: string;
}): Promise<OptimizePromptResult> {
  const { value, mock } = await runOrMock<CreativeBrief>(
    PROMPTS.optimizePrompt(input),
    () => mockOptimizePrompt(input)
  );
  return { ...value, mock };
}

export async function generateStoryFoundation(brief: CreativeBrief) {
  // For MVP, story foundation is generated via a rule-based transformation of the brief.
  // This is fine to keep deterministic so the Story Bible always has something to show.
  return mockStoryFoundation(brief);
}

export type GenerateOutlineResult = { chapters: Awaited<ReturnType<typeof mockGenerateOutline>>; mock: boolean };

export async function generateOutline(
  brief: CreativeBrief,
  totalChapters = 8
): Promise<GenerateOutlineResult> {
  const { value, mock } = await runOrMock(
    PROMPTS.generateOutline({ refinedIdea: brief.refinedIdea, totalChapters }),
    () => mockGenerateOutline(brief, totalChapters)
  );
  return { chapters: value, mock };
}

export type GenerateChapterResult = { content: string; summary: string; mock: boolean };

export async function generateChapter(
  ctx: ChapterGenerationContext
): Promise<GenerateChapterResult> {
  const { value, mock } = await runOrMock(
    PROMPTS.generateChapter({
      chapterNumber: ctx.chapterNumber,
      title: ctx.title || `第 ${ctx.chapterNumber} 章`,
      outline: ctx.outline,
      previousSummary: ctx.previousChapterSummary,
      characters: ctx.characters,
      locations: ctx.locations,
      items: ctx.items,
      worldRules: ctx.worldRules,
      foreshadowing: ctx.foreshadowing,
      writingConstraints: ctx.writingConstraints,
      targetLengthWords: 1500,
    }),
    () => mockGenerateChapter(ctx)
  );
  return { ...value, mock };
}

export type ContinueChapterResult = { content: string; summary: string; mock: boolean };

export async function continueChapter(ctx: {
  chapterNumber: number;
  title: string;
  existingContent: string;
  previousSummary: string;
  characters: Array<{ name: string; description: string; status: string }>;
}): Promise<ContinueChapterResult> {
  const { value, mock } = await runOrMock(
    PROMPTS.continueChapter({ ...ctx, targetLengthWords: 800 }),
    () => mockContinueChapter(ctx)
  );
  return { ...value, mock };
}

export type PolishTextResult = { content: string; mock: boolean };

export async function polishText(input: { text: string; mode: 'selection' | 'full' }): Promise<PolishTextResult> {
  const { value, mock } = await runOrMock(PROMPTS.polishText({ text: input.text, mode: input.mode }), () =>
    mockPolishText(input.text)
  );
  return { ...value, mock };
}

export type ExtractFactsResult = { payload: FactExtractionPayload; mock: boolean };

export async function extractFacts(input: {
  chapterNumber: number;
  title: string;
  content: string;
  brief: CreativeBrief | null;
  existingNames?: {
    characters?: string[];
    locations?: string[];
    items?: string[];
    worldRules?: string[];
    foreshadowing?: string[];
  };
}): Promise<ExtractFactsResult> {
  const { value, mock } = await runOrMock(
    PROMPTS.extractFacts({
      chapterNumber: input.chapterNumber,
      title: input.title,
      content: input.content,
      brief: input.brief
        ? {
            protagonist: input.brief.protagonist,
            worldDirection: input.brief.worldDirection,
          }
        : null,
      existingNames: input.existingNames,
    }),
    () =>
      mockExtractFacts({
        chapterNumber: input.chapterNumber,
        content: input.content,
        existingNames: input.existingNames,
      })
  );
  return { payload: value, mock };
}

export type CheckConsistencyResult = { issues: ConsistencyIssue[]; mock: boolean };

export async function checkConsistency(input: {
  chapterNumber: number;
  title: string;
  content: string;
  outline?: ChapterOutline;
  storyBible: {
    characters: BibleRecord[];
    locations: BibleRecord[];
    items: BibleRecord[];
    worldRules: BibleRecord[];
    foreshadowing: BibleRecord[];
    timelineEvents: BibleRecord[];
  };
  writingConstraints: string[];
}): Promise<CheckConsistencyResult> {
  const { value, mock } = await runOrMock<ConsistencyIssue[]>(
    PROMPTS.checkConsistency(input),
    () => mockCheckConsistency(input)
  );
  return { issues: value, mock };
}

export type GenerateFixSuggestionResult = { suggestion: FixSuggestion; mock: boolean };

export async function generateFixSuggestion(input: {
  issue: ConsistencyIssue;
  chapterContent: string;
}): Promise<GenerateFixSuggestionResult> {
  const { value, mock } = await runOrMock(PROMPTS.generateFix(input), () => mockGenerateFix(input.issue));
  return { suggestion: value, mock };
}

// Pure helper. Reserved for a future "auto-apply" feature.
// 'append' (default) safely appends the patch. 'replace' also requires the
// caller to pass an explicit `original` so we can refuse to silently nuke
// the existing chapter when the AI hallucinates a target.
export function applyPatchToChapter(
  content: string,
  patch: string,
  options: { mode?: 'append' | 'replace'; original?: string } = {}
): string {
  if (options.mode === 'replace') {
    if (!options.original) {
      // Programmer error — `applyPatchToChapter` requires the caller to
      // pass the original snippet when using 'replace'. This is not
      // user-recoverable.
      throw new InfraError(
        'applyPatchToChapter: replace 模式必须提供 original',
        '系统内部错误：无法应用补丁。',
        'apply_patch_missing_original'
      );
    }
    if (!content.includes(options.original)) {
      // The user's text moved between when we read it and when the AI
      // produced the patch. The user can re-select and retry.
      throw new UserError(
        '原选段已被修改，无法定位。请重新选中要替换的文本。',
        'apply_patch_stale_original'
      );
    }
    return content.split(options.original).join(patch);
  }
  return content + '\n\n' + patch;
}
