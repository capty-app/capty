import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.{ts,tsx}', 'tests/**/*.spec.{ts,tsx}'],
          exclude: ['tests/editor-v2/renderer/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: [
            'tests/editor-v2/renderer/**/*.test.{ts,tsx}',
            'tests/editor-v2/renderer/**/*.spec.{ts,tsx}',
          ],
          setupFiles: ['tests/editor-v2/helpers/setup-renderer.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/main/**/*.ts',
        'src/editor-v1/**/*.ts',
        'src/editor-v2/**/*.ts',
        'src/renderer/editor-v2/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/__tests__/**',
        'src/main/binaries/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
