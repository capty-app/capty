import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

import {
  fingerprintMediaFile,
  MediaMetadataService,
  type MediaProbeRunner,
} from '@/main/editor-v2/media/metadata-service';

const temporaryDirectories: string[] = [];

const createFile = async (name: string, content: string): Promise<string> => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-media-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, name);
  await fs.writeFile(filePath, content);
  return filePath;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

const createRunner = (output: string): MediaProbeRunner => ({
  inspect: vi.fn().mockResolvedValue(output),
  inspectDuration: vi.fn().mockResolvedValue(null),
  validateDecode: vi.fn().mockResolvedValue(undefined),
});

describe('Editor V2 media metadata', () => {
  it('accepts video only after a decode validation and preserves stream metadata', async () => {
    const runner = createRunner(`
Duration: 00:00:02.50
Stream #0:0: Video: h264, yuv420p, 1920x1080, 29.97 fps
Stream #0:1: Audio: aac, 48000 Hz, stereo
`);
    vi.mocked(runner.inspectDuration).mockImplementation(
      async (_filePath, streamId) => (streamId === '0:0' ? '2.5' : '1.25')
    );
    const service = new MediaMetadataService(runner);
    const result = await service.probe('/Media/video.mov');

    expect(result).toMatchObject({
      kind: 'video',
      durationTicks: 900_000,
      width: 1920,
      height: 1080,
      frameRate: { numerator: 2997, denominator: 100 },
    });
    expect(result.videoStreams[0]).toMatchObject({
      codec: 'h264',
      durationTicks: 900_000,
    });
    expect(result.audioStreams[0]).toMatchObject({
      codec: 'aac',
      durationTicks: 450_000,
      channels: 2,
      sampleRate: 48_000,
    });
    expect(runner.validateDecode).toHaveBeenCalledWith('/Media/video.mov');
  });

  it('classifies decoded still images and audio independently', async () => {
    const image = new MediaMetadataService(
      createRunner('Stream #0:0: Video: png, rgba, 800x600, 25 fps')
    );
    const audio = new MediaMetadataService(
      createRunner(
        'Duration: 00:01:00.00\nStream #0:0: Audio: pcm_s16le, 44100 Hz, mono'
      )
    );

    await expect(image.probe('/Media/image.bin')).resolves.toMatchObject({
      kind: 'image',
      width: 800,
      height: 600,
    });
    await expect(audio.probe('/Media/audio.bin')).resolves.toMatchObject({
      kind: 'audio',
      durationTicks: 21_600_000,
      channels: 1,
      sampleRate: 44_100,
    });
  });

  it('accepts numeric surround channel layouts', async () => {
    const service = new MediaMetadataService(
      createRunner(
        'Duration: 00:00:02.00\nStream #0:0: Audio: aac, 48000 Hz, 6.1(side)'
      )
    );

    await expect(service.probe('/Media/surround.m4a')).resolves.toMatchObject({
      kind: 'audio',
      channels: 7,
    });
  });

  it('normalizes still-image EXIF and display-matrix orientation metadata', async () => {
    const jpeg = new MediaMetadataService(
      createRunner(
        'Stream #0:0: Video: mjpeg, yuvj420p, 1200x800, 25 fps\norientation : 6'
      )
    );
    const displayRotated = new MediaMetadataService(
      createRunner(
        'Stream #0:0: Video: png, rgba, 800x1200, 25 fps\ndisplaymatrix: rotation of -90.00 degrees'
      )
    );
    const webp = new MediaMetadataService(
      createRunner('Stream #0:0: Video: webp, rgba, 640x480, 25 fps')
    );

    await expect(jpeg.probe('/Media/portrait.jpg')).resolves.toMatchObject({
      width: 1200,
      height: 800,
      orientation: 6,
    });
    await expect(
      displayRotated.probe('/Media/rotated.png')
    ).resolves.toMatchObject({
      width: 800,
      height: 1200,
      orientation: 6,
    });
    await expect(webp.probe('/Media/image.webp')).resolves.toMatchObject({
      width: 640,
      height: 480,
      orientation: 1,
    });
  });

  it('rejects extension-only files and decode failures', async () => {
    const noStreams = new MediaMetadataService(createRunner('Invalid data'));
    await expect(noStreams.probe('/Media/fake.mp4')).rejects.toThrow(
      'no supported media streams'
    );

    const runner = createRunner(
      'Duration: 00:00:01.00\nStream #0:0: Video: h264, yuv420p, 100x100, 30 fps'
    );
    vi.mocked(runner.validateDecode).mockRejectedValueOnce(
      new Error('decode failed')
    );
    await expect(
      new MediaMetadataService(runner).probe('/Media/broken.mp4')
    ).rejects.toThrow('decode failed');
  });

  it('fingerprints large-media inputs through a stable file hash', async () => {
    const filePath = await createFile('media.bin', 'streamed-media');
    const first = await fingerprintMediaFile(filePath);
    const second = await fingerprintMediaFile(filePath);
    expect(first).toMatchObject({
      byteLength: 14,
      sha256: second.sha256,
    });
    expect(first.modifiedAt).toEqual(expect.any(String));
  });
});
