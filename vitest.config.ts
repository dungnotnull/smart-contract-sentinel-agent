import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000, // 30 second timeout for integration tests
    hookTimeout: 30000,
    threads: false, // Run tests single-threaded for Anvil compatibility
    teardownTimeout: 10000,
    sequence: {
      shuffle: false, // Run tests in order for predictable setup
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'tests/'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
});
