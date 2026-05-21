import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['../../tests/**/*.test.ts'],
    pool: 'threads',
    testTimeout: 15000,
    // Integration tests each invoke `npm run build` in beforeAll(); parallel files race on
    // packages/cli/dist/ output (EBUSY/EPERM on Windows). Serialize for deterministic runs.
    fileParallelism: false,
  },
});
