import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/empty.ts'),
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
});
