import { defineConfig } from 'vite';
import path from 'node:path';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import {
  EDITOR_V1_PRELOAD_ENTRY,
  EDITOR_V2_PRELOAD_ENTRY,
} from './src/main/editor-v2/preload-files';

const alias = {
  '@': path.resolve(__dirname, './src'),
  '@build': path.resolve(__dirname, './build'),
};

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    ...electron([
      {
        entry: 'src/main/main.ts',
        vite: {
          resolve: { alias },
        },
      },
      {
        entry: {
          [EDITOR_V1_PRELOAD_ENTRY]: path.join(
            __dirname,
            'src/preload/preload.ts'
          ),
        },
        onstart: ({ reload }) => reload(),
        vite: {
          resolve: { alias },
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
      {
        entry: {
          [EDITOR_V2_PRELOAD_ENTRY]: path.join(
            __dirname,
            'src/preload/editor-v2.ts'
          ),
        },
        onstart: ({ reload }) => reload(),
        vite: {
          resolve: { alias },
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
    ]),
    ...(process.env.NODE_ENV === 'test' ? [] : [electronRenderer()]),
  ],
  resolve: {
    alias,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        history: path.resolve(__dirname, 'history.html'),
      },
    },
  },
});
