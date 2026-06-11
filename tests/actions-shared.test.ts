// Tests for `src/app/actions/_shared.ts`.
//
// We only test the **pure** helpers here — `ALLOWED_CHAPTER_STATUS` and
// `revalidateProject`. The other exports (`requireProjectOwner` /
// `requireChapterOwner` / `requireReportOwner`) wrap Prisma and would
// belong in an integration suite.
//
// `_shared.ts` does `import { prisma } from '@/lib/db'` at the top level.
// We mock `@/lib/db` and `next/cache` to avoid loading Prisma's binary
// and Next.js's router internals. The behavior under test doesn't touch
// them, but their modules must load for the import chain to succeed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock calls are hoisted to the top of the file by vitest, so these
// stubs are wired up before any import runs. Each one provides the
// minimum surface that `_shared.ts` and its transitive imports reach.
vi.mock('@/lib/db', () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        // Return a function-ish stub that returns a thenable so any
        // accidental call would surface as a no-op rather than a crash.
        return () => Promise.resolve(null);
      },
    }
  ),
}));
vi.mock('@/lib/auth', () => ({
  requireProjectOwner: vi.fn(),
  requireChapterOwner: vi.fn(),
  requireReportOwner: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { ALLOWED_CHAPTER_STATUS, revalidateProject } from '@/app/actions/_shared';
import { CHAPTER_STATUSES } from '@/lib/validation';

describe('ALLOWED_CHAPTER_STATUS', () => {
  it('is a ReadonlySet', () => {
    expect(ALLOWED_CHAPTER_STATUS).toBeInstanceOf(Set);
  });

  it('contains every canonical chapter status', () => {
    for (const status of CHAPTER_STATUSES) {
      expect(ALLOWED_CHAPTER_STATUS.has(status), `missing ${status}`).toBe(true);
    }
  });

  it('contains nothing that is not in CHAPTER_STATUSES', () => {
    for (const status of ALLOWED_CHAPTER_STATUS) {
      expect(CHAPTER_STATUSES).toContain(status);
    }
  });

  it('has the same size as the canonical tuple', () => {
    expect(ALLOWED_CHAPTER_STATUS.size).toBe(CHAPTER_STATUSES.length);
  });

  it('rejects random non-status strings', () => {
    expect(ALLOWED_CHAPTER_STATUS.has('frobnicated')).toBe(false);
    expect(ALLOWED_CHAPTER_STATUS.has('')).toBe(false);
  });
});

describe('revalidateProject', () => {
  beforeEach(() => {
    (revalidatePath as ReturnType<typeof vi.fn>).mockClear();
  });

  it('revalidates exactly the six project-scoped routes', () => {
    revalidateProject('abc');
    expect(revalidatePath).toHaveBeenCalledTimes(6);
  });

  it('revalidates the project root', () => {
    revalidateProject('xyz');
    expect(revalidatePath).toHaveBeenCalledWith('/projects/xyz');
  });

  it('revalidates the prompt, bible, outline, chapters, and consistency tabs', () => {
    revalidateProject('xyz');
    const calls = (revalidatePath as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0]
    );
    for (const tab of ['prompt', 'bible', 'outline', 'chapters', 'consistency']) {
      expect(calls, `missing revalidate for tab ${tab}`).toContain(
        `/projects/xyz/${tab}`
      );
    }
  });

  it('uses the supplied project id, never a hard-coded one', () => {
    revalidateProject('project_42');
    const calls = (revalidatePath as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as string
    );
    for (const path of calls) {
      expect(path).toContain('project_42');
    }
  });
});
