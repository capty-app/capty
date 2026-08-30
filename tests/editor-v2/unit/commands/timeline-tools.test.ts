import { executeEditorCommand } from '@/editor-v2/commands/execute';
import { createPlaceAssetCommand } from '@/editor-v2/commands/placement';
import { createRippleShiftCommand } from '@/editor-v2/commands/ripple';
import { solveBoundarySnap, solveSnap } from '@/editor-v2/commands/snapping';
import {
  createDeleteClipsCommand,
  createDeleteTrackCommand,
  createMoveClipsCommand,
  createMoveClipsToAdjacentTrackCommand,
  createSplitClipsCommand,
  createTrimClipsCommand,
} from '@/editor-v2/commands/timeline-edits';
import {
  createChangeTransitionDurationCommand,
  createValidatedTransitionCommand,
} from '@/editor-v2/commands/transitions';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import type {
  AudioClip,
  AudioMediaAsset,
  EditorProjectV2,
  ImageClip,
  ImageMediaAsset,
  VideoClip,
  VideoMediaAsset,
} from '@/types/editor-v2';

const NOW = '2026-09-01T00:00:00.000Z';

const createProject = (): EditorProjectV2 =>
  createEmptyEditorProject({
    id: 'project',
    name: 'Timeline tools',
    createdAt: NOW,
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });

const imageAsset: ImageMediaAsset = {
  id: 'image',
  kind: 'image',
  name: 'Image',
  locator: { kind: 'managed', relativePath: 'media/image/image.png' },
  importedAt: NOW,
  width: 100,
  height: 100,
  orientation: 1,
  defaultStillDurationTicks: 100,
};

const addImageClip = (
  project: EditorProjectV2,
  id: string,
  start: number,
  duration = 100,
  linkedGroupId?: string
): ImageClip => {
  project.assets.image = imageAsset;
  const clip: ImageClip = {
    id,
    kind: 'image',
    trackId: 'video',
    assetId: 'image',
    name: id,
    timelineStart: start,
    timelineDuration: duration,
    sourceStart: 0,
    sourceDuration: duration,
    playbackRate: { numerator: 1, denominator: 1 },
    linkedGroupId,
    effects: [],
  };
  project.sequence.clips[id] = clip;
  project.sequence.tracks.video.clipIds.push(id);
  return clip;
};

const videoAsset: VideoMediaAsset = {
  id: 'video-asset',
  kind: 'video',
  name: 'Video',
  locator: { kind: 'managed', relativePath: 'media/video/video.mov' },
  importedAt: NOW,
  durationTicks: 1_000,
  width: 100,
  height: 100,
  frameRate: { numerator: 60, denominator: 1 },
  videoStreams: [
    {
      id: 'video-stream',
      codec: 'h264',
      durationTicks: 1_000,
      width: 100,
      height: 100,
      frameRate: { numerator: 60, denominator: 1 },
      hasAlpha: false,
    },
  ],
  audioStreams: [],
};

const audioAsset: AudioMediaAsset = {
  id: 'audio-asset',
  kind: 'audio',
  name: 'Audio',
  locator: { kind: 'managed', relativePath: 'media/audio/audio.m4a' },
  importedAt: NOW,
  durationTicks: 1_000,
  channels: 2,
  sampleRate: 48_000,
  audioStreams: [
    {
      id: 'audio-stream',
      codec: 'aac',
      durationTicks: 1_000,
      channels: 2,
      sampleRate: 48_000,
    },
  ],
};

const addAudioClip = (
  project: EditorProjectV2,
  id: string,
  start: number,
  sourceStart: number,
  duration = 100,
  linkedGroupId?: string
): AudioClip => {
  project.assets[audioAsset.id] = audioAsset;
  const clip: AudioClip = {
    id,
    kind: 'audio',
    trackId: 'audio',
    assetId: audioAsset.id,
    name: id,
    timelineStart: start,
    timelineDuration: duration,
    sourceStart,
    sourceDuration: duration,
    playbackRate: { numerator: 1, denominator: 1 },
    sourceStreamId: 'audio-stream',
    linkedGroupId,
    gain: 1,
    fadeInTicks: 0,
    fadeOutTicks: 0,
    effects: [],
  };
  project.sequence.clips[id] = clip;
  project.sequence.tracks.audio.clipIds.push(id);
  return clip;
};

const addVideoClip = (
  project: EditorProjectV2,
  id: string,
  start: number,
  sourceStart: number
): VideoClip => {
  project.assets[videoAsset.id] = videoAsset;
  const clip: VideoClip = {
    id,
    kind: 'video',
    trackId: 'video',
    assetId: videoAsset.id,
    name: id,
    timelineStart: start,
    timelineDuration: 100,
    sourceStart,
    sourceDuration: 100,
    playbackRate: { numerator: 1, denominator: 1 },
    sourceStreamId: 'video-stream',
    effects: [],
  };
  project.sequence.clips[id] = clip;
  project.sequence.tracks.video.clipIds.push(id);
  return clip;
};

describe('timeline snapping', () => {
  it('converts the pixel threshold and excludes moving clips', () => {
    const project = createProject();
    addImageClip(project, 'moving', 100);
    addImageClip(project, 'target', 300);
    const result = solveSnap({
      project,
      candidateTick: 294,
      pixelsPerTick: 2,
      pixelThreshold: 12,
      playheadTick: 250,
      excludeClipIds: new Set(['moving']),
    });
    expect(result).toEqual({
      tick: 300,
      snapped: true,
      guide: { kind: 'clip-start', tick: 300, sourceId: 'target' },
    });
    expect(
      solveSnap({
        project,
        candidateTick: 293,
        pixelsPerTick: 2,
        pixelThreshold: 12,
      })
    ).toMatchObject({ tick: 293, snapped: false });
  });

  it('snaps the closest start or end across a multi-clip movement', () => {
    const project = createProject();
    addImageClip(project, 'moving-a', 100, 100);
    addImageClip(project, 'moving-b', 250, 50);
    addImageClip(project, 'target', 400, 100);
    const result = solveBoundarySnap({
      project,
      boundaryTicks: [100, 200, 250, 300],
      deltaTicks: 94,
      pixelsPerTick: 1,
      pixelThreshold: 8,
      excludeClipIds: new Set(['moving-a', 'moving-b']),
    });
    expect(result).toMatchObject({
      deltaTicks: 100,
      snap: {
        tick: 400,
        guide: { kind: 'clip-start', sourceId: 'target' },
      },
    });
  });
});

describe('timeline ripple', () => {
  it('shifts every unlocked track and preserves undo', () => {
    const project = createProject();
    addImageClip(project, 'before', 0);
    addImageClip(project, 'after', 200);
    const moved = executeEditorCommand(
      project,
      createRippleShiftCommand({ boundaryTick: 200, deltaTicks: 50 })
    );
    expect(moved.document.sequence.clips.before.timelineStart).toBe(0);
    expect(moved.document.sequence.clips.after.timelineStart).toBe(250);
    expect(
      executeEditorCommand(moved.document, moved.inverse).document
    ).toEqual(project);
  });

  it('rejects every Ripple boundary inside transition ranges', () => {
    const project = createProject();
    addImageClip(project, 'from', 0, 100);
    addImageClip(project, 'to', 100, 100);
    const transitioned = executeEditorCommand(
      project,
      createValidatedTransitionCommand({
        id: 'transition',
        type: 'video-cross-dissolve',
        trackId: 'video',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 21,
        alignment: 'center',
      })
    ).document;
    for (const boundaryTick of [91, 100, 110]) {
      expect(() =>
        createRippleShiftCommand({ boundaryTick, deltaTicks: 10 }).apply(
          transitioned
        )
      ).toThrow('rippling inside');
    }
    expect(() =>
      createRippleShiftCommand({ boundaryTick: 90, deltaTicks: 10 }).apply(
        transitioned
      )
    ).not.toThrow();
  });

  it('rejects a linked group when one sibling track is locked', () => {
    const project = createProject();
    addImageClip(project, 'video-clip', 200, 100, 'group');
    addAudioClip(project, 'audio-clip', 200, 0, 60, 'group');
    project.sequence.tracks.audio.locked = true;
    expect(() =>
      createRippleShiftCommand({ boundaryTick: 200, deltaTicks: 50 }).apply(
        project
      )
    ).toThrow('linked sibling track is locked');
  });
});

describe('timeline transitions', () => {
  it('creates cross-dissolves with finite source handles', () => {
    const project = createProject();
    addVideoClip(project, 'from', 0, 100);
    addVideoClip(project, 'to', 100, 300);
    const result = executeEditorCommand(
      project,
      createValidatedTransitionCommand({
        id: 'transition',
        type: 'video-cross-dissolve',
        trackId: 'video',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 21,
        alignment: 'center',
      })
    );
    expect(result.document.sequence.transitions.transition).toMatchObject({
      durationTicks: 21,
    });
  });

  it('rejects insufficient source handles and accepts image hold handles', () => {
    const project = createProject();
    addVideoClip(project, 'from', 0, 900);
    addVideoClip(project, 'to', 100, 5);
    expect(() =>
      createValidatedTransitionCommand({
        id: 'transition',
        type: 'video-cross-dissolve',
        trackId: 'video',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 20,
        alignment: 'center',
      }).apply(project)
    ).toThrow('insufficient source handle');

    const images = createProject();
    addImageClip(images, 'from', 0);
    addImageClip(images, 'to', 100);
    expect(() =>
      createValidatedTransitionCommand({
        id: 'transition',
        type: 'video-cross-dissolve',
        trackId: 'video',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 20,
        alignment: 'center',
      }).apply(images)
    ).not.toThrow();
  });

  it('validates non-1x handles and locked linked transition participants', () => {
    const project = createProject();
    const from = addVideoClip(project, 'from', 0, 100);
    const to = addVideoClip(project, 'to', 100, 300);
    from.playbackRate = { numerator: 2, denominator: 1 };
    from.sourceDuration = 200;
    to.playbackRate = { numerator: 2, denominator: 1 };
    to.sourceDuration = 200;
    expect(() =>
      createValidatedTransitionCommand({
        id: 'transition',
        type: 'video-cross-dissolve',
        trackId: 'video',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 21,
        alignment: 'center',
      }).apply(project)
    ).not.toThrow();

    from.linkedGroupId = 'group';
    addAudioClip(project, 'linked-audio', 0, 0, 100, 'group');
    project.sequence.tracks.audio.locked = true;
    expect(() =>
      createValidatedTransitionCommand({
        id: 'locked-transition',
        type: 'video-cross-dissolve',
        trackId: 'video',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 20,
        alignment: 'center',
      }).apply(project)
    ).toThrow('linked sibling track is locked');
  });

  it('creates audio crossfades, fade-black edges, and validates duration changes', () => {
    const audio = createProject();
    addAudioClip(audio, 'from', 0, 100);
    addAudioClip(audio, 'to', 100, 300);
    const crossfade = executeEditorCommand(
      audio,
      createValidatedTransitionCommand({
        id: 'crossfade',
        type: 'audio-crossfade',
        trackId: 'audio',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 20,
        alignment: 'center',
      })
    );
    const resized = executeEditorCommand(
      crossfade.document,
      createChangeTransitionDurationCommand('crossfade', 21)
    );
    expect(resized.document.sequence.transitions.crossfade.durationTicks).toBe(
      21
    );

    const video = createProject();
    addImageClip(video, 'image', 0);
    const faded = executeEditorCommand(
      video,
      createValidatedTransitionCommand({
        id: 'fade',
        type: 'video-fade-black',
        trackId: 'video',
        clipId: 'image',
        edge: 'out',
        durationTicks: 20,
      })
    );
    expect(faded.document.sequence.transitions.fade).toMatchObject({
      edge: 'out',
    });
    expect(() =>
      createValidatedTransitionCommand({
        id: 'duplicate',
        type: 'video-fade-black',
        trackId: 'video',
        clipId: 'image',
        edge: 'out',
        durationTicks: 10,
      }).apply(faded.document)
    ).toThrow('already has a fade');
  });
});

describe('timeline edit commands', () => {
  it('rejects every clip mutation on locked tracks', () => {
    const project = createProject();
    addImageClip(project, 'clip', 0, 100);
    project.sequence.tracks.video.locked = true;
    const commands = [
      createMoveClipsCommand(['clip'], 10),
      createTrimClipsCommand(['clip'], 'end', -10),
      createSplitClipsCommand(['clip'], 50, () => 'split'),
      createDeleteClipsCommand({ clipIds: ['clip'], ripple: false }),
    ];
    for (const command of commands) {
      expect(() => executeEditorCommand(project, command)).toThrow('locked');
    }
  });

  it('moves clips between compatible tracks and rejects destination overlap', () => {
    const project = createProject();
    project.sequence.videoTrackIds.push('video-2');
    project.sequence.tracks['video-2'] = {
      id: 'video-2',
      kind: 'video',
      name: 'Video 2',
      clipIds: [],
      locked: false,
      visible: true,
      compositingOrder: 1,
    };
    addImageClip(project, 'clip', 0, 100);
    const moved = executeEditorCommand(
      project,
      createMoveClipsToAdjacentTrackCommand(['clip'], 1)
    );
    expect(moved.document.sequence.clips.clip.trackId).toBe('video-2');
    expect(moved.document.sequence.tracks['video-2'].clipIds).toContain('clip');
    expect(
      executeEditorCommand(moved.document, moved.inverse).document
    ).toEqual(project);

    addImageClip(project, 'blocker', 0, 100);
    project.sequence.tracks.video.clipIds = ['clip'];
    project.sequence.tracks['video-2'].clipIds = ['blocker'];
    project.sequence.clips.blocker.trackId = 'video-2';
    expect(() =>
      executeEditorCommand(
        project,
        createMoveClipsToAdjacentTrackCommand(['clip'], 1)
      )
    ).toThrow('overlaps');
  });

  it('deletes populated tracks and linked siblings in one undoable command', () => {
    const project = createProject();
    addImageClip(project, 'video-linked', 0, 100, 'group');
    addAudioClip(project, 'audio-linked', 0, 0, 100, 'group');
    const deleted = executeEditorCommand(
      project,
      createDeleteTrackCommand('video')
    );
    expect(deleted.document.sequence.tracks.video).toBeUndefined();
    expect(deleted.document.sequence.clips['video-linked']).toBeUndefined();
    expect(deleted.document.sequence.clips['audio-linked']).toBeUndefined();
    expect(
      executeEditorCommand(deleted.document, deleted.inverse).document
    ).toEqual(project);
  });

  it('moves unequal linked siblings atomically and rejects overlap', () => {
    const project = createProject();
    addImageClip(project, 'video-linked', 100, 100, 'group');
    addAudioClip(project, 'audio-linked', 120, 0, 40, 'group');
    const moved = executeEditorCommand(
      project,
      createMoveClipsCommand(['video-linked'], 50)
    );
    expect(moved.document.sequence.clips['video-linked'].timelineStart).toBe(
      150
    );
    expect(moved.document.sequence.clips['audio-linked'].timelineStart).toBe(
      170
    );
    addImageClip(project, 'blocker', 220, 100);
    expect(() =>
      executeEditorCommand(
        project,
        createMoveClipsCommand(['video-linked'], 80)
      )
    ).toThrow('overlaps');
  });

  it('splits every crossing linked sibling without losing effects', () => {
    const project = createProject();
    const video = addImageClip(project, 'video-linked', 100, 100, 'group');
    video.effects.push({
      id: 'zoom',
      kind: 'zoom',
      enabled: true,
      timeDomain: 'content-timeline',
      range: { start: 100, end: 200 },
      scale: 2,
      target: 'manual',
      focusX: 0.5,
      focusY: 0.5,
      transitionInTicks: 10,
      transitionOutTicks: 10,
      followSmoothness: 0.1,
      lookAheadTicks: 0,
    });
    addAudioClip(project, 'audio-linked', 120, 0, 40, 'group');
    let nextId = 0;
    const split = executeEditorCommand(
      project,
      createSplitClipsCommand(['video-linked'], 140, () => `split-${nextId++}`)
    );
    expect(Object.keys(split.document.sequence.clips)).toHaveLength(4);
    expect(split.document.sequence.clips['split-0'].timelineStart).toBe(140);
    expect(split.document.sequence.clips['split-1'].timelineStart).toBe(140);
    expect(split.document.sequence.clips['video-linked'].effects).toEqual(
      video.effects
    );
    expect(split.document.sequence.clips['split-0'].effects).toEqual(
      video.effects
    );
    expect(
      executeEditorCommand(split.document, split.inverse).document
    ).toEqual(project);
  });

  it('recomputes unequal linked siblings from their available intersection', () => {
    const project = createProject();
    addImageClip(project, 'video-linked', 100, 100, 'group');
    addAudioClip(project, 'audio-linked', 120, 0, 40, 'group');
    const shortAudioAsset = structuredClone(audioAsset);
    shortAudioAsset.durationTicks = 40;
    shortAudioAsset.audioStreams[0].durationTicks = 40;
    project.assets[shortAudioAsset.id] = shortAudioAsset;
    const trimmed = executeEditorCommand(
      project,
      createTrimClipsCommand(['video-linked'], 'start', 50)
    );
    expect(trimmed.document.sequence.clips['video-linked']).toMatchObject({
      timelineStart: 150,
      timelineDuration: 50,
    });
    expect(trimmed.document.sequence.clips['audio-linked']).toMatchObject({
      timelineStart: 150,
      timelineDuration: 10,
      sourceStart: 30,
      sourceDuration: 10,
    });
    const removed = executeEditorCommand(
      project,
      createTrimClipsCommand(['video-linked'], 'start', 70)
    );
    expect(removed.document.sequence.clips['audio-linked']).toBeUndefined();
  });

  it('enforces finite source bounds while trimming', () => {
    const project = createProject();
    addVideoClip(project, 'clip', 100, 850);
    const extended = executeEditorCommand(
      project,
      createTrimClipsCommand(['clip'], 'end', 100)
    );
    expect(extended.document.sequence.clips.clip).toMatchObject({
      timelineDuration: 150,
      sourceDuration: 150,
    });
    const trimmed = executeEditorCommand(
      project,
      createTrimClipsCommand(['clip'], 'start', 20)
    );
    expect(trimmed.document.sequence.clips.clip).toMatchObject({
      timelineStart: 120,
      timelineDuration: 80,
      sourceStart: 870,
      sourceDuration: 80,
    });
  });

  it('preserves valid transitions during trims and rejects invalidating trims', () => {
    const project = createProject();
    addImageClip(project, 'from', 0, 100);
    addImageClip(project, 'to', 100, 100);
    const transitioned = executeEditorCommand(
      project,
      createValidatedTransitionCommand({
        id: 'transition',
        type: 'video-cross-dissolve',
        trackId: 'video',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 20,
        alignment: 'center',
      })
    ).document;
    const oppositeEdge = executeEditorCommand(
      transitioned,
      createTrimClipsCommand(['from'], 'start', 10)
    );
    expect(oppositeEdge.document.sequence.transitions.transition.cutTick).toBe(
      100
    );
    expect(() =>
      executeEditorCommand(
        transitioned,
        createTrimClipsCommand(['from'], 'end', -10)
      )
    ).toThrow('adjacent at the cut');
    expect(() =>
      executeEditorCommand(
        transitioned,
        createTrimClipsCommand(['from'], 'end', -10, true)
      )
    ).toThrow('rippling inside');
  });

  it('ripple trims the edit boundary across unlocked tracks', () => {
    const project = createProject();
    addImageClip(project, 'trimmed', 0, 100);
    addImageClip(project, 'video-after', 100, 100);
    addAudioClip(project, 'audio-after', 100, 0);
    const trimmed = executeEditorCommand(
      project,
      createTrimClipsCommand(['trimmed'], 'end', -20, true)
    );
    expect(trimmed.document.sequence.clips.trimmed.timelineDuration).toBe(80);
    expect(trimmed.document.sequence.clips['video-after'].timelineStart).toBe(
      80
    );
    expect(trimmed.document.sequence.clips['audio-after'].timelineStart).toBe(
      80
    );
  });

  it('ripple deletes across all unlocked tracks and preserves one-step undo', () => {
    const project = createProject();
    addImageClip(project, 'deleted', 100, 100);
    addImageClip(project, 'video-after', 300, 100);
    addAudioClip(project, 'audio-after', 300, 0);
    const deleted = executeEditorCommand(
      project,
      createDeleteClipsCommand({ clipIds: ['deleted'], ripple: true })
    );
    expect(deleted.document.sequence.clips['video-after'].timelineStart).toBe(
      200
    );
    expect(deleted.document.sequence.clips['audio-after'].timelineStart).toBe(
      200
    );
    expect(
      executeEditorCommand(deleted.document, deleted.inverse).document
    ).toEqual(project);
  });

  it('rejects splits inside transitions and preserves edge transitions outside them', () => {
    const project = createProject();
    addImageClip(project, 'from', 0, 100);
    addImageClip(project, 'to', 100, 100);
    const transitioned = executeEditorCommand(
      project,
      createValidatedTransitionCommand({
        id: 'transition',
        type: 'video-cross-dissolve',
        trackId: 'video',
        fromClipId: 'from',
        toClipId: 'to',
        cutTick: 100,
        durationTicks: 20,
        alignment: 'center',
      })
    ).document;
    expect(() =>
      executeEditorCommand(
        transitioned,
        createSplitClipsCommand(['from'], 95, () => 'inside')
      )
    ).toThrow('splitting inside');
    const split = executeEditorCommand(
      transitioned,
      createSplitClipsCommand(['from'], 50, () => 'right')
    );
    expect(split.document.sequence.transitions.transition).toMatchObject({
      fromClipId: 'right',
      cutTick: 100,
    });
  });

  it('places media with an optional all-track ripple shift', () => {
    const project = createProject();
    project.assets.image = imageAsset;
    addImageClip(project, 'after', 200, 100);
    addAudioClip(project, 'audio-after', 200, 0);
    const placed = executeEditorCommand(
      project,
      createPlaceAssetCommand({
        assetId: 'image',
        trackId: 'video',
        timelineStart: 100,
        clipId: 'placed',
        ripple: true,
      })
    );
    expect(placed.document.sequence.clips.placed.timelineStart).toBe(100);
    expect(placed.document.sequence.clips.after.timelineStart).toBe(300);
    expect(placed.document.sequence.clips['audio-after'].timelineStart).toBe(
      300
    );
  });
});
