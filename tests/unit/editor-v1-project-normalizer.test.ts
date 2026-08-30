import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_V1_EXPORT_SETTINGS,
  DEFAULT_V1_TIMELINE_ZOOM,
  normalizeV1Project,
  type V1ProjectNormalizationContext,
} from '@/editor-v1/project-normalizer';
import { sha256 } from '@/editor-v1/sha256';
import { DEFAULT_AUDIO_STYLE } from '@/types/audio';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_FIRST_FRAME_SETTINGS } from '@/types/first-frame';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import type { MusicTrack } from '@/types/music';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
import type { VideoEditorState } from '@/types/video-editor-state';
import { DEFAULT_VIDEO_WALLPAPER } from '@/types/video-wallpaper';
import { DEFAULT_ZOOM_SETTINGS } from '@/types/zoom';

const createState = (
  overrides: Partial<VideoEditorState> = {}
): VideoEditorState => ({
  version: 1,
  savedAt: '2026-08-30T00:00:00.000Z',
  segments: [
    {
      id: 'segment-1',
      originalStart: 0,
      originalEnd: 10,
      trimMinStart: 0,
      trimMaxEnd: 10,
    },
  ],
  cursorStyle: DEFAULT_CURSOR_STYLE,
  cameraStyle: DEFAULT_CAMERA_STYLE,
  keyboardStyle: DEFAULT_KEYBOARD_STYLE,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  audioStyle: DEFAULT_AUDIO_STYLE,
  zoomSegments: [],
  zoomSettings: DEFAULT_ZOOM_SETTINGS,
  drawingSegments: [],
  ui: {
    sidebarOpen: true,
    sidebarTab: 'cursor',
    scrubAudioEnabled: false,
  },
  ...overrides,
});

const createContext = (
  overrides: Partial<V1ProjectNormalizationContext> = {}
): V1ProjectNormalizationContext => ({
  recordingDuration: 10,
  systemAudioPath: null,
  micAudioPath: null,
  hasEmbeddedAudio: false,
  wallpaperPresets: [
    { id: 'preset-0', imageUrl: 'preset-0-url' },
    { id: 'preset-1', imageUrl: 'preset-1-url' },
    { id: 'preset-2', imageUrl: 'preset-2-url' },
  ],
  createSegmentId: () => 'default-segment',
  savedAt: '2026-08-30T01:00:00.000Z',
  ...overrides,
});

describe('V1 project normalizer', () => {
  it('derives a fresh complete state when input is absent', () => {
    const result = normalizeV1Project(null, createContext());

    expect(result.acceptedState).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(result.state).toEqual({
      version: 1,
      savedAt: '2026-08-30T01:00:00.000Z',
      recordingType: undefined,
      segments: [
        {
          id: 'default-segment',
          originalStart: 0,
          originalEnd: 10,
          trimMinStart: 0,
          trimMaxEnd: 10,
        },
      ],
      cursorStyle: DEFAULT_CURSOR_STYLE,
      cameraStyle: DEFAULT_CAMERA_STYLE,
      keyboardStyle: DEFAULT_KEYBOARD_STYLE,
      subtitleStyle: DEFAULT_SUBTITLE_STYLE,
      audioStyle: DEFAULT_AUDIO_STYLE,
      zoomSegments: [],
      zoomSettings: DEFAULT_ZOOM_SETTINGS,
      drawingSegments: [],
      musicTracks: [],
      wallpaper: DEFAULT_VIDEO_WALLPAPER,
      firstFrame: DEFAULT_FIRST_FRAME_SETTINGS,
      exportSettings: DEFAULT_V1_EXPORT_SETTINGS,
      timelineZoom: DEFAULT_V1_TIMELINE_ZOOM,
      ui: {
        sidebarOpen: true,
        sidebarTab: 'cursor',
        scrubAudioEnabled: false,
      },
    });
  });

  it('treats validator-rejected state as absent and records a diagnostic', () => {
    const result = normalizeV1Project(
      { version: 2, savedAt: 'invalid' },
      createContext()
    );

    expect(result.acceptedState).toBe(false);
    expect(result.diagnostics).toContainEqual({
      code: 'invalid-state',
      path: '',
    });
    expect(result.state.segments[0].id).toBe('default-segment');
  });

  it('preserves valid segment order and normalizes ranges, trims, and speed', () => {
    const state = createState({
      segments: [
        {
          id: 'second-source-range',
          originalStart: 6,
          originalEnd: 9,
          trimMinStart: 5,
          trimMaxEnd: 10,
          speed: 2,
        },
        {
          id: 'invalid-range',
          originalStart: Number.NaN,
          originalEnd: 4,
          trimMinStart: 0,
          trimMaxEnd: 4,
        },
        {
          id: 'first-source-range',
          originalStart: 1,
          originalEnd: 5,
          trimMinStart: 4,
          trimMaxEnd: 2,
          speed: 9,
        },
      ],
    });

    const result = normalizeV1Project(state, createContext());

    expect(result.state.segments).toEqual([
      {
        id: 'second-source-range',
        originalStart: 6,
        originalEnd: 9,
        trimMinStart: 5,
        trimMaxEnd: 10,
        speed: 2,
      },
      {
        id: 'first-source-range',
        originalStart: 1,
        originalEnd: 5,
        trimMinStart: 1,
        trimMaxEnd: 5,
        speed: 1,
      },
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        { code: 'invalid-segment', path: 'segments.1' },
        { code: 'invalid-speed', path: 'segments.2.speed' },
      ])
    );
  });

  it('shallow-merges every partial style over complete defaults', () => {
    const result = normalizeV1Project(
      createState({
        cursorStyle: { size: 250 } as VideoEditorState['cursorStyle'],
        cameraStyle: { mirrored: false } as VideoEditorState['cameraStyle'],
        keyboardStyle: {
          opacity: 0.5,
        } as VideoEditorState['keyboardStyle'],
        subtitleStyle: {
          position: 'top',
        } as VideoEditorState['subtitleStyle'],
        audioStyle: {
          micAudioVolume: 0.25,
        } as VideoEditorState['audioStyle'],
      }),
      createContext()
    );

    expect(result.state.cursorStyle).toEqual({
      ...DEFAULT_CURSOR_STYLE,
      size: 250,
    });
    expect(result.state.cameraStyle).toEqual({
      ...DEFAULT_CAMERA_STYLE,
      mirrored: false,
    });
    expect(result.state.keyboardStyle).toEqual({
      ...DEFAULT_KEYBOARD_STYLE,
      opacity: 0.5,
    });
    expect(result.state.subtitleStyle).toEqual({
      ...DEFAULT_SUBTITLE_STYLE,
      position: 'top',
    });
    expect(result.state.audioStyle).toEqual({
      ...DEFAULT_AUDIO_STYLE,
      micAudioVolume: 0.25,
    });
  });

  it('defaults malformed optional styles without rejecting accepted state', () => {
    const state = createState();
    (state as unknown as Record<string, unknown>).subtitleStyle = 'invalid';
    (state as unknown as Record<string, unknown>).audioStyle = 5;

    const result = normalizeV1Project(state, createContext());

    expect(result.acceptedState).toBe(true);
    expect(result.state.subtitleStyle).toEqual(DEFAULT_SUBTITLE_STYLE);
    expect(result.state.audioStyle).toEqual(DEFAULT_AUDIO_STYLE);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        { code: 'invalid-style', path: 'subtitleStyle' },
        { code: 'invalid-style', path: 'audioStyle' },
      ])
    );
  });

  it('merges zoom settings and discards malformed zoom ranges individually', () => {
    const result = normalizeV1Project(
      createState({
        zoomSettings: {
          transitionInDuration: 0.5,
          transitionOutDuration: 0.6,
          easing: 'ease-in-out',
        },
        zoomSegments: [
          {
            id: 'valid',
            startTime: 1,
            endTime: 3,
            zoomLevel: 2,
            targetMode: 'manual',
            focusPoint: { x: 0.25, y: 0.75 },
          },
          {
            id: 'invalid',
            startTime: 3,
            endTime: 2,
            zoomLevel: 4,
          },
          {
            id: 'invalid-focus',
            startTime: 3,
            endTime: 4,
            zoomLevel: 2,
            focusPoint: null,
          } as unknown as VideoEditorState['zoomSegments'][number],
        ],
      }),
      createContext()
    );

    expect(result.state.zoomSettings).toEqual({
      ...DEFAULT_ZOOM_SETTINGS,
      transitionInDuration: 0.5,
      transitionOutDuration: 0.6,
    });
    expect(result.state.zoomSegments.map(segment => segment.id)).toEqual([
      'valid',
    ]);
    expect(result.diagnostics).toContainEqual({
      code: 'invalid-zoom',
      path: 'zoomSegments.1',
    });
  });

  it('preserves drawings accepted by the whole-state validator', () => {
    const drawingSegments: NonNullable<VideoEditorState['drawingSegments']> = [
      {
        id: 'drawing-1',
        startTime: 0,
        endTime: 3,
        canvasWidth: 1920,
        canvasHeight: 1080,
        annotations: [
          {
            id: 'line-1',
            type: 'line',
            points: [0, 0, 100, 100],
            stroke: '#fff',
            strokeWidth: 4,
          },
        ],
      },
    ];

    const result = normalizeV1Project(
      createState({ drawingSegments }),
      createContext()
    );

    expect(result.state.drawingSegments).toEqual(drawingSegments);
  });

  it('preserves valid music order, discards malformed tracks, and prepends missing built-ins', () => {
    const state = createState({
      musicTracks: [
        {
          id: 'music-1',
          name: 'Song',
          source: 'music',
          fileName: 'song.mp3',
          volume: 0.8,
          enabled: true,
          startTime: 1,
          endTime: 12,
          originalDuration: 20,
          trimStart: 2,
          trimEnd: 3,
          speed: 1.25,
        },
        { id: 'bad' } as MusicTrack,
      ],
    });

    const result = normalizeV1Project(
      state,
      createContext({
        systemAudioPath: '/package/system.wav',
        micAudioPath: '/package/mic.wav',
      })
    );

    expect(result.state.musicTracks.map(track => track.id)).toEqual([
      'system-audio',
      'mic-audio',
      'music-1',
    ]);
    expect(result.state.musicTracks[2]).toMatchObject({
      startTime: 1,
      endTime: 10,
      trimStart: 2,
      trimEnd: 3,
      speed: 1.25,
    });
    expect(result.diagnostics).toContainEqual({
      code: 'invalid-music',
      path: 'musicTracks.1',
    });
  });

  it('shallow-merges a present wallpaper over the complete default', () => {
    const result = normalizeV1Project(
      createState({
        wallpaper: {
          padding: 42,
        } as VideoEditorState['wallpaper'],
      }),
      createContext()
    );

    expect(result.state.wallpaper).toEqual({
      ...DEFAULT_VIDEO_WALLPAPER,
      padding: 42,
    });
  });

  it('selects the iOS wallpaper deterministically from the source fingerprint', () => {
    const sourceFingerprint = 'recording-sha256';
    const context = createContext({ sourceFingerprint });
    const digest = createHash('sha256')
      .update(`${sourceFingerprint}ios-wallpaper`)
      .digest('hex');
    const expectedIndex = Number(
      BigInt(`0x${digest}`) % BigInt(context.wallpaperPresets.length)
    );

    const first = normalizeV1Project(
      createState({ recordingType: 'ios-device', wallpaper: undefined }),
      context
    );
    const second = normalizeV1Project(
      createState({ recordingType: 'ios-device', wallpaper: undefined }),
      context
    );

    expect(first.state.wallpaper).toEqual(second.state.wallpaper);
    expect(first.state.wallpaper?.backgroundImage).toBe(
      context.wallpaperPresets[expectedIndex].imageUrl
    );
  });

  it('keeps the injected V1 random preset choice when no fingerprint is supplied', () => {
    const result = normalizeV1Project(
      createState({ recordingType: 'ios-device', wallpaper: undefined }),
      createContext({ v1WallpaperPresetIndex: 2 })
    );

    expect(result.state.wallpaper?.backgroundImage).toBe('preset-2-url');
  });

  it('keeps the V1 runtime iOS wallpaper behavior when state is absent', () => {
    const result = normalizeV1Project(
      null,
      createContext({
        wallpaperRecordingType: 'ios-device',
        v1WallpaperPresetIndex: 1,
      })
    );

    expect(result.state.recordingType).toBeUndefined();
    expect(result.state.wallpaper?.backgroundImage).toBe('preset-1-url');
  });

  it('normalizes First Frame, export, and workspace values', () => {
    const state = createState({
      firstFrame: {
        enabled: true,
        imageData: null,
        fit: 'stretch',
      },
      exportSettings: {
        format: 'gif',
        resolution: '720p',
        qualityPreset: 'web',
        frameRate: '20',
        openInFinder: false,
      },
      timelineZoom: 150,
      ui: {
        sidebarOpen: false,
        sidebarTab: 'export',
        scrubAudioEnabled: true,
      },
    });

    const result = normalizeV1Project(state, createContext());

    expect(result.state.firstFrame).toEqual({
      enabled: false,
      imageData: null,
      fit: 'stretch',
    });
    expect(result.state.exportSettings).toEqual(state.exportSettings);
    expect(result.state.timelineZoom).toBe(150);
    expect(result.state.ui).toEqual(state.ui);
    expect(result.diagnostics).toContainEqual({
      code: 'invalid-first-frame',
      path: 'firstFrame.imageData',
    });
  });

  it('merges valid First Frame and partial export values over defaults', () => {
    const state = createState({
      firstFrame: {
        enabled: true,
        imageData: 'data:image/png;base64,valid',
      } as VideoEditorState['firstFrame'],
      exportSettings: {
        frameRate: '30',
      } as VideoEditorState['exportSettings'],
    });

    const result = normalizeV1Project(state, createContext());

    expect(result.state.firstFrame).toEqual({
      ...DEFAULT_FIRST_FRAME_SETTINGS,
      enabled: true,
      imageData: 'data:image/png;base64,valid',
    });
    expect(result.state.exportSettings).toEqual({
      ...DEFAULT_V1_EXPORT_SETTINGS,
      frameRate: '30',
    });
  });

  it('normalizes unknown recording types to ordinary screen recording', () => {
    const state = createState();
    (state as unknown as Record<string, unknown>).recordingType = 'unknown';

    expect(normalizeV1Project(state, createContext()).state.recordingType).toBe(
      undefined
    );
  });
});

describe('V1 SHA-256', () => {
  it.each(['', 'abc', 'Capty editor V2', '🎬'])(
    'matches Node for %j',
    value => {
      expect(sha256(value)).toBe(
        createHash('sha256').update(value).digest('hex')
      );
    }
  );
});
