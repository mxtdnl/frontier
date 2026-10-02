import { defineConfig } from 'vitest/config';

/** Rules tests run only inside `firebase emulators:exec` (npm run test:rules). */
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts', 'tests/emulator/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
