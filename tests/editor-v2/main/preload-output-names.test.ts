import path from 'path';
import fs from 'fs/promises';
import { describe, expect, it } from 'vitest';

import {
  EDITOR_V1_PRELOAD_ENTRY,
  EDITOR_V1_PRELOAD_FILE,
  EDITOR_V2_PRELOAD_ENTRY,
  EDITOR_V2_PRELOAD_FILE,
} from '@/main/editor-v2/preload-files';

describe('editor preload output names', () => {
  it('keeps stable V1 and V2 entry and file names', () => {
    expect(EDITOR_V1_PRELOAD_ENTRY).toBe('preload');
    expect(EDITOR_V1_PRELOAD_FILE).toBe('preload.js');
    expect(EDITOR_V2_PRELOAD_ENTRY).toBe('editor-v2-preload');
    expect(EDITOR_V2_PRELOAD_FILE).toBe('editor-v2-preload.js');
  });

  it('configures both preload inputs with stable Rollup names', async () => {
    const config = await fs.readFile(path.resolve('vite.config.mts'), 'utf-8');
    expect(config).toContain('[EDITOR_V1_PRELOAD_ENTRY]');
    expect(config).toContain('[EDITOR_V2_PRELOAD_ENTRY]');
    expect(config).toContain("entryFileNames: '[name].js'");
    expect(config).toContain('src/preload/editor-v2.ts');
  });
});
