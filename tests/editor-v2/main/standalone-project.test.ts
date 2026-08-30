import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

import {
  MediaMetadataService,
  type MediaProbeRunner,
} from '@/main/editor-v2/media/metadata-service';
import { prepareStandaloneEditorProject } from '@/main/editor-v2/media/standalone-project';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('standalone Editor V2 project preparation', () => {
  it('creates a temporary linked source document without writing beside the media', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-standalone-'));
    temporaryDirectories.push(root);
    const sourcePath = path.join(root, 'source.mov');
    await fs.writeFile(sourcePath, 'video');
    const runner: MediaProbeRunner = {
      inspect: vi
        .fn()
        .mockResolvedValue(
          'Duration: 00:00:02.00\nStream #0:0: Video: h264, yuv420p, 1920x1080, 60 fps'
        ),
      inspectDuration: vi.fn().mockResolvedValue(null),
      validateDecode: vi.fn().mockResolvedValue(undefined),
    };

    const result = await prepareStandaloneEditorProject(
      sourcePath,
      new MediaMetadataService(runner)
    );
    const asset = Object.values(result.project.assets)[0];
    const clip = Object.values(result.project.sequence.clips)[0];
    expect(asset).toMatchObject({
      kind: 'video',
      locator: { kind: 'linked', absolutePath: sourcePath },
      durationTicks: 720_000,
    });
    expect(clip).toMatchObject({
      assetId: asset.id,
      timelineStart: 0,
      timelineDuration: 720_000,
    });
    expect(await fs.readdir(root)).toEqual(['source.mov']);
  });
});
