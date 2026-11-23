import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/vitest/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30000,
    hookTimeout: 90000,
    retry: 0,
    allowOnly: false,
    passWithNoTests: false,
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: '../../artifacts/qa/voting-vitest.json',
      junit: '../../artifacts/qa/voting-vitest.xml',
    },
  },
});
