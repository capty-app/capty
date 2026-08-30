import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
}));

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { MediaService } from '@/main/editor-v2/media/media-service';
import { MediaUrlRegistry } from '@/main/editor-v2/media/media-url-registry';
import {
  MediaMetadataService,
  type MediaProbeRunner,
} from '@/main/editor-v2/media/metadata-service';
import { ThumbnailService } from '@/main/editor-v2/media/thumbnail-service';
import { WaveformService } from '@/main/editor-v2/media/waveform-service';
import type { EditorProjectSession } from '@/main/editor-v2/project/project-service';

const temporaryDirectories: string[] = [];

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-media-service-'));
  temporaryDirectories.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

const imageRunner: MediaProbeRunner = {
  inspect: vi
    .fn()
    .mockResolvedValue('Stream #0:0: Video: png, rgba, 640x480, 25 fps'),
  inspectDuration: vi.fn().mockResolvedValue(null),
  validateDecode: vi.fn().mockResolvedValue(undefined),
};

const createSession = (packagePath: string): EditorProjectSession => ({
  ownerId: 'window',
  lock: { identity: packagePath, ownerId: 'window' },
  location: { kind: 'capty-package', packagePath, format: 'v2' },
  pendingWrites: 0,
  staleRecoveryOpen: false,
  pendingManagedFiles: [],
  linkedPathAuthorization: new Set(),
  mediaRecoveryWarnings: [],
  activeProject: null,
});

const createProject = () =>
  createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });

const createService = (thumbnailGenerate = vi.fn()) => {
  thumbnailGenerate.mockImplementation(async (_source, output) => {
    await fs.writeFile(output, 'thumbnail');
  });
  const registry = new MediaUrlRegistry();
  return {
    service: new MediaService(
      new MediaMetadataService(imageRunner),
      new ThumbnailService({ generate: thumbnailGenerate }),
      new WaveformService({ generate: vi.fn().mockResolvedValue([0, 1, 0]) }),
      registry,
      (() => {
        let id = 0;
        return () => String(++id);
      })()
    ),
    registry,
    thumbnailGenerate,
  };
};

describe('Editor V2 media service', () => {
  it('copies managed imports into independent asset directories with duplicate filenames', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const firstDirectory = path.join(root, 'first');
    const secondDirectory = path.join(root, 'second');
    await Promise.all([
      fs.mkdir(packagePath),
      fs.mkdir(firstDirectory),
      fs.mkdir(secondDirectory),
    ]);
    const firstSource = path.join(firstDirectory, 'image.png');
    const secondSource = path.join(secondDirectory, 'image.png');
    await Promise.all([
      fs.writeFile(firstSource, 'first-image'),
      fs.writeFile(secondSource, 'second-image'),
    ]);
    const session = createSession(packagePath);
    const { service } = createService();

    const first = await service.importMedia(session, 7, firstSource, 'copy');
    const second = await service.importMedia(session, 7, secondSource, 'copy');

    expect(first.asset.locator).toEqual({
      kind: 'managed',
      relativePath: path.join('media', 'asset-1', 'image.png'),
    });
    expect(second.asset.locator).toEqual({
      kind: 'managed',
      relativePath: path.join('media', 'asset-2', 'image.png'),
    });
    expect(
      await fs.readFile(
        path.join(packagePath, 'media', 'asset-1', 'image.png'),
        'utf-8'
      )
    ).toBe('first-image');
    expect(await fs.readFile(firstSource, 'utf-8')).toBe('first-image');
    expect(first.media.mediaUrl).toMatch(/^capty-media:\/\/resource\//);
    expect(first.media.mediaUrl).not.toContain(firstSource);
  });

  it('keeps preexisting package media read-only instead of copying it', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const sourcePath = path.join(packagePath, 'recording.png');
    await fs.mkdir(packagePath);
    await fs.writeFile(sourcePath, 'legacy-image');
    const session = createSession(packagePath);
    const { service } = createService();
    const imported = await service.importMedia(session, 8, sourcePath, 'copy');

    expect(imported.asset.locator).toMatchObject({
      kind: 'legacy-package-read-only',
      relativePath: 'recording.png',
    });
    expect(await fs.readFile(sourcePath, 'utf-8')).toBe('legacy-image');
    expect(await fs.readdir(path.join(packagePath, 'media'))).toEqual([
      '.tombstones',
    ]);
  });

  it('rejects importing files already owned by a managed asset directory', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const sourcePath = path.join(
      packagePath,
      'media',
      'asset-existing',
      'image.png'
    );
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, 'managed-image');
    const session = createSession(packagePath);
    const { service } = createService();

    await expect(
      service.importMedia(session, 8, sourcePath, 'copy')
    ).rejects.toThrow('already managed');
  });

  it('rejects linked media that changes while metadata is inspected', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const sourcePath = path.join(root, 'linked.png');
    await fs.mkdir(packagePath);
    await fs.writeFile(sourcePath, 'before');
    const runner: MediaProbeRunner = {
      inspect: vi.fn(async filePath => {
        await fs.writeFile(filePath, 'after');
        return 'Stream #0:0: Video: png, rgba, 640x480, 25 fps';
      }),
      inspectDuration: vi.fn().mockResolvedValue(null),
      validateDecode: vi.fn().mockResolvedValue(undefined),
    };
    const service = new MediaService(
      new MediaMetadataService(runner),
      new ThumbnailService({ generate: vi.fn() }),
      new WaveformService({ generate: vi.fn() }),
      new MediaUrlRegistry()
    );

    await expect(
      service.importMedia(createSession(packagePath), 9, sourcePath, 'link')
    ).rejects.toThrow('changed while it was being inspected');
  });

  it('detects linked media changes and missing files without returning raw paths', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const sourcePath = path.join(root, 'linked.png');
    await fs.mkdir(packagePath);
    await fs.writeFile(sourcePath, 'linked-image');
    const session = createSession(packagePath);
    const { service } = createService();
    const imported = await service.importMedia(session, 9, sourcePath, 'link');
    const project = createProject();
    project.assets[imported.asset.id] = imported.asset;

    expect(
      await service.resolveStatus(session, 9, project, imported.asset.id)
    ).toMatchObject({ availability: 'available' });
    await fs.writeFile(sourcePath, 'changed-image');
    const changed = await service.resolveStatus(
      session,
      9,
      project,
      imported.asset.id
    );
    expect(changed).toEqual({
      assetId: imported.asset.id,
      availability: 'changed',
    });
    expect(JSON.stringify(changed)).not.toContain(sourcePath);
    await fs.rm(sourcePath);
    await expect(
      service.resolveStatus(session, 9, project, imported.asset.id)
    ).resolves.toEqual({
      assetId: imported.asset.id,
      availability: 'missing',
    });
  });

  it('authorizes the locator that owns a requested Capty stream', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const recordingPath = path.join(packagePath, 'recording.mov');
    const cameraPath = path.join(packagePath, 'camera.mov');
    await fs.mkdir(packagePath);
    await Promise.all([
      fs.writeFile(recordingPath, 'recording'),
      fs.writeFile(cameraPath, 'camera'),
    ]);
    const session = createSession(packagePath);
    const { service, registry, thumbnailGenerate } = createService();
    const project = createProject();
    project.assets.recording = {
      id: 'recording',
      kind: 'capty-recording',
      name: 'Recording',
      locator: {
        kind: 'legacy-package-read-only',
        relativePath: 'recording.mov',
        fingerprint: { byteLength: 9, sha256: 'unused' },
      },
      importedAt: '2026-08-30T00:00:00.000Z',
      durationTicks: 1_000,
      width: 1920,
      height: 1080,
      frameRate: { numerator: 60, denominator: 1 },
      videoStreams: [
        {
          id: 'screen-stream',
          codec: 'h264',
          durationTicks: 1_000,
          width: 1920,
          height: 1080,
          frameRate: { numerator: 60, denominator: 1 },
          hasAlpha: false,
        },
      ],
      audioStreams: [],
      sources: {
        cameraVideo: {
          kind: 'video',
          locator: { kind: 'managed', relativePath: 'camera.mov' },
          recordingOffsetTicks: 100,
          durationTicks: 700,
          streams: [
            {
              id: 'screen-stream',
              codec: 'h264',
              durationTicks: 700,
              width: 640,
              height: 480,
              frameRate: { numerator: 30, denominator: 1 },
              hasAlpha: false,
            },
          ],
        },
      },
    };

    const status = await service.resolveStatus(
      session,
      9,
      project,
      'recording',
      false,
      'screen-stream',
      'camera-video'
    );
    expect(status).toMatchObject({
      assetId: 'recording',
      sourceStreamId: 'screen-stream',
      sourceRole: 'camera-video',
      availability: 'available',
    });
    expect(registry.resolve(status.mediaUrl ?? '')?.filePath).toBe(cameraPath);
    expect(thumbnailGenerate).not.toHaveBeenCalled();
    await expect(
      service.resolveStatus(
        session,
        9,
        project,
        'recording',
        false,
        'screen-stream'
      )
    ).rejects.toThrow('has ambiguous stream screen-stream');
    await expect(
      service.resolveStatus(
        session,
        9,
        project,
        'recording',
        false,
        'missing-stream'
      )
    ).rejects.toThrow('has no stream missing-stream');
  });

  it('relinks missing media only after compatible decode validation', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const sourcePath = path.join(root, 'linked.png');
    const replacementPath = path.join(root, 'replacement.png');
    await fs.mkdir(packagePath);
    await fs.writeFile(sourcePath, 'linked-image');
    await fs.writeFile(replacementPath, 'replacement-image');
    const session = createSession(packagePath);
    const { service, thumbnailGenerate } = createService();
    const imported = await service.importMedia(session, 10, sourcePath, 'link');
    const project = createProject();
    project.assets[imported.asset.id] = imported.asset;
    await fs.rm(sourcePath);

    const relinked = await service.relink(
      session,
      10,
      project,
      imported.asset.id,
      replacementPath
    );
    expect(relinked.asset.locator).toMatchObject({
      kind: 'linked',
      absolutePath: await fs.realpath(replacementPath),
    });
    expect(relinked.media.availability).toBe('available');
    expect(thumbnailGenerate).toHaveBeenCalledTimes(2);
    expect(
      session.linkedPathAuthorization.has(await fs.realpath(replacementPath))
    ).toBe(true);
  });

  it('rejects relinks that cannot satisfy existing clip ranges', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const sourcePath = path.join(root, 'source.mov');
    const replacementPath = path.join(root, 'replacement.mov');
    await fs.mkdir(packagePath);
    await fs.writeFile(sourcePath, 'source-video');
    await fs.writeFile(replacementPath, 'short-video');
    const runner: MediaProbeRunner = {
      inspect: vi
        .fn()
        .mockResolvedValue(
          'Duration: 00:00:01.00\nStream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps'
        ),
      inspectDuration: vi.fn().mockResolvedValue('1'),
      validateDecode: vi.fn().mockResolvedValue(undefined),
    };
    const service = new MediaService(
      new MediaMetadataService(runner),
      new ThumbnailService({ generate: vi.fn() }),
      new WaveformService({ generate: vi.fn() }),
      new MediaUrlRegistry()
    );
    const session = createSession(packagePath);
    const project = createProject();
    project.assets.video = {
      id: 'video',
      kind: 'video',
      name: 'Video',
      locator: {
        kind: 'linked',
        absolutePath: sourcePath,
        fingerprint: { byteLength: 12, sha256: 'source' },
      },
      importedAt: '2026-08-30T00:00:00.000Z',
      durationTicks: 720_000,
      width: 1920,
      height: 1080,
      frameRate: { numerator: 30, denominator: 1 },
      videoStreams: [
        {
          id: '0:0',
          codec: 'h264',
          durationTicks: 720_000,
          width: 1920,
          height: 1080,
          frameRate: { numerator: 30, denominator: 1 },
          hasAlpha: false,
        },
      ],
      audioStreams: [],
    };
    const trackId = project.sequence.videoTrackIds[0];
    project.sequence.clips.clip = {
      id: 'clip',
      kind: 'video',
      trackId,
      assetId: 'video',
      name: 'Video',
      timelineStart: 0,
      timelineDuration: 720_000,
      sourceStart: 0,
      sourceDuration: 720_000,
      playbackRate: { numerator: 1, denominator: 1 },
      sourceStreamId: '0:0',
      effects: [],
    };
    project.sequence.tracks[trackId].clipIds.push('clip');

    await expect(
      service.relink(session, 10, project, 'video', replacementPath)
    ).rejects.toThrow('not compatible');
  });

  it('reports missing managed copies instead of authorizing dead URLs', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const sourcePath = path.join(root, 'image.png');
    await fs.mkdir(packagePath);
    await fs.writeFile(sourcePath, 'image');
    const session = createSession(packagePath);
    const { service } = createService();
    const imported = await service.importMedia(session, 11, sourcePath, 'copy');
    const project = createProject();
    project.assets[imported.asset.id] = imported.asset;
    const locator = imported.asset.locator;
    if (locator.kind !== 'managed') throw new Error('Expected managed media');
    await fs.rm(path.join(packagePath, locator.relativePath));

    await expect(
      service.resolveStatus(session, 11, project, imported.asset.id)
    ).resolves.toEqual({
      assetId: imported.asset.id,
      availability: 'missing',
    });
  });

  it('rebuilds missing thumbnail cache entries', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const sourcePath = path.join(root, 'image.png');
    await fs.mkdir(packagePath);
    await fs.writeFile(sourcePath, 'image');
    const session = createSession(packagePath);
    const thumbnailGenerate = vi.fn();
    const { service } = createService(thumbnailGenerate);
    const imported = await service.importMedia(session, 11, sourcePath, 'copy');
    const project = createProject();
    project.assets[imported.asset.id] = imported.asset;
    expect(thumbnailGenerate).toHaveBeenCalledOnce();

    const thumbnailPath = path.join(
      packagePath,
      'cache',
      'thumbnails',
      `${imported.asset.id}.jpg`
    );
    await fs.rm(thumbnailPath);
    await service.resolveStatus(session, 11, project, imported.asset.id);
    expect(thumbnailGenerate).toHaveBeenCalledTimes(2);
  });

  it('rejects traversal through project-relative managed locators', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    await fs.mkdir(packagePath);
    const session = createSession(packagePath);
    const { service } = createService();
    const project = createProject();
    project.assets.traversal = {
      id: 'traversal',
      kind: 'image',
      name: 'Traversal',
      locator: { kind: 'managed', relativePath: '../secret.png' },
      importedAt: '2026-08-30T00:00:00.000Z',
      width: 10,
      height: 10,
      orientation: 1,
      defaultStillDurationTicks: 100,
    };
    await expect(
      service.resolveStatus(session, 1, project, 'traversal')
    ).rejects.toThrow('escapes the package root');
  });
});
