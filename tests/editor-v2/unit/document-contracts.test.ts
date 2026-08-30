import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { findDocumentInvariantViolations } from '@/editor-v2/document/invariants';
import { validateEditorProject } from '@/editor-v2/document/validate';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
import type {
  CameraLayoutEffect,
  CaptyRecordingMediaAsset,
  CursorEffect,
  EditorProjectV2,
  ImageClip,
  ImageMediaAsset,
  KeyboardEffect,
  SequenceEffect,
  SubtitleEffect,
  ZoomEffect,
} from '@/types/editor-v2';

const createProject = (): EditorProjectV2 =>
  createEmptyEditorProject({
    id: 'project-1',
    name: 'Contract Fixture',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence-1',
    videoTrackId: 'video-track-1',
    audioTrackId: 'audio-track-1',
  });

const imageAsset: ImageMediaAsset = {
  id: 'image-1',
  kind: 'image',
  name: 'Still',
  locator: { kind: 'managed', relativePath: 'media/image-1/still.png' },
  importedAt: '2026-08-30T00:00:00.000Z',
  width: 1920,
  height: 1080,
  orientation: 1,
  defaultStillDurationTicks: 360_000,
};

const captyRecordingAsset: CaptyRecordingMediaAsset = {
  id: 'recording-1',
  kind: 'capty-recording',
  name: 'Recording',
  locator: { kind: 'managed', relativePath: 'media/recording-1/recording.mov' },
  importedAt: '2026-08-30T00:00:00.000Z',
  durationTicks: 3_600_000,
  width: 1920,
  height: 1080,
  frameRate: { numerator: 60, denominator: 1 },
  videoStreams: [],
  audioStreams: [],
  sources: {
    systemAudio: {
      kind: 'audio',
      locator: {
        kind: 'legacy-package-read-only',
        relativePath: 'system-audio.wav',
        fingerprint: { byteLength: 1024, sha256: 'system-audio-sha256' },
      },
      recordingOffsetTicks: 12_000,
      durationTicks: 3_000_000,
      streams: [
        {
          id: 'system-stream-1',
          codec: 'pcm_s16le',
          durationTicks: 3_000_000,
          channels: 2,
          sampleRate: 48_000,
        },
      ],
    },
  },
};

const createClip = (
  id: string,
  timelineStart: number,
  timelineDuration = 360_000
): ImageClip => ({
  id,
  kind: 'image',
  trackId: 'video-track-1',
  assetId: imageAsset.id,
  name: id,
  timelineStart,
  timelineDuration,
  sourceStart: 0,
  sourceDuration: timelineDuration,
  playbackRate: { numerator: 1, denominator: 1 },
  effects: [],
});

describe('EditorProjectV2 contracts', () => {
  it('creates a valid empty serializable document', () => {
    const project = createProject();
    const serialized = JSON.parse(JSON.stringify(project)) as unknown;
    const result = validateEditorProject(serialized);

    expect(result).toEqual({ valid: true, project });
    expect(findDocumentInvariantViolations(project)).toEqual([]);
  });

  it('rejects the wrong schema and timebase', () => {
    const project = createProject();

    expect(validateEditorProject({ ...project, schemaVersion: 1 })).toEqual({
      valid: false,
      errors: [
        {
          code: 'invalid-document',
          path: 'schemaVersion',
          message: 'Project schema version must be 2',
        },
      ],
    });
    expect(
      validateEditorProject({
        ...project,
        timebase: { ...project.timebase, ticksPerSecond: 1_000 },
      })
    ).toMatchObject({ valid: false });
  });

  it('rejects malformed dictionary entries without throwing', () => {
    const project = createProject();

    expect(
      validateEditorProject({
        ...project,
        sequence: {
          ...project.sequence,
          clips: { malformed: null },
        },
      })
    ).toMatchObject({ valid: false });
  });

  it('detects dictionary keys that do not match entity IDs', () => {
    const project = createProject();
    project.assets['wrong-key'] = imageAsset;

    expect(findDocumentInvariantViolations(project)).toContainEqual({
      code: 'asset-id-mismatch',
      path: 'assets.wrong-key.id',
      message: 'Asset dictionary key wrong-key does not match image-1',
    });
  });

  it('preserves independent side-stream timing metadata', () => {
    const systemAudio = captyRecordingAsset.sources.systemAudio;

    expect(systemAudio).toMatchObject({
      recordingOffsetTicks: 12_000,
      durationTicks: 3_000_000,
    });
    expect(systemAudio?.streams[0].durationTicks).toBe(3_000_000);
  });

  it.each(['asset-source', 'content-timeline', 'output-timeline'] as const)(
    'serializes the %s effect time domain',
    timeDomain => {
      const effect: ZoomEffect = {
        id: `zoom-${timeDomain}`,
        kind: 'zoom',
        enabled: true,
        timeDomain,
        range: { start: 0, end: 60_000 },
        scale: 2,
        target: 'manual',
        focusX: 0.5,
        focusY: 0.5,
        transitionInTicks: 6_000,
        transitionOutTicks: 6_000,
        followSmoothness: 0.3,
        lookAheadTicks: 43_200,
      };

      expect(JSON.parse(JSON.stringify(effect))).toMatchObject({ timeDomain });
    }
  );

  it('retains every current style field in V2 effect contracts', () => {
    const { enabled: cursorEnabled, ...cursorStyle } = DEFAULT_CURSOR_STYLE;
    const { visible: cameraVisible, ...cameraStyle } = DEFAULT_CAMERA_STYLE;
    const { visible: keyboardVisible, ...keyboardStyle } =
      DEFAULT_KEYBOARD_STYLE;
    const { visible: subtitleVisible, ...subtitleStyle } =
      DEFAULT_SUBTITLE_STYLE;
    const data = {
      kind: 'v2-data' as const,
      relativePath: 'data/recording-1/events.json',
      fingerprint: { byteLength: 512, sha256: 'events-sha256' },
    };
    const cursor: CursorEffect = {
      id: 'cursor-1',
      kind: 'cursor',
      enabled: cursorEnabled,
      timeDomain: 'asset-source',
      data,
      style: cursorStyle,
    };
    const camera: CameraLayoutEffect = {
      id: 'camera-1',
      kind: 'camera-layout',
      enabled: cameraVisible,
      style: cameraStyle,
    };
    const keyboard: KeyboardEffect = {
      id: 'keyboard-1',
      kind: 'keyboard',
      enabled: keyboardVisible,
      timeDomain: 'asset-source',
      data,
      style: keyboardStyle,
      sound: { enabled: true, volume: 0.7, type: 'cherry-blue' },
    };
    const subtitle: SubtitleEffect = {
      id: 'subtitle-1',
      kind: 'subtitle',
      enabled: subtitleVisible,
      timeDomain: 'asset-source',
      data,
      style: subtitleStyle,
    };
    const sequenceEffects: SequenceEffect[] = [
      {
        id: 'canvas-1',
        kind: 'canvas-settings',
        enabled: true,
        width: 1920,
        height: 1080,
        backgroundColor: '#000000',
        aspectRatio: { name: '16:9', width: 16, height: 9 },
      },
      {
        id: 'wallpaper-1',
        kind: 'wallpaper',
        enabled: true,
        background: {
          kind: 'gradient',
          gradient: { id: 'gradient-1', colors: ['#000', '#fff'], angle: 45 },
        },
        padding: 100,
        corners: 20,
        shadow: 100,
      },
      {
        id: 'frame-1',
        kind: 'device-frame',
        enabled: true,
        frame: 'ios-device',
      },
    ];

    expect({
      cursor,
      camera,
      keyboard,
      subtitle,
      sequenceEffects,
    }).toMatchObject({
      cursor: { style: cursorStyle },
      camera: { style: cameraStyle },
      keyboard: { style: keyboardStyle, sound: { type: 'cherry-blue' } },
      subtitle: { style: subtitleStyle },
      sequenceEffects,
    });
  });

  it('detects overlapping clips on one track', () => {
    const project = createProject();
    const first = createClip('clip-1', 0);
    const second = createClip('clip-2', 180_000);
    project.assets[imageAsset.id] = imageAsset;
    project.sequence.clips[first.id] = first;
    project.sequence.clips[second.id] = second;
    project.sequence.tracks['video-track-1'].clipIds = [first.id, second.id];

    expect(findDocumentInvariantViolations(project)).toContainEqual({
      code: 'overlapping-clips',
      path: 'sequence.tracks.video-track-1.clipIds.1',
      message: 'Clip clip-2 overlaps clip clip-1',
    });
  });

  it('allows abutting clips and validates centered transition cuts', () => {
    const project = createProject();
    const first = createClip('clip-1', 0);
    const second = createClip('clip-2', 360_000);
    project.assets[imageAsset.id] = imageAsset;
    project.sequence.clips[first.id] = first;
    project.sequence.clips[second.id] = second;
    project.sequence.tracks['video-track-1'].clipIds = [first.id, second.id];
    project.sequence.transitions['transition-1'] = {
      id: 'transition-1',
      type: 'video-cross-dissolve',
      trackId: 'video-track-1',
      fromClipId: first.id,
      toClipId: second.id,
      cutTick: 360_000,
      durationTicks: 60_000,
      alignment: 'center',
    };

    expect(findDocumentInvariantViolations(project)).toEqual([]);
  });

  it('requires semantic pre-roll to reference an image', () => {
    const project = createProject();
    project.sequence.preRoll = {
      kind: 'output-frame-count',
      assetId: 'missing-image',
      frames: 1,
      fit: 'cover',
    };

    expect(findDocumentInvariantViolations(project)).toContainEqual({
      code: 'invalid-pre-roll',
      path: 'sequence.preRoll',
      message:
        'Semantic pre-roll must reference an image, use positive frames, and have a valid fit',
    });
  });
});
