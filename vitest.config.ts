// Vitest configuration. Lives at the project root so `vitest` can be
// invoked as `npm test` / `npx vitest` without extra arguments.
//
// Why this file exists:
//   - The codebase uses the `@/...` path alias (see `tsconfig.json`).
//     Vitest does not read `tsconfig.json`'s `paths` by default, so we
//     mirror them here.
//   - The `src/app/actions/**` files are marked `'use server'` and have
//     transitive imports of `next/cache` / `next/headers` / `@prisma/client`
//     that we do NOT want to load in a unit test. The unit suite targets
//     pure modules only; integration tests would be a separate suite.

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Domain actions pull in `'use server'` directives, Prisma, and
    // Next.js internals. Keep the unit suite focused on pure logic.
    exclude: ['node_modules/**', 'dist/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Tight thresholds on the pure modules we test; the rest of the
      // codebase is covered by manual / integration tests.
      include: [
        'src/lib/errors.ts',
        'src/lib/extraction.ts',
        'src/lib/validation.ts',
        'src/lib/rate-limit.ts',
        'src/lib/ai/retry.ts',
        'src/app/actions/_shared.ts',
        'src/app/actions/dev-auth.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
      },
    },
  },
});
