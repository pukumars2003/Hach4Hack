import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,  // 2 min for race tests
    hookTimeout: 60000,
    // Run test files sequentially to avoid DB conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Single process to share DB connections
      },
    },
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/chaos/**'],
  },
});

