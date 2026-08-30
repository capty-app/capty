import { describe, expect, it } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import {
  createClipEffectFromCatalog,
  createSequenceEffectFromCatalog,
  EDITOR_EFFECT_CATALOG,
} from '@/renderer/editor-v2/effects/effect-catalog';
import type {
  CaptyRecordingMediaAsset,
  EditorProjectV2,
} from '@/types/editor-v2';

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Effects',
    createdAt: '2026-09-01T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  const locator = {
    kind: 'v1-read-only' as const,
    relativePath: 'cursor.json',
    fingerprint: { byteLength: 10, sha256: 'cursor' },
  };
  const asset: CaptyRecordingMediaAsset = {
    id: 'recording',
    kind: 'capty-recording',
    name: 'Recording',
    locator: {
      kind: 'legacy-package-read-only',
      relativePath: 'recording.mov',
      fingerprint: { byteLength: 10, sha256: 'recording' },
    },
    importedAt: '2026-09-01T00:00:00.000Z',
    durationTicks: 180_000,
    width: 1920,
    height: 1080,
    frameRate: { numerator: 30, denominator: 1 },
    videoStreams: [],
    audioStreams: [],
    sources: {
      cursor: { locator, recordingOffsetTicks: 0 },
      keyboard: {
        locator: { ...locator, relativePath: 'keyboard.json' },
        recordingOffsetTicks: 0,
      },
      subtitles: {
        locator: { ...locator, relativePath: 'subtitles.json' },
        recordingOffsetTicks: 0,
      },
    },
  };
  project.assets.recording = asset;
  project.sequence.clips.clip = {
    id: 'clip',
    kind: 'video',
    trackId: 'video',
    assetId: 'recording',
    name: 'Recording',
    timelineStart: 0,
    timelineDuration: 180_000,
    sourceStart: 0,
    sourceDuration: 180_000,
    playbackRate: { numerator: 1, denominator: 1 },
    sourceStreamId: 'screen',
    effects: [],
  };
  project.sequence.tracks.video.clipIds.push('clip');
  return project;
};

describe('Editor V2 effect catalog', () => {
  it('contains every current visual outcome family', () => {
    expect(EDITOR_EFFECT_CATALOG.map(item => item.id)).toEqual([
      'canvas-settings',
      'transform',
      'opacity',
      'zoom',
      'camera-layout',
      'cursor',
      'keyboard',
      'subtitle',
      'wallpaper',
      'device-frame',
      'annotation',
    ]);
  });

  it('creates timed effects and preserves Capty data locators', () => {
    const project = createProject();
    const clip = project.sequence.clips.clip;
    const zoom = createClipEffectFromCatalog(
      'zoom',
      project,
      clip,
      () => 'zoom'
    );
    const cursor = createClipEffectFromCatalog(
      'cursor',
      project,
      clip,
      () => 'cursor-effect'
    );

    expect(zoom).toMatchObject({
      id: 'zoom',
      kind: 'zoom',
      range: { start: 0, end: 180_000 },
    });
    expect(cursor).toMatchObject({
      id: 'cursor-effect',
      kind: 'cursor',
      data: { relativePath: 'cursor.json' },
    });
  });

  it('rejects source-specific effects when required data is unavailable', () => {
    const project = createProject();
    const clip = project.sequence.clips.clip;
    const asset = project.assets.recording;
    if (asset.kind !== 'capty-recording') return;
    delete asset.sources.cursor;

    expect(
      createClipEffectFromCatalog('cursor', project, clip, () => 'cursor')
    ).toBeNull();
  });

  it('creates canvas, wallpaper, device frame, and timed drawing effects', () => {
    const project = createProject();
    expect(
      createSequenceEffectFromCatalog(
        'canvas-settings',
        project,
        () => 'canvas'
      )
    ).toMatchObject({
      kind: 'canvas-settings',
      width: 1920,
      height: 1080,
      aspectRatio: null,
    });
    expect(
      createSequenceEffectFromCatalog('wallpaper', project, () => 'wallpaper')
    ).toMatchObject({ kind: 'wallpaper', enabled: true });
    expect(
      createSequenceEffectFromCatalog('device-frame', project, () => 'frame')
    ).toMatchObject({ kind: 'device-frame', enabled: true });
    expect(
      createSequenceEffectFromCatalog('annotation', project, () => 'drawing')
    ).toMatchObject({
      kind: 'annotation',
      range: { start: 0, end: 180_000 },
    });
  });
});
