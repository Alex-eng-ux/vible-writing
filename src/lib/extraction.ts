// Pure helpers for converting a `FactExtractionPayload` (the LLM's
// per-chapter extraction) into a per-category record map that
// `applyFactsToBibleAction` can consume.
//
// Why this lives in `lib/` rather than in the component:
//   - Both the editor (during interactive use) and the new history
//     view (re-applying a saved extraction) need the same mapping.
//   - Pure functions are easy to unit-test without React, Prisma, or
//     Next.js bootstrapping.

import type { BibleRecord, FactExtractionPayload, StoryBibleData } from '@/types/domain';

/**
 * Generate a stable-ish id for a new BibleRecord. Not a real cuid:
 * `applyBibleFactsAtomic` will merge records by normalized name anyway,
 * so the id only needs to be unique within a single apply batch.
 */
export function newRecordId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type ExtractedRecords = {
  characters: BibleRecord[];
  locations: BibleRecord[];
  items: BibleRecord[];
  worldRules: BibleRecord[];
  plotThreads: BibleRecord[];
  foreshadowing: BibleRecord[];
  timelineEvents: BibleRecord[];
};

/**
 * Convert an extraction payload to a per-category record map. We map
 * `events` into `timelineEvents`, carry each non-character category's
 * `status` if the payload supplies one, and surface `characterStatusChanges`
 * as `attributes` on the corresponding character.
 *
 * `existing` is the project's current StoryBible so the new records
 * inherit the previous id (and thus merge cleanly with prior state).
 */
export function payloadToBibleRecords(
  payload: FactExtractionPayload,
  chapterId: string,
  existing: StoryBibleData,
  now: string = new Date().toISOString()
): ExtractedRecords {
  const existingCharNames = new Set(existing.characters.map((c) => c.name));
  const findExistingChar = (name: string) =>
    existing.characters.find((c) => c.name === name);

  const characters: BibleRecord[] = payload.characters.map((x) => {
    const pre = findExistingChar(x.name);
    const statusChanges = payload.characterStatusChanges.filter((cs) => cs.character === x.name);
    return {
      id: pre?.id ?? newRecordId(),
      name: x.name,
      description: x.role,
      status: (x.status || pre?.status || 'active') as BibleRecord['status'],
      sourceChapterId: chapterId,
      attributes: {
        ...(pre?.attributes || {}),
        ...(statusChanges.length
          ? { lastChange: statusChanges[statusChanges.length - 1].after }
          : {}),
      },
      updatedAt: now,
    };
  });

  // Surface characters from status changes that weren't otherwise listed.
  for (const cs of payload.characterStatusChanges) {
    if (existingCharNames.has(cs.character)) continue;
    if (characters.some((c) => c.name === cs.character)) continue;
    characters.push({
      id: newRecordId(),
      name: cs.character,
      description: '本章有状态变化',
      status: 'active',
      sourceChapterId: chapterId,
      attributes: { lastChange: cs.after, before: cs.before || '' },
      updatedAt: now,
    });
  }

  const findExisting = (arr: BibleRecord[], name: string) =>
    arr.find((r) => r.name === name);

  const mapCategory = (
    arr: BibleRecord[],
    items: Array<{ name: string; description: string; status?: string }>,
    fallbackStatus: BibleRecord['status'] = 'active'
  ): BibleRecord[] =>
    items.map((x) => {
      const pre = findExisting(arr, x.name);
      return {
        id: pre?.id ?? newRecordId(),
        name: x.name,
        description: x.description,
        status: (x.status || pre?.status || fallbackStatus) as BibleRecord['status'],
        sourceChapterId: chapterId,
        updatedAt: now,
      };
    });

  return {
    characters,
    locations: mapCategory(existing.locations, payload.locations),
    items: mapCategory(existing.items, payload.items),
    worldRules: mapCategory(existing.worldRules, payload.worldRules),
    // LLM payload doesn't have plot threads; preserve existing for the project.
    plotThreads: existing.plotThreads,
    foreshadowing: mapCategory(existing.foreshadowing, payload.foreshadowing),
    // Merge LLM-reported events into the timeline; preserve existing timeline events too.
    timelineEvents: [
      ...existing.timelineEvents,
      ...payload.events.map((e, i) => ({
        id: newRecordId(),
        name: e.name,
        description: e.description,
        status: 'active' as const,
        sourceChapterId: chapterId,
        attributes: { order: String(payload.timeline[i]?.order ?? i + 1) },
        updatedAt: now,
      })),
    ],
  };
}

/**
 * Summarize a payload into a tiny preview string for the history list.
 * One line per category, capped at three items, with a "and N more" hint.
 */
export function summarizePayload(payload: FactExtractionPayload): {
  characters: string;
  locations: string;
  items: string;
  worldRules: string;
  foreshadowing: string;
  events: string;
  statusChanges: string;
} {
  const emptyLabel = '—';
  const joiner = '、';
  const formatNames = (names: string[]) => {
    if (names.length === 0) return emptyLabel;
    const preview = names.slice(0, 3).join(joiner);
    return names.length > 3 ? `${preview} 等 ${names.length} 项` : preview;
  };

  return {
    characters: formatNames(payload.characters.map((x) => x.name)),
    locations: formatNames(payload.locations.map((x) => x.name)),
    items: formatNames(payload.items.map((x) => x.name)),
    worldRules: formatNames(payload.worldRules.map((x) => x.name)),
    foreshadowing: formatNames(payload.foreshadowing.map((x) => x.name)),
    events: formatNames(payload.events.map((x) => x.name)),
    statusChanges: formatNames(payload.characterStatusChanges.map((x) => x.character)),
  };
}
