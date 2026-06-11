'use server';

import { prisma } from '@/lib/db';
import {
  applyBibleFactsAtomic,
  appendBibleRecords,
  getOrCreateBible,
  setBibleCategory,
  deleteBibleRecord as deleteBibleRecordLib,
} from '@/lib/bible';
import { UserError } from '@/lib/errors';
import type { StoryBibleData, BibleRecord } from '@/types/domain';
import {
  parseInput,
  addBibleRecordActionSchema,
  applyFactsToBibleActionSchema,
  updateBibleRecordActionSchema,
  deleteBibleRecordActionSchema,
} from '@/lib/validation';
import { revalidateProject, requireProjectOwner } from './_shared';

export async function addBibleRecordAction(
  projectId: string,
  category: keyof StoryBibleData,
  record: BibleRecord
) {
  parseInput(
    { projectId, category, record },
    addBibleRecordActionSchema,
    'addBibleRecordAction'
  );
  await requireProjectOwner(projectId);
  await appendBibleRecords(projectId, category, [record]);
  revalidateProject(projectId);
}

export async function applyFactsToBibleAction(
  projectId: string,
  facts: {
    characters: BibleRecord[];
    locations: BibleRecord[];
    items: BibleRecord[];
    worldRules: BibleRecord[];
    plotThreads: BibleRecord[];
    foreshadowing: BibleRecord[];
    timelineEvents: BibleRecord[];
  },
  appliedExtractionId?: string
) {
  parseInput(
    { projectId, facts, appliedExtractionId },
    applyFactsToBibleActionSchema,
    'applyFactsToBibleAction'
  );
  await requireProjectOwner(projectId);
  if (
    facts.characters.length === 0 &&
    facts.locations.length === 0 &&
    facts.items.length === 0 &&
    facts.worldRules.length === 0 &&
    facts.plotThreads.length === 0 &&
    facts.foreshadowing.length === 0 &&
    facts.timelineEvents.length === 0
  ) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    await applyBibleFactsAtomic(projectId, facts, tx);
    if (appliedExtractionId) {
      // Mark the source extraction as applied so future history views know
      // which extraction produced the current bible state.
      try {
        await tx.factExtraction.update({
          where: { id: appliedExtractionId },
          data: { status: 'applied' },
        });
      } catch (updateErr) {
        // Extraction may have been deleted; not fatal. Log so the operator
        // can spot a stale appliedExtractionId being passed in the wild.
        // eslint-disable-next-line no-console
        console.warn('[applyFactsToBibleAction] failed to mark extraction applied', {
          appliedExtractionId,
          cause: updateErr,
        });
      }
    }
  });
  revalidateProject(projectId);
}

export async function updateBibleRecordAction(
  projectId: string,
  category: keyof StoryBibleData,
  record: BibleRecord
) {
  parseInput(
    { projectId, category, record },
    updateBibleRecordActionSchema,
    'updateBibleRecordAction'
  );
  await requireProjectOwner(projectId);
  const bible = await getOrCreateBible(projectId);
  const existing = bible[category];
  const next = existing.map((r) => (r.id === record.id ? record : r));
  await setBibleCategory(projectId, category, next);
  revalidateProject(projectId);
}

export async function deleteBibleRecordAction(
  projectId: string,
  category: keyof StoryBibleData,
  recordId: string
) {
  parseInput(
    { projectId, category, recordId },
    deleteBibleRecordActionSchema,
    'deleteBibleRecordAction'
  );
  await requireProjectOwner(projectId);
  await deleteBibleRecordLib(projectId, category, recordId);
  revalidateProject(projectId);
}
