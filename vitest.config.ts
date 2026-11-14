import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 resolves the tsconfig `paths` aliases natively; no extra plugin is needed.
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
});
