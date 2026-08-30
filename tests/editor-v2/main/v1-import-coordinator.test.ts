import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createV1ImportManifest,
  fingerprintManifest,
} from '@/main/editor-v2/data/legacy-data-reader';
import { EditorProjectService } from '@/main/editor-v2/project/project-service';
import {
  prepareV1ProjectImport,
  type LegacyMediaProbeService,
} from '@/main/editor-v2/project/v1-import-coordinator';
import { DEFAULT_AUDIO_STYLE } from '@/types/audio';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
import type { VideoEditorState } from '@/types/video-editor-state';
import { DEFAULT_ZOOM_SETTINGS } from '@/types/zoom';

const temporaryDirectories: string[] = [];

const createState = (): VideoEditorState => ({
  version: 1,
  savedAt: '2026-08-30T00:00:00.000Z',
  recordingType: 'ios-device',
  segments: [
    {
      id: 'segment',
      originalStart: 0,
      originalEnd: 4,
      trimMinStart: 0,
      trimMaxEnd: 4,
    },
  ],
  cursorStyle: DEFAULT_CURSOR_STYLE,
  cameraStyle: DEFAULT_CAMERA_STYLE,
  keyboardStyle: DEFAULT_KEYBOARD_STYLE,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  audioStyle: DEFAULT_AUDIO_STYLE,
  zoomSegments: [],
  zoomSettings: DEFAULT_ZOOM_SETTINGS,
  firstFrame: {
    enabled: true,
    imageData: `data:image/png;base64,${Buffer.from('first-frame').toString('base64')}`,
    fit: 'cover',
  },
  ui: { sidebarOpen: true, sidebarTab: 'cursor' },
});

const createProbes = (): LegacyMediaProbeService => ({
  probeVideo: async filePath => {
    if (path.basename(filePath) !== 'recording.mov') return null;
    return {
      durationSeconds: '4.0',
      width: 1920,
      height: 1080,
      frameRate: { numerator: 60, denominator: 1 },
      videoStreams: [
        {
          id: 'video',
          codec: 'h264',
          durationTicks: 1_440_000,
          width: 1920,
          height: 1080,
          frameRate: { numerator: 60, denominator: 1 },
          hasAlpha: false,
        },
      ],
      audioStreams: [],
    };
  },
  probeAudio: async () => null,
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('V1 import coordinator', () => {
  it('prepares deterministically in memory and materializes only on first save', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-v1-import-'));
    temporaryDirectories.push(root);
    const packagePath = path.join(root, 'Legacy.capty');
    await fs.mkdir(packagePath);
    await fs.writeFile(path.join(packagePath, 'recording.mov'), 'recording');
    await fs.writeFile(
      path.join(packagePath, 'state.json'),
      JSON.stringify(createState())
    );
    const originalManifest = await createV1ImportManifest(packagePath);
    const originalFingerprint = fingerprintManifest(originalManifest);
    const importInput = {
      packagePath,
      projectId: 'project',
      sequenceId: 'sequence',
      createdAt: '2026-08-30T00:00:00.000Z',
      importedAt: '2026-08-30T01:00:00.000Z',
      probes: createProbes(),
    };

    const first = await prepareV1ProjectImport(importInput);
    const second = await prepareV1ProjectImport(importInput);
    expect(first.project).toEqual(second.project);
    expect(first.pendingManagedFiles).toEqual(second.pendingManagedFiles);
    expect(first.pendingManagedFiles).toHaveLength(2);
    expect(first.project.sequence.preRoll).toMatchObject({
      kind: 'output-frame-count',
      frames: 1,
    });
    await expect(
      fs.access(path.join(packagePath, 'project.json'))
    ).rejects.toThrow();
    await expect(fs.access(path.join(packagePath, 'media'))).rejects.toThrow();
    expect(fingerprintManifest(await createV1ImportManifest(packagePath))).toBe(
      originalFingerprint
    );

    const service = new EditorProjectService();
    const opened = await service.open(
      packagePath,
      'window-1',
      async () => first
    );
    await expect(
      service.saveProject(opened.session, 0, opened.project)
    ).resolves.toMatchObject({ status: 'saved', revision: 1 });
    for (const file of first.pendingManagedFiles ?? []) {
      await expect(
        fs.readFile(path.join(packagePath, file.relativePath))
      ).resolves.toEqual(Buffer.from(file.bytes));
    }
    expect(
      fingerprintManifest(
        (await createV1ImportManifest(packagePath)).filter(file =>
          originalManifest.some(
            original => original.relativePath === file.relativePath
          )
        )
      )
    ).toBe(originalFingerprint);
    service.release(opened.session);

    const reopened = await service.open(packagePath, 'window-2', undefined);
    expect(reopened.divergenceDetected).toBe(false);
    expect(reopened.project.revision).toBe(1);
    service.release(reopened.session);
  });

  it('ignores unrelated media epochs and preserves zero-offset V1 streams', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-v1-import-'));
    temporaryDirectories.push(root);
    const packagePath = path.join(root, 'Legacy.capty');
    await fs.mkdir(packagePath);
    await Promise.all([
      fs.writeFile(path.join(packagePath, 'recording.mov'), 'recording'),
      fs.writeFile(path.join(packagePath, 'system.m4a'), 'system'),
      fs.writeFile(path.join(packagePath, 'mic.m4a'), 'microphone'),
      fs.writeFile(path.join(packagePath, 'camera.mov'), 'camera'),
      fs.writeFile(
        path.join(packagePath, 'state.json'),
        JSON.stringify(createState())
      ),
    ]);
    const audioStream = {
      id: 'audio',
      codec: 'pcm_s16le',
      durationTicks: 1_440_000,
      channels: 2,
      sampleRate: 48_000,
    };
    const probes: LegacyMediaProbeService = {
      probeVideo: async filePath => {
        const fileName = path.basename(filePath);
        if (fileName !== 'recording.mov' && fileName !== 'camera.mov')
          return null;
        const isRecording = fileName === 'recording.mov';
        return {
          durationSeconds: '4.0',
          width: isRecording ? 1920 : 1280,
          height: isRecording ? 1080 : 720,
          frameRate: { numerator: 60, denominator: 1 },
          videoStreams: [
            {
              id: 'video',
              codec: 'h264',
              durationTicks: 1_440_000,
              width: isRecording ? 1920 : 1280,
              height: isRecording ? 1080 : 720,
              frameRate: { numerator: 60, denominator: 1 },
              hasAlpha: false,
            },
          ],
          audioStreams: [],
          recordingOffsetSeconds: isRecording ? '100.125' : '100.625',
        };
      },
      probeAudio: async filePath => {
        const fileName = path.basename(filePath);
        if (fileName !== 'system.m4a' && fileName !== 'mic.m4a') {
          return null;
        }
        return {
          durationSeconds: '4.0',
          streams: [audioStream],
          channels: 2,
          sampleRate: 48_000,
          recordingOffsetSeconds:
            fileName === 'system.m4a' ? '100.375' : '99.875',
        };
      },
    };

    const prepared = await prepareV1ProjectImport({
      packagePath,
      projectId: 'project',
      sequenceId: 'sequence',
      createdAt: '2026-08-30T00:00:00.000Z',
      importedAt: '2026-08-30T01:00:00.000Z',
      probes,
    });
    const recordingAsset = Object.values(prepared.project.assets).find(
      asset => asset.kind === 'capty-recording'
    );

    expect(recordingAsset).toMatchObject({
      kind: 'capty-recording',
      sources: {
        systemAudio: { recordingOffsetTicks: 0 },
        microphoneAudio: { recordingOffsetTicks: 0 },
        cameraVideo: { recordingOffsetTicks: 0 },
      },
    });
    const screenClip = Object.values(prepared.project.sequence.clips).find(
      clip => clip.kind === 'video' && clip.name === 'Screen'
    );
    const cameraClip = Object.values(prepared.project.sequence.clips).find(
      clip => clip.kind === 'video' && clip.name === 'Camera'
    );
    expect(screenClip?.timelineStart).toBe(0);
    expect(cameraClip?.timelineStart).toBe(0);
  });

  it('rejects malicious image MIME subtypes without touching V1 state', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-v1-import-'));
    temporaryDirectories.push(root);
    const packagePath = path.join(root, 'Legacy.capty');
    await fs.mkdir(packagePath);
    await fs.writeFile(path.join(packagePath, 'recording.mov'), 'recording');
    const state = createState();
    state.wallpaper = {
      enabled: true,
      gradient: null,
      backgroundImage: 'data:image/x/../../../state.json,overwritten',
      padding: 0,
      corners: 0,
      shadow: 0,
      aspectRatio: null,
      deviceFrame: false,
    };
    const stateBytes = Buffer.from(JSON.stringify(state));
    await fs.writeFile(path.join(packagePath, 'state.json'), stateBytes);
    const prepared = await prepareV1ProjectImport({
      packagePath,
      projectId: 'project',
      sequenceId: 'sequence',
      createdAt: '2026-08-30T00:00:00.000Z',
      importedAt: '2026-08-30T01:00:00.000Z',
      probes: createProbes(),
    });

    expect(prepared.pendingManagedFiles).toHaveLength(1);
    expect(
      prepared.pendingManagedFiles?.every(file =>
        file.relativePath.startsWith(`media${path.sep}`)
      )
    ).toBe(true);
    const service = new EditorProjectService();
    const opened = await service.open(
      packagePath,
      'malicious-window',
      async () => prepared
    );
    await expect(
      service.saveProject(opened.session, 0, opened.project)
    ).resolves.toMatchObject({ status: 'saved' });
    await expect(
      fs.readFile(path.join(packagePath, 'state.json'))
    ).resolves.toEqual(stateBytes);
    service.release(opened.session);
  });
});
