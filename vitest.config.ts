import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'shared/**/*.test.ts', 'api/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
