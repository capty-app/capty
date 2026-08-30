import { describe, expect, it } from 'vitest';

import { normalizeV1Project } from '@/editor-v1/project-normalizer';
import { validateEditorProject } from '@/editor-v2/document/validate';
import {
  importV1Project,
  type ImportV1ProjectInput,
} from '@/editor-v2/persistence/import-v1-project';
import { EDITOR_V2_TICKS_PER_SECOND } from '@/types/editor-v2';
import { DEFAULT_AUDIO_STYLE } from '@/types/audio';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
import type { VideoEditorState } from '@/types/video-editor-state';
import { DEFAULT_VIDEO_WALLPAPER } from '@/types/video-wallpaper';
import { DEFAULT_ZOOM_SETTINGS } from '@/types/zoom';

const fingerprint = (sha256: string) => ({ byteLength: 10, sha256 });

const videoStream = (id: string, durationTicks: number) => ({
  id,
  codec: 'h264',
  durationTicks,
  width: 1920,
  height: 1080,
  frameRate: { numerator: 60, denominator: 1 },
  hasAlpha: false,
});

const audioStream = (id: string, durationTicks: number) => ({
  id,
  codec: 'aac',
  durationTicks,
  channels: 2,
  sampleRate: 48_000,
});

const createState = (): VideoEditorState => ({
  version: 1,
  savedAt: '2026-08-30T00:00:00.000Z',
  segments: [
    {
      id: 'later',
      originalStart: 2,
      originalEnd: 6,
      trimMinStart: 0,
      trimMaxEnd: 10,
      speed: 2,
    },
    {
      id: 'earlier',
      originalStart: 0,
      originalEnd: 2,
      trimMinStart: 0,
      trimMaxEnd: 10,
    },
  ],
  cursorStyle: { ...DEFAULT_CURSOR_STYLE, enabled: true },
  cameraStyle: { ...DEFAULT_CAMERA_STYLE, visible: true },
  keyboardStyle: { ...DEFAULT_KEYBOARD_STYLE, visible: true },
  subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE, visible: true },
  audioStyle: {
    ...DEFAULT_AUDIO_STYLE,
    systemAudioVolume: 0.5,
    micAudioVolume: 0.25,
    keyboardSoundEnabled: true,
  },
  zoomSegments: [
    {
      id: 'zoom-1',
      startTime: 0.5,
      endTime: 2.5,
      zoomLevel: 2,
      targetMode: 'manual',
      focusPoint: { x: 0.25, y: 0.75 },
    },
  ],
  zoomSettings: DEFAULT_ZOOM_SETTINGS,
  drawingSegments: [
    {
      id: 'drawing-1',
      startTime: 0,
      endTime: 0.5,
      canvasWidth: 1920,
      canvasHeight: 1080,
      annotations: [],
    },
  ],
  musicTracks: [
    {
      id: 'music-1',
      name: 'Music',
      source: 'music',
      fileName: 'song.m4a',
      volume: 0.8,
      enabled: true,
      startTime: 0.5,
      endTime: 3,
      originalDuration: 5,
      trimStart: 0.25,
      trimEnd: 0,
      speed: 1,
    },
  ],
  wallpaper: {
    ...DEFAULT_VIDEO_WALLPAPER,
    enabled: true,
    backgroundImage: 'data:image/png;base64,wallpaper',
    padding: 40,
    deviceFrame: true,
  },
  firstFrame: {
    enabled: true,
    imageData: 'data:image/png;base64,first',
    fit: 'cover',
  },
  exportSettings: {
    format: 'gif',
    resolution: '720p',
    qualityPreset: 'web',
    frameRate: '30',
    openInFinder: false,
  },
  timelineZoom: 150,
  ui: {
    sidebarOpen: false,
    sidebarTab: 'export',
    scrubAudioEnabled: true,
  },
});

const normalizeState = () =>
  normalizeV1Project(createState(), {
    recordingDuration: 10,
    systemAudioPath: '/package/system.m4a',
    micAudioPath: '/package/mic.m4a',
    hasEmbeddedAudio: true,
    wallpaperPresets: [],
    sourceFingerprint: 'source',
    createSegmentId: () => 'default',
    savedAt: '2026-08-30T00:00:00.000Z',
  }).state;

const createInput = (): ImportV1ProjectInput => {
  const duration = 10 * EDITOR_V2_TICKS_PER_SECOND;
  return {
    projectId: 'project-1',
    projectName: 'Fixture',
    sequenceId: 'sequence-1',
    createdAt: '2026-08-30T00:00:00.000Z',
    importedAt: '2026-08-30T01:00:00.000Z',
    sourceFingerprint: 'package-sha',
    importFiles: [
      { relativePath: 'recording.mov', fingerprint: fingerprint('recording') },
      { relativePath: 'state.json', fingerprint: fingerprint('state') },
    ],
    normalizedState: normalizeState(),
    sources: {
      recording: {
        relativePath: 'recording.mov',
        fingerprint: fingerprint('recording'),
        durationSeconds: 10,
        width: 1920,
        height: 1080,
        frameRate: { numerator: 60, denominator: 1 },
        videoStreams: [videoStream('screen-stream', duration)],
        audioStreams: [audioStream('embedded-stream', duration)],
      },
      systemAudio: {
        relativePath: 'system.m4a',
        fingerprint: fingerprint('system'),
        durationSeconds: 3,
        recordingOffsetSeconds: 1,
        streams: [audioStream('system-stream', 3 * EDITOR_V2_TICKS_PER_SECOND)],
      },
      microphoneAudio: {
        relativePath: 'mic.m4a',
        fingerprint: fingerprint('mic'),
        durationSeconds: 12,
        streams: [audioStream('mic-stream', 12 * EDITOR_V2_TICKS_PER_SECOND)],
      },
      cameraVideo: {
        relativePath: 'camera.mov',
        fingerprint: fingerprint('camera'),
        durationSeconds: 2,
        recordingOffsetSeconds: 3,
        width: 1280,
        height: 720,
        frameRate: { numerator: 30, denominator: 1 },
        videoStreams: [
          {
            ...videoStream('camera-stream', 2 * EDITOR_V2_TICKS_PER_SECOND),
            width: 1280,
            height: 720,
            frameRate: { numerator: 30, denominator: 1 },
          },
        ],
        audioStreams: [],
      },
      music: [
        {
          fileName: 'song.m4a',
          relativePath: 'music/song.m4a',
          fingerprint: fingerprint('music'),
          durationSeconds: 5,
          channels: 2,
          sampleRate: 48_000,
          streams: [
            audioStream('music-stream', 5 * EDITOR_V2_TICKS_PER_SECOND),
          ],
        },
      ],
      data: {
        cursor: {
          kind: 'v1-read-only',
          relativePath: 'cursor.json',
          fingerprint: fingerprint('cursor'),
        },
        keyboard: {
          kind: 'v1-read-only',
          relativePath: 'keys.json',
          fingerprint: fingerprint('keys'),
        },
        subtitles: {
          kind: 'v1-read-only',
          relativePath: 'subtitle.json',
          fingerprint: fingerprint('subtitle'),
        },
        originalV1State: {
          kind: 'v1-read-only',
          relativePath: 'state.json',
          fingerprint: fingerprint('state'),
        },
      },
      firstFrameImage: {
        asset: {
          id: 'first-frame-asset',
          kind: 'image',
          name: 'First Frame',
          locator: { kind: 'managed', relativePath: 'media/first/frame.png' },
          importedAt: '2026-08-30T01:00:00.000Z',
          width: 1920,
          height: 1080,
          orientation: 1,
          defaultStillDurationTicks: EDITOR_V2_TICKS_PER_SECOND,
        },
      },
      wallpaperImage: {
        asset: {
          id: 'wallpaper-asset',
          kind: 'image',
          name: 'Wallpaper',
          locator: {
            kind: 'managed',
            relativePath: 'media/wallpaper/image.png',
          },
          importedAt: '2026-08-30T01:00:00.000Z',
          width: 1920,
          height: 1080,
          orientation: 1,
          defaultStillDurationTicks: EDITOR_V2_TICKS_PER_SECOND,
        },
      },
    },
    createId: (kind, sourceId) => `${kind}-${sourceId}`,
  };
};

describe('V1 project importer', () => {
  it('maps reordered ranges, speeds, unequal side streams, effects, music, and workspace', () => {
    const result = importV1Project(createInput());
    const project = result.project;

    expect(validateEditorProject(project)).toEqual({ valid: true, project });
    expect(project.sequence.preRoll).toEqual({
      kind: 'output-frame-count',
      assetId: 'first-frame-asset',
      frames: 1,
      fit: 'cover',
    });

    const screenTrack = project.sequence.tracks['track-screen-video'];
    expect(screenTrack.clipIds).toHaveLength(2);
    const firstScreen = project.sequence.clips[screenTrack.clipIds[0]];
    const secondScreen = project.sequence.clips[screenTrack.clipIds[1]];
    expect(firstScreen).toMatchObject({
      sourceStart: 2 * EDITOR_V2_TICKS_PER_SECOND,
      sourceDuration: 4 * EDITOR_V2_TICKS_PER_SECOND,
      timelineStart: 0,
      timelineDuration: 2 * EDITOR_V2_TICKS_PER_SECOND,
      playbackRate: { numerator: 2, denominator: 1 },
    });
    expect(secondScreen.timelineStart).toBe(2 * EDITOR_V2_TICKS_PER_SECOND);

    const cameraTrack = project.sequence.tracks['track-camera-video'];
    expect(cameraTrack.clipIds).toHaveLength(1);
    expect(project.sequence.clips[cameraTrack.clipIds[0]]).toMatchObject({
      sourceStart: 0,
      timelineStart: EDITOR_V2_TICKS_PER_SECOND / 2,
      timelineDuration: EDITOR_V2_TICKS_PER_SECOND,
    });

    const systemTrack = project.sequence.tracks['track-system-audio'];
    expect(systemTrack.clipIds).toHaveLength(2);
    expect(project.sequence.clips[systemTrack.clipIds[0]]).toMatchObject({
      sourceStart: EDITOR_V2_TICKS_PER_SECOND,
      sourceDuration: 2 * EDITOR_V2_TICKS_PER_SECOND,
      timelineDuration: EDITOR_V2_TICKS_PER_SECOND,
      gain: 0.5,
    });
    expect(project.sequence.clips[systemTrack.clipIds[1]]).toMatchObject({
      sourceStart: 0,
      timelineStart: 3 * EDITOR_V2_TICKS_PER_SECOND,
      timelineDuration: EDITOR_V2_TICKS_PER_SECOND,
    });

    const effects = firstScreen.effects;
    expect(effects.map(effect => effect.kind)).toEqual(
      expect.arrayContaining(['cursor', 'keyboard', 'subtitle', 'zoom'])
    );
    expect(effects.find(effect => effect.kind === 'cursor')).toMatchObject({
      timeDomain: 'asset-source',
    });
    expect(project.sequence.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'wallpaper' }),
        expect.objectContaining({ kind: 'device-frame' }),
        expect.objectContaining({
          kind: 'annotation',
          timeDomain: 'output-timeline',
        }),
      ])
    );

    expect(project.assets['asset-music-music-1']).toMatchObject({
      kind: 'audio',
      locator: {
        kind: 'legacy-package-read-only',
        relativePath: 'music/song.m4a',
      },
    });
    expect(result.workspace).toMatchObject({
      scrubAudioEnabled: true,
      previewFrameRate: { numerator: 30, denominator: 1 },
      timeline: { zoom: 150 },
      leftDock: { collapsed: true },
      lastExportSettings: {
        format: 'gif',
        resolution: '720p',
        quality: 'web',
        revealWhenComplete: false,
      },
    });
  });

  it.each(['60', '50', '40', '30', '25', '24', '20', '10'] as const)(
    'keeps First Frame semantic at %s fps',
    frameRate => {
      const input = createInput();
      input.normalizedState.exportSettings.frameRate = frameRate;

      const result = importV1Project(input);
      expect(result.project.sequence.preRoll).toMatchObject({
        kind: 'output-frame-count',
        frames: 1,
      });
      expect(result.workspace.previewFrameRate).toEqual({
        numerator: Number(frameRate),
        denominator: 1,
      });
    }
  );

  it('keeps fractional speed music ranges coherent when source media is short', () => {
    const input = createInput();
    const track = input.normalizedState.musicTracks.find(
      candidate => candidate.id === 'music-1'
    );
    expect(track).toBeDefined();
    if (!track) return;
    track.startTime = 0.1;
    track.endTime = 0.433333;
    track.trimStart = 4.8;
    track.speed = 1.5;

    const result = importV1Project(input);
    const musicTrack = result.project.sequence.tracks['track-music-music-1'];
    const clip = result.project.sequence.clips[musicTrack.clipIds[0]];
    expect(clip).toMatchObject({
      timelineStart: 36_000,
      timelineDuration: 48_000,
      sourceStart: 1_728_000,
      sourceDuration: 72_000,
      playbackRate: { numerator: 15, denominator: 10 },
    });
  });

  it('is deterministic for identical normalized input and IDs', () => {
    expect(importV1Project(createInput())).toEqual(
      importV1Project(createInput())
    );
  });

  it.each([
    {
      system: true,
      microphone: true,
      embedded: true,
      tracks: ['system', 'microphone'],
    },
    { system: true, microphone: false, embedded: true, tracks: ['system'] },
    { system: false, microphone: true, embedded: true, tracks: ['microphone'] },
    { system: false, microphone: false, embedded: true, tracks: ['system'] },
    {
      system: true,
      microphone: true,
      embedded: false,
      tracks: ['system', 'microphone'],
    },
    { system: true, microphone: false, embedded: false, tracks: ['system'] },
    {
      system: false,
      microphone: true,
      embedded: false,
      tracks: ['microphone'],
    },
    { system: false, microphone: false, embedded: false, tracks: [] },
  ])(
    'applies audio precedence for system=$system microphone=$microphone embedded=$embedded',
    ({ system, microphone, embedded, tracks }) => {
      const input = createInput();
      if (!system) input.sources.systemAudio = undefined;
      if (!microphone) input.sources.microphoneAudio = undefined;
      if (!embedded) {
        input.sources.recording.audioStreams = [];
      }

      const result = importV1Project(input);
      const actualTracks = [
        result.project.sequence.tracks['track-system-audio'] ? 'system' : null,
        result.project.sequence.tracks['track-microphone-audio']
          ? 'microphone'
          : null,
      ].filter((track): track is string => track !== null);
      expect(actualTracks).toEqual(tracks);

      if (!system && !microphone && embedded) {
        const systemTrack =
          result.project.sequence.tracks['track-system-audio'];
        const clip = result.project.sequence.clips[systemTrack.clipIds[0]];
        expect(clip.sourceStreamId).toBe('embedded-stream');
      }
    }
  );

  it('diagnoses missing prepared First Frame and wallpaper images', () => {
    const input = createInput();
    input.sources.firstFrameImage = undefined;
    input.sources.wallpaperImage = undefined;

    const result = importV1Project(input);
    expect(result.project.sequence.preRoll).toBeUndefined();
    expect(result.diagnostics).toEqual([
      { code: 'missing-first-frame-image', path: 'firstFrame.imageData' },
      { code: 'missing-wallpaper-image', path: 'wallpaper.backgroundImage' },
    ]);
  });
});
