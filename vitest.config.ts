import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@engine': path.resolve(__dirname, 'src/renderer/engine'),
      '@registry': path.resolve(__dirname, 'src/renderer/registry'),
      '@tools': path.resolve(__dirname, 'src/renderer/tools'),
      '@ui': path.resolve(__dirname, 'src/renderer/ui'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
