// Tests for `src/lib/extraction.ts`.
//
// We focus on the contract that the history view depends on:
//   - `payloadToBibleRecords` carries ids over from the existing bible
//   - it preserves `plotThreads` (payload has no such field)
//   - it merges `events` into `timelineEvents` with an `order` attribute
//   - `summarizePayload` shows a comma-joined preview capped at 3

import { describe, it, expect } from 'vitest';
import {
  payloadToBibleRecords,
  summarizePayload,
  newRecordId,
  type ExtractedRecords,
} from '@/lib/extraction';
import type { FactExtractionPayload, StoryBibleData } from '@/types/domain';

const emptyBible: StoryBibleData = {
  characters: [],
  locations: [],
  items: [],
  worldRules: [],
  plotThreads: [],
  foreshadowing: [],
  timelineEvents: [],
};

const samplePayload: FactExtractionPayload = {
  characters: [
    { name: 'Alice', role: 'protagonist', status: 'active' },
    { name: 'Bob', role: 'mentor', status: 'active' },
  ],
  locations: [{ name: 'The Library', description: 'vast and dusty' }],
  items: [{ name: 'Silver Key', description: 'opens the archive', owner: 'Alice' }],
  events: [
    { name: 'Found the door', description: 'behind the curtain' },
    { name: 'Met the keeper', description: 'silent and pale' },
  ],
  worldRules: [{ name: 'No magic', description: 'magic is forbidden' }],
  characterStatusChanges: [
    { character: 'Alice', before: 'curious', after: 'committed' },
  ],
  foreshadowing: [{ name: 'The silver key', description: 'appears twice' }],
  timeline: [
    { name: 'Found the door', description: '', order: 1 },
    { name: 'Met the keeper', description: '', order: 2 },
  ],
};

describe('newRecordId', () => {
  it('returns a non-empty string', () => {
    expect(typeof newRecordId()).toBe('string');
    expect(newRecordId().length).toBeGreaterThan(0);
  });

  it('returns different values on subsequent calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(newRecordId());
    expect(seen.size).toBe(20);
  });
});

describe('payloadToBibleRecords', () => {
  it('returns all seven category buckets with the right shape', () => {
    const out = payloadToBibleRecords(samplePayload, 'ch1', emptyBible, '2024-01-01T00:00:00.000Z');
    const expected: (keyof ExtractedRecords)[] = [
      'characters', 'locations', 'items', 'worldRules',
      'plotThreads', 'foreshadowing', 'timelineEvents',
    ];
    for (const key of expected) {
      expect(out[key]).toBeDefined();
      expect(Array.isArray(out[key])).toBe(true);
    }
  });

  it('preserves ids for characters already in the bible', () => {
    const bible: StoryBibleData = {
      ...emptyBible,
      characters: [
        {
          id: 'existing_alice',
          name: 'Alice',
          description: 'old role',
          status: 'active',
          sourceChapterId: 'ch0',
          attributes: { foo: 'bar' },
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    };
    const out = payloadToBibleRecords(samplePayload, 'ch1', bible);
    const alice = out.characters.find((c) => c.name === 'Alice')!;
    expect(alice.id).toBe('existing_alice');
    // Existing attributes are preserved
    expect(alice.attributes?.foo).toBe('bar');
    // New status-change attribute is merged in
    expect(alice.attributes?.lastChange).toBe('committed');
  });

  it('preserves the previous plotThreads (payload has no such field)', () => {
    const existing: StoryBibleData = {
      ...emptyBible,
      plotThreads: [
        {
          id: 'pt1',
          name: 'The Quest',
          description: 'find the artifact',
          status: 'active',
          sourceChapterId: 'ch0',
          updatedAt: '',
        },
      ],
    };
    const out = payloadToBibleRecords(samplePayload, 'ch1', existing);
    expect(out.plotThreads).toEqual(existing.plotThreads);
  });

  it('appends LLM-reported events to the existing timeline', () => {
    const existing: StoryBibleData = {
      ...emptyBible,
      timelineEvents: [
        {
          id: 'tl1',
          name: 'Born',
          description: 'opened eyes',
          status: 'active',
          sourceChapterId: 'ch0',
          updatedAt: '',
        },
      ],
    };
    const out = payloadToBibleRecords(samplePayload, 'ch1', existing);
    expect(out.timelineEvents.length).toBe(3);
    expect(out.timelineEvents[0].name).toBe('Born');
    expect(out.timelineEvents[1].name).toBe('Found the door');
    // Order comes from the payload's `timeline` array
    expect(out.timelineEvents[1].attributes?.order).toBe('1');
    expect(out.timelineEvents[2].attributes?.order).toBe('2');
  });

  it('records the source chapter id on every new record', () => {
    const out = payloadToBibleRecords(samplePayload, 'ch42', emptyBible);
    for (const arr of Object.values(out)) {
      for (const rec of arr) {
        expect(rec.sourceChapterId).toBe('ch42');
      }
    }
  });

  it('promotes a character from a statusChange that was not in the characters list', () => {
    const payload: FactExtractionPayload = {
      ...samplePayload,
      characters: [],
      characterStatusChanges: [
        { character: 'Ghost', before: 'unknown', after: 'revealed' },
      ],
    };
    const out = payloadToBibleRecords(payload, 'ch1', emptyBible);
    const ghost = out.characters.find((c) => c.name === 'Ghost')!;
    expect(ghost).toBeDefined();
    expect(ghost.description).toBe('本章有状态变化');
    expect(ghost.attributes?.lastChange).toBe('revealed');
    expect(ghost.attributes?.before).toBe('unknown');
  });

  it('does not duplicate a character that is both in the list AND in statusChanges', () => {
    const out = payloadToBibleRecords(samplePayload, 'ch1', emptyBible);
    const aliceCount = out.characters.filter((c) => c.name === 'Alice').length;
    expect(aliceCount).toBe(1);
  });

  it('falls back to the existing record status when payload omits it', () => {
    const bible: StoryBibleData = {
      ...emptyBible,
      locations: [
        {
          id: 'lib1',
          name: 'The Library',
          description: 'old desc',
          status: 'lost',
          sourceChapterId: 'ch0',
          updatedAt: '',
        },
      ],
    };
    const out = payloadToBibleRecords(samplePayload, 'ch1', bible);
    const loc = out.locations[0];
    expect(loc.id).toBe('lib1');
    expect(loc.status).toBe('lost'); // payload's status is undefined, kept prior
  });

  it('honors the explicit `now` argument for determinism', () => {
    const out = payloadToBibleRecords(
      samplePayload,
      'ch1',
      emptyBible,
      '2024-12-31T23:59:59.000Z'
    );
    expect(out.characters[0].updatedAt).toBe('2024-12-31T23:59:59.000Z');
  });
});

describe('summarizePayload', () => {
  it('joins up to three names with 、', () => {
    const s = summarizePayload(samplePayload);
    expect(s.characters).toBe('Alice、Bob');
    expect(s.locations).toBe('The Library');
    expect(s.items).toBe('Silver Key');
    expect(s.foreshadowing).toBe('The silver key');
    expect(s.statusChanges).toBe('Alice');
  });

  it('uses "—" for empty categories', () => {
    const s = summarizePayload({
      ...samplePayload,
      characters: [],
      locations: [],
      items: [],
      worldRules: [],
      foreshadowing: [],
      events: [],
      characterStatusChanges: [],
    });
    expect(s.characters).toBe('—');
    expect(s.events).toBe('—');
  });

  it('appends "等 N 项" when there are more than three items', () => {
    const s = summarizePayload({
      ...samplePayload,
      characters: [
        { name: 'A', role: '', status: 'active' },
        { name: 'B', role: '', status: 'active' },
        { name: 'C', role: '', status: 'active' },
        { name: 'D', role: '', status: 'active' },
      ],
    });
    expect(s.characters).toBe('A、B、C 等 4 项');
  });
});
