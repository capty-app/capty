import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

import { ThumbnailService } from '@/main/editor-v2/media/thumbnail-service';
import { WaveformService } from '@/main/editor-v2/media/waveform-service';

const temporaryDirectories: string[] = [];

const createPackage = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-cache-'));
  temporaryDirectories.push(root);
  const packagePath = path.join(root, 'Project.capty');
  await fs.mkdir(packagePath);
  return packagePath;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('Editor V2 media caches', () => {
  it('reuses valid waveforms and rebuilds corrupt cache data', async () => {
    const packagePath = await createPackage();
    const generate = vi.fn().mockResolvedValue([0, 0.5, 1]);
    const service = new WaveformService({ generate });
    const first = await service.ensure(
      packagePath,
      'audio',
      '/Media/audio.wav'
    );
    const second = await service.ensure(
      packagePath,
      'audio',
      '/Media/audio.wav'
    );
    expect(first).toBe(second);
    expect(generate).toHaveBeenCalledOnce();

    await fs.writeFile(first, '{corrupt');
    await service.ensure(packagePath, 'audio', '/Media/audio.wav');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await fs.readFile(first, 'utf-8'))).toEqual([0, 0.5, 1]);
  });

  it('isolates waveform caches by stream identity', async () => {
    const packagePath = await createPackage();
    const generate = vi.fn().mockResolvedValue([0, 1, 0]);
    const service = new WaveformService({ generate });

    const system = await service.ensure(
      packagePath,
      'recording',
      '/Media/system.m4a',
      false,
      '0:0',
      'system-audio'
    );
    const microphone = await service.ensure(
      packagePath,
      'recording',
      '/Media/mic.m4a',
      false,
      '0:0',
      'microphone-audio'
    );

    expect(system).not.toBe(microphone);
    expect(generate).toHaveBeenNthCalledWith(1, '/Media/system.m4a', '0:0');
    expect(generate).toHaveBeenNthCalledWith(2, '/Media/mic.m4a', '0:0');
  });

  it('rejects traversal through asset IDs for every cache type', async () => {
    const packagePath = await createPackage();
    const thumbnails = new ThumbnailService({ generate: vi.fn() });
    const waveforms = new WaveformService({ generate: vi.fn() });
    await expect(
      thumbnails.ensure(packagePath, '../project', '/Media/image.png')
    ).rejects.toThrow('Asset ID is not safe');
    await expect(
      waveforms.ensure(packagePath, '../project', '/Media/audio.wav')
    ).rejects.toThrow('Asset ID is not safe');
  });
});
