// Story Bible CRUD operations, decoupled from the Prisma model so the rest
// of the app works with strongly-typed records and the DB layer is swappable.

import { prisma } from './db';
import { safeJsonParse, safeJsonStringify } from './json';
import {
  BIBLE_CATEGORIES,
  BIBLE_CATEGORY_KEYS,
  BIBLE_RECORD_STATUSES,
  type BibleCategory,
  type BibleRecord,
  type StoryBibleData,
} from '@/types/domain';
import type { Prisma } from '@prisma/client';

// Re-exported so any downstream consumer that previously imported
// `BIBLE_CATEGORIES` from `@/lib/bible` keeps working. The registry lives in
// `@/types/domain` and is the only place to add / remove / rename a category.
export { BIBLE_CATEGORIES, BIBLE_CATEGORY_KEYS, BIBLE_RECORD_STATUSES };

// Whitelist of allowed BibleRecord.status values. The DB column is a free-form
// `String` for portability (SQLite has no enums), so we enforce the union at
// every write boundary. The tuple itself comes from `@/types/domain` — to add
// or rename a status, edit the canonical list there.
const ALLOWED_BIBLE_STATUS = new Set<BibleRecord['status']>(BIBLE_RECORD_STATUSES);

function clampStatus(status: string | undefined, fallback: BibleRecord['status'] = 'active'): BibleRecord['status'] {
  if (status && (ALLOWED_BIBLE_STATUS as Set<string>).has(status)) {
    return status as BibleRecord['status'];
  }
  return fallback;
}

function sanitizeRecord(r: BibleRecord): BibleRecord {
  return {
    ...r,
    status: clampStatus(r.status),
    name: (r.name || '').slice(0, 500),
    description: (r.description || '').slice(0, 50_000),
  };
}

// Type used by the helpers below for a Prisma `storyBible` row, narrowed to
// the JSON-string columns we care about. Prisma generates this shape from the
// schema; the mapped-type cast keeps the helper generic over the 7 categories.
type StoryBibleRow = {
  [K in BibleCategory]: string;
};

/**
 * Hydrate a `StoryBibleData` object from a Prisma row, parsing each category
 * column's JSON payload. Safe to call on a row returned from
 * `prisma.storyBible.upsert({ ... })`.
 */
function readBibleRow(row: StoryBibleRow): StoryBibleData {
  return Object.fromEntries(
    BIBLE_CATEGORIES.map((c) => [c, safeJsonParse<BibleRecord[]>(row[c] as string, [])])
  ) as StoryBibleData;
}

function makeEmptyBible(): StoryBibleData {
  return BIBLE_CATEGORIES.reduce((acc, category) => {
    acc[category] = [];
    return acc;
  }, {} as StoryBibleData);
}

export const EMPTY_BIBLE: StoryBibleData = makeEmptyBible();

/**
 * Stringify every category in a `StoryBibleData` back into the shape Prisma
 * expects for `storyBible.update({ data })`.
 */
function bibleToUpdateData(bible: StoryBibleData): Record<BibleCategory, string> {
  return Object.fromEntries(
    BIBLE_CATEGORIES.map((c) => [c, safeJsonStringify(bible[c])])
  ) as Record<BibleCategory, string>;
}

/**
 * Read-modify-write the whole Story Bible row in a single transaction.
 * Use this when an action needs to merge into multiple categories atomically;
 * calling `appendBibleRecords` 7 times in parallel from outside will lose data
 * because each call rewrites the whole row.
 *
 * Pass an external `tx` to compose with a parent transaction (e.g. for marking
 * the source extraction as applied in the same DB call).
 */
export async function applyBibleFactsAtomic(
  projectId: string,
  additions: Partial<Record<BibleCategory, BibleRecord[]>>,
  externalTx?: Prisma.TransactionClient
): Promise<StoryBibleData> {
  const run = async (tx: Prisma.TransactionClient) => {
    const row = await tx.storyBible.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
    const bible = readBibleRow(row);
    const normalize = (s: string) =>
      s.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').toLowerCase();

    for (const cat of BIBLE_CATEGORIES) {
      const incoming = additions[cat];
      if (!incoming || incoming.length === 0) continue;
      const existing = bible[cat];
      const seen = new Map(existing.map((r) => [normalize(r.name), r] as const));
      const merged = [...existing];
      for (const r of incoming) {
        const safe = sanitizeRecord(r);
        const key = normalize(safe.name);
        if (!key) continue;
        const ex = seen.get(key);
        if (ex) {
          const idx = merged.findIndex((m) => m.id === ex.id);
          if (idx >= 0) {
            merged[idx] = {
              ...merged[idx],
              description: safe.description || merged[idx].description,
              evidence: safe.evidence || merged[idx].evidence,
              attributes: safe.attributes || merged[idx].attributes,
              status: safe.status,
              updatedAt: new Date().toISOString(),
            };
          }
        } else {
          seen.set(key, safe);
          merged.push(safe);
        }
      }
      bible[cat] = merged;
    }

    await tx.storyBible.update({
      where: { projectId },
      data: { ...bibleToUpdateData(bible), updatedAt: new Date() },
    });

    return bible;
  };
  return externalTx ? run(externalTx) : prisma.$transaction(run);
}

export async function getOrCreateBible(projectId: string): Promise<StoryBibleData> {
  const row = await prisma.storyBible.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });
  return readBibleRow(row);
}

export async function getBibleCategory(
  projectId: string,
  category: BibleCategory
): Promise<BibleRecord[]> {
  const bible = await getOrCreateBible(projectId);
  return bible[category];
}

export async function setBibleCategory(
  projectId: string,
  category: BibleCategory,
  records: BibleRecord[]
): Promise<void> {
  // Sanitize each record so DB integrity holds even if the caller trusted a
  // malformed client payload.
  const safe = records.map(sanitizeRecord);
  const data = { [category]: safeJsonStringify(safe) } as Record<string, string>;
  await prisma.storyBible.update({
    where: { projectId },
    data: { ...data, updatedAt: new Date() },
  });
}

export async function appendBibleRecords(
  projectId: string,
  category: BibleCategory,
  records: BibleRecord[]
): Promise<StoryBibleData> {
  // Wrap the read-modify-write in a single transaction so concurrent writers
  // can't clobber each other.
  return prisma.$transaction(async (tx) => {
    const row = await tx.storyBible.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
    const bible = readBibleRow(row);
    const existing = bible[category];
    // De-duplicate by normalized name so re-running extraction doesn't bloat the bible.
    const normalize = (s: string) =>
      s.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').toLowerCase();
    const seen = new Map(existing.map((r) => [normalize(r.name), r] as const));
    const merged = [...existing];
    for (const raw of records) {
      const r = sanitizeRecord(raw);
      const key = normalize(r.name);
      if (!key) continue;
      const existingRecord = seen.get(key);
      if (existingRecord) {
        const idx = merged.findIndex((m) => m.id === existingRecord.id);
        if (idx >= 0) {
          merged[idx] = {
            ...merged[idx],
            description: r.description || merged[idx].description,
            evidence: r.evidence || merged[idx].evidence,
            attributes: r.attributes || merged[idx].attributes,
            status: r.status,
            updatedAt: new Date().toISOString(),
          };
        }
      } else {
        seen.set(key, r);
        merged.push(r);
      }
    }
    await tx.storyBible.update({
      where: { projectId },
      data: { [category]: safeJsonStringify(merged), updatedAt: new Date() } as Record<
        string,
        string | Date
      >,
    });
    return { ...bible, [category]: merged };
  });
}

export async function replaceBibleRecord(
  projectId: string,
  category: BibleCategory,
  record: BibleRecord
): Promise<StoryBibleData> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.storyBible.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
    const bible = readBibleRow(row);
    const existing = bible[category];
    const safe = sanitizeRecord(record);
    const next = existing.map((r) =>
      r.id === record.id ? { ...safe, updatedAt: new Date().toISOString() } : r
    );
    await tx.storyBible.update({
      where: { projectId },
      data: { [category]: safeJsonStringify(next), updatedAt: new Date() } as Record<
        string,
        string | Date
      >,
    });
    return { ...bible, [category]: next };
  });
}

export async function deleteBibleRecord(
  projectId: string,
  category: BibleCategory,
  recordId: string
): Promise<StoryBibleData> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.storyBible.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });
    const bible = readBibleRow(row);
    const next = bible[category].filter((r) => r.id !== recordId);
    await tx.storyBible.update({
      where: { projectId },
      data: { [category]: safeJsonStringify(next), updatedAt: new Date() } as Record<
        string,
        string | Date
      >,
    });
    return { ...bible, [category]: next };
  });
}
