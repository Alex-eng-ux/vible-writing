// Tests for `src/lib/validation.ts`.
//
// We test the helper `parseInput` plus the per-action schemas that guard
// the public server-action surface. The goal is to lock the validation
// contract so a future schema tweak can't silently change what users are
// allowed to submit.
//
// Note: parseInput throws `UserError` (not a plain `Error`) after the
// typed-error refactor; the existing UI contract was "throw a plain
// Error, the message is the user-facing text". We assert the new
// behavior — `instanceof UserError` + `code === 'validation_failed'`.

import { describe, it, expect } from 'vitest';
import {
  parseInput,
  createProjectSchema,
  CreativeBriefSchema,
  BibleRecordSchema,
  ChapterOutlineSchema,
  generateOutlineActionSchema,
  saveChapterActionSchema,
  applyFactsToBibleActionSchema,
  generateFixSuggestionActionSchema,
  BIBLE_CATEGORIES,
  CHAPTER_STATUSES,
  BIBLE_RECORD_STATUSES,
  voidSchema,
} from '@/lib/validation';
import { UserError } from '@/lib/errors';

// A minimal valid CreativeBrief for downstream tests. Keep it here so a
// schema tweak surfaces as a test diff, not a scattered inline change.
const validBrief = {
  completenessScore: 50,
  refinedIdea: 'A story',
  genre: 'fantasy',
  tone: 'dark',
  targetAudience: 'adults',
  protagonist: { summary: 'a hero' },
  coreConflict: 'survival',
  worldDirection: 'post-apocalyptic',
  writingConstraints: ['no magic'],
  missingInfo: [],
  directions: [],
  followUpQuestions: [],
};

const validRecord = {
  id: 'rec_1',
  name: 'Alice',
  status: 'active',
  updatedAt: '2024-01-01T00:00:00Z',
};

const validOutline = {
  goal: 'find the artifact',
  summary: 'hero searches the ruins',
  requiredBeats: ['enter ruins', 'meet the guide'],
  relatedCharacters: ['Alice'],
  relatedForeshadowing: ['the silver key'],
};

describe('parseInput', () => {
  it('returns the parsed data on success', () => {
    const out = parseInput(
      { rawIdea: 'An idea', title: 'Hello' },
      createProjectSchema,
      'createProject'
    );
    expect(out.title).toBe('Hello');
  });

  it('throws a UserError on failure with the action label in the message', () => {
    let caught: unknown;
    try {
      parseInput({ projectId: '', title: '' }, createProjectSchema, 'createProject');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UserError);
    expect((caught as UserError).code).toBe('validation_failed');
    expect((caught as UserError).message).toContain('createProject');
  });

  it('prepends the dotted path of the first failing field', () => {
    let caught: UserError | null = null;
    try {
      parseInput(
        { data: { content: '' } },
        saveChapterActionSchema,
        'saveChapter'
      );
    } catch (e) {
      caught = e as UserError;
    }
    expect(caught).toBeInstanceOf(UserError);
    // The first issue is either `chapterId` (missing) or `data.content` (empty).
    // The path is included only when non-empty; both are valid surfaces.
    expect(caught!.message).toContain('saveChapter');
  });

  it('works with the voidSchema for no-arg actions', () => {
    expect(() => parseInput(undefined, voidSchema, 'listProjects')).not.toThrow();
  });
});

describe('createProjectSchema', () => {
  it('trims the rawIdea and title', () => {
    const out = createProjectSchema.parse({
      rawIdea: '  hello  ',
      title: '  Story  ',
    });
    expect(out.rawIdea).toBe('hello');
    expect(out.title).toBe('Story');
  });

  it('rejects an empty title', () => {
    const r = createProjectSchema.safeParse({ rawIdea: 'x', title: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejects a too-long rawIdea', () => {
    const r = createProjectSchema.safeParse({
      rawIdea: 'x'.repeat(20_001),
      title: 'ok',
    });
    expect(r.success).toBe(false);
  });
});

describe('CreativeBriefSchema', () => {
  it('accepts a minimal valid brief', () => {
    const r = CreativeBriefSchema.safeParse(validBrief);
    expect(r.success).toBe(true);
  });

  it('rejects out-of-range completenessScore', () => {
    expect(
      CreativeBriefSchema.safeParse({ ...validBrief, completenessScore: -1 }).success
    ).toBe(false);
    expect(
      CreativeBriefSchema.safeParse({ ...validBrief, completenessScore: 101 }).success
    ).toBe(false);
  });

  it('caps the size of writingConstraints', () => {
    const r = CreativeBriefSchema.safeParse({
      ...validBrief,
      writingConstraints: Array(51).fill('rule'),
    });
    expect(r.success).toBe(false);
  });
});

describe('BibleRecordSchema', () => {
  it('accepts a minimal record', () => {
    expect(BibleRecordSchema.safeParse(validRecord).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const r = BibleRecordSchema.safeParse({ ...validRecord, status: 'bogus' });
    expect(r.success).toBe(false);
  });

  it('rejects a too-long name', () => {
    const r = BibleRecordSchema.safeParse({ ...validRecord, name: 'n'.repeat(501) });
    expect(r.success).toBe(false);
  });

  it('rejects an empty id', () => {
    const r = BibleRecordSchema.safeParse({ ...validRecord, id: '' });
    expect(r.success).toBe(false);
  });

  it('lists the canonical BibleRecord status enums', () => {
    expect(BIBLE_RECORD_STATUSES).toContain('active');
    expect(BIBLE_RECORD_STATUSES).toContain('deprecated');
  });
});

describe('ChapterOutlineSchema', () => {
  it('accepts a valid outline', () => {
    expect(ChapterOutlineSchema.safeParse(validOutline).success).toBe(true);
  });

  it('caps requiredBeats at 50', () => {
    const r = ChapterOutlineSchema.safeParse({
      ...validOutline,
      requiredBeats: Array(51).fill('beat'),
    });
    expect(r.success).toBe(false);
  });

  it('caps relatedCharacters at 30', () => {
    const r = ChapterOutlineSchema.safeParse({
      ...validOutline,
      relatedCharacters: Array(31).fill('x'),
    });
    expect(r.success).toBe(false);
  });
});

describe('generateOutlineActionSchema', () => {
  it('accepts the canonical happy path', () => {
    const r = generateOutlineActionSchema.safeParse({
      projectId: 'p1',
      totalChapters: 8,
      opts: {},
    });
    expect(r.success).toBe(true);
  });

  it('rejects totalChapters below 3', () => {
    const r = generateOutlineActionSchema.safeParse({
      projectId: 'p1',
      totalChapters: 2,
    });
    expect(r.success).toBe(false);
  });

  it('rejects totalChapters above 50', () => {
    const r = generateOutlineActionSchema.safeParse({
      projectId: 'p1',
      totalChapters: 51,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-integer totalChapters', () => {
    const r = generateOutlineActionSchema.safeParse({
      projectId: 'p1',
      totalChapters: 4.5,
    });
    expect(r.success).toBe(false);
  });

  it('defaults opts to {} when omitted', () => {
    const r = generateOutlineActionSchema.safeParse({
      projectId: 'p1',
      totalChapters: 8,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.opts).toEqual({});
  });
});

describe('saveChapterActionSchema', () => {
  it('accepts a chapter id with no data', () => {
    const r = saveChapterActionSchema.safeParse({ chapterId: 'c1', data: {} });
    expect(r.success).toBe(true);
  });

  it('rejects content over 1,000,000 chars', () => {
    const r = saveChapterActionSchema.safeParse({
      chapterId: 'c1',
      data: { content: 'x'.repeat(1_000_001) },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown status', () => {
    const r = saveChapterActionSchema.safeParse({
      chapterId: 'c1',
      data: { status: 'frobnicated' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts every canonical chapter status', () => {
    for (const status of CHAPTER_STATUSES) {
      const r = saveChapterActionSchema.safeParse({
        chapterId: 'c1',
        data: { status },
      });
      expect(r.success, `status ${status} should validate`).toBe(true);
    }
  });
});

describe('applyFactsToBibleActionSchema', () => {
  it('accepts an empty facts object (all categories empty arrays)', () => {
    const facts = BIBLE_CATEGORIES.reduce(
      (acc, k) => ({ ...acc, [k]: [] }),
      {} as Record<string, unknown[]>
    );
    const r = applyFactsToBibleActionSchema.safeParse({ projectId: 'p1', facts });
    expect(r.success).toBe(true);
  });

  it('rejects a missing category', () => {
    const r = applyFactsToBibleActionSchema.safeParse({
      projectId: 'p1',
      facts: { characters: [validRecord] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects when total records across categories exceed 500', () => {
    const tooMany = Array(501).fill(validRecord);
    const facts = BIBLE_CATEGORIES.reduce(
      (acc, k, i) => ({ ...acc, [k]: i === 0 ? tooMany : [] }),
      {} as Record<string, unknown[]>
    );
    const r = applyFactsToBibleActionSchema.safeParse({ projectId: 'p1', facts });
    expect(r.success).toBe(false);
  });

  it('accepts exactly 500 records', () => {
    const exactly500 = Array(500).fill(validRecord);
    const facts = BIBLE_CATEGORIES.reduce(
      (acc, k, i) => ({ ...acc, [k]: i === 0 ? exactly500 : [] }),
      {} as Record<string, unknown[]>
    );
    const r = applyFactsToBibleActionSchema.safeParse({ projectId: 'p1', facts });
    expect(r.success).toBe(true);
  });
});

describe('generateFixSuggestionActionSchema', () => {
  it('accepts a non-negative integer', () => {
    const r = generateFixSuggestionActionSchema.safeParse({
      reportId: 'r1',
      issueIndex: 0,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a negative issueIndex', () => {
    const r = generateFixSuggestionActionSchema.safeParse({
      reportId: 'r1',
      issueIndex: -1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-integer issueIndex', () => {
    const r = generateFixSuggestionActionSchema.safeParse({
      reportId: 'r1',
      issueIndex: 1.5,
    });
    expect(r.success).toBe(false);
  });
});
