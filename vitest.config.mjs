import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    root: '.',
    include: ['tests/**/*.test.mjs'],
    sequence: { shuffle: false },
    pool: 'forks',
  },
});
