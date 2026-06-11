// Domain types used across the app and AI service.

export type Severity = 'critical' | 'warning' | 'info';

/**
 * Single source of truth for the 7 Story Bible categories. Adding /
 * removing / renaming a category requires editing this file ONLY. The
 * Prisma schema must be migrated separately; all TypeScript and runtime
 * code derives from this array.
 */
export const BIBLE_CATEGORIES = [
  'characters',
  'locations',
  'items',
  'worldRules',
  'plotThreads',
  'foreshadowing',
  'timelineEvents',
] as const;
export type BibleCategory = (typeof BIBLE_CATEGORIES)[number];

export const BIBLE_CATEGORY_KEYS = BIBLE_CATEGORIES;

export const BIBLE_CATEGORY_LABELS: Record<BibleCategory, { label: string; description: string }> = {
  characters: { label: '人物', description: '已确立的出场角色' },
  locations: { label: '地点', description: '故事中出现的关键场景' },
  items: { label: '物品', description: '推动情节的关键物品' },
  worldRules: { label: '世界规则', description: '必须遵守的世界观设定' },
  plotThreads: { label: '剧情线', description: '主要故事脉络' },
  foreshadowing: { label: '伏笔', description: '需要回收或正在推进的伏笔' },
  timelineEvents: { label: '时间线', description: '关键事件的时间序列' },
};

// ---- BibleRecord / Chapter status enums (single source of truth) ----

export const BIBLE_RECORD_STATUSES = [
  'active',
  'resolved',
  'lost',
  'deceased',
  'unknown',
] as const;
export type BibleRecordStatus = (typeof BIBLE_RECORD_STATUSES)[number];

export const CHAPTER_STATUSES = ['draft', 'generated', 'in_review', 'finalized'] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

// Project-level status (separate enum, kept inline because it's not used as a zod input today).
// 'active' | 'archived'

export type IssueType =
  | 'character_status_conflict'
  | 'character_location_conflict'
  | 'item_ownership_conflict'
  | 'timeline_conflict'
  | 'world_rule_conflict'
  | 'unresolved_foreshadowing'
  | 'style_or_constraint_violation';

export interface IssueEvidence {
  source: 'chapter' | 'storyBible' | 'outline';
  chapterNumber?: number;
  field?: string;
  quote: string;
}

export interface ConsistencyIssue {
  id?: string;
  severity: Severity;
  type: IssueType;
  message: string;
  evidence: IssueEvidence[];
  suggestions: string[];
  status?: 'open' | 'resolved' | 'dismissed';
}

export interface ConsistencyReportSummary {
  id: string;
  projectId: string;
  chapterId: string;
  issues: ConsistencyIssue[];
  createdAt: string;
  status: 'open' | 'resolved' | 'dismissed';
}

// ---- Brief / Optimized Prompt ----

export interface CreativeBrief {
  completenessScore: number; // 0-100
  refinedIdea: string;
  genre: string;
  tone: string;
  targetAudience: string;
  protagonist: {
    name?: string;
    summary: string;
  };
  coreConflict: string;
  worldDirection: string;
  writingConstraints: string[];
  missingInfo: string[];
  directions: string[]; // 3 possible creative directions
  followUpQuestions: string[];
}

// ---- Story Bible records ----

export interface BibleRecord {
  id: string;
  name: string;
  description: string;
  status: BibleRecordStatus;
  sourceChapterId?: string;
  evidence?: string;
  updatedAt: string;
  // Optional, type-specific extras
  attributes?: Record<string, string | number | boolean | string[]>;
}

export type StoryBibleData = Record<BibleCategory, BibleRecord[]>;

// ---- Chapter outline ----

export interface ChapterOutline {
  goal: string;
  summary: string;
  requiredBeats: string[];
  relatedCharacters: string[];
  relatedForeshadowing: string[];
}

// ---- Fact extraction ----

export interface CharacterStatusChange {
  character: string;
  before?: string;
  after: string;
}

export interface FactExtractionPayload {
  characters: Array<{ name: string; role: string; status: string }>;
  locations: Array<{ name: string; description: string }>;
  items: Array<{ name: string; owner?: string; description: string }>;
  events: Array<{ name: string; description: string }>;
  worldRules: Array<{ name: string; description: string }>;
  characterStatusChanges: CharacterStatusChange[];
  foreshadowing: Array<{ name: string; description: string }>;
  timeline: Array<{ name: string; description: string; order: number }>;
}

// ---- Fix suggestion ----

export interface FixSuggestion {
  explanation: string;
  options: Array<{
    title: string;
    description: string;
    patch: string; // text fragment to insert or replace
  }>;
  recommended: number; // index into options
}

// ---- Generation context ----

export interface ChapterGenerationContext {
  brief: CreativeBrief | null;
  chapterNumber: number;
  title: string;
  outline: ChapterOutline;
  previousChapterSummary: string;
  characters: BibleRecord[];
  locations: BibleRecord[];
  items: BibleRecord[];
  worldRules: BibleRecord[];
  foreshadowing: BibleRecord[];
  writingConstraints: string[];
}
