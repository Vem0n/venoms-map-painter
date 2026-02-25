import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: 'src/main/index.ts',
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: 'src/main/preload.ts',
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: 'index.html',
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@engine': resolve(__dirname, 'src/renderer/engine'),
        '@registry': resolve(__dirname, 'src/renderer/registry'),
        '@tools': resolve(__dirname, 'src/renderer/tools'),
        '@ui': resolve(__dirname, 'src/renderer/ui'),
      },
    },
  },
});
