import { defineConfig } from 'vite';
import path from 'node:path';
import electron from 'vite-plugin-electron/simple';
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
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'src/main/main.ts',
        vite: {
          resolve: { alias },
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: {
          [EDITOR_V1_PRELOAD_ENTRY]: path.join(
            __dirname,
            'src/preload/preload.ts'
          ),
          [EDITOR_V2_PRELOAD_ENTRY]: path.join(
            __dirname,
            'src/preload/editor-v2.ts'
          ),
        },
        vite: {
          resolve: { alias },
          build: {
            rollupOptions: {
              output: {
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer:
        process.env.NODE_ENV === 'test'
          ? // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
            undefined
          : {},
    }),
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
