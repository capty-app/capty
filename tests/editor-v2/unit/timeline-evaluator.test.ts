import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import {
  evaluateSequence,
  getSequenceOutputDuration,
} from '@/editor-v2/timeline';
import type {
  AudioClip,
  AudioMediaAsset,
  EditorProjectV2,
  ImageClip,
  ImageMediaAsset,
  VideoClip,
  VideoMediaAsset,
  VideoTrack,
} from '@/types/editor-v2';

const NOW = '2026-09-01T00:00:00.000Z';

const videoAsset = (id: string, durationTicks = 20_000): VideoMediaAsset => ({
  id,
  kind: 'video',
  name: id,
  locator: { kind: 'managed', relativePath: `media/${id}/${id}.mov` },
  importedAt: NOW,
  durationTicks,
  width: 1280,
  height: 720,
  frameRate: { numerator: 60, denominator: 1 },
  videoStreams: [
    {
      id: `${id}-video`,
      codec: 'h264',
      durationTicks,
      width: 1280,
      height: 720,
      frameRate: { numerator: 60, denominator: 1 },
      hasAlpha: false,
    },
  ],
  audioStreams: [],
});

const imageAsset = (id: string): ImageMediaAsset => ({
  id,
  kind: 'image',
  name: id,
  locator: { kind: 'managed', relativePath: `media/${id}/${id}.png` },
  importedAt: NOW,
  width: 800,
  height: 600,
  orientation: 1,
  defaultStillDurationTicks: 2_000,
});

const audioAsset = (id: string, durationTicks = 20_000): AudioMediaAsset => ({
  id,
  kind: 'audio',
  name: id,
  locator: { kind: 'managed', relativePath: `media/${id}/${id}.wav` },
  importedAt: NOW,
  durationTicks,
  channels: 2,
  sampleRate: 48_000,
  audioStreams: [
    {
      id: `${id}-audio`,
      codec: 'pcm_s16le',
      durationTicks,
      channels: 2,
      sampleRate: 48_000,
    },
  ],
});

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Evaluator',
    createdAt: NOW,
    sequenceId: 'sequence',
    videoTrackId: 'video-1',
    audioTrackId: 'audio-1',
  });
  project.timebase.displayFrameRate = { numerator: 60, denominator: 1 };
  return project;
};

const addVideoClip = (
  project: EditorProjectV2,
  input: Partial<VideoClip> & Pick<VideoClip, 'id' | 'assetId'>
): VideoClip => {
  const clip: VideoClip = {
    id: input.id,
    kind: 'video',
    trackId: input.trackId ?? 'video-1',
    assetId: input.assetId,
    name: input.id,
    timelineStart: input.timelineStart ?? 0,
    timelineDuration: input.timelineDuration ?? 1_000,
    sourceStart: input.sourceStart ?? 0,
    sourceDuration: input.sourceDuration ?? 1_000,
    playbackRate: input.playbackRate ?? { numerator: 1, denominator: 1 },
    sourceStreamId: input.sourceStreamId ?? `${input.assetId}-video`,
    sourceRole: input.sourceRole,
    effects: input.effects ?? [],
  };
  project.sequence.clips[clip.id] = clip;
  const track = project.sequence.tracks[clip.trackId];
  if (track) track.clipIds.push(clip.id);
  return clip;
};

const addImageClip = (
  project: EditorProjectV2,
  input: Partial<ImageClip> & Pick<ImageClip, 'id' | 'assetId'>
): ImageClip => {
  const clip: ImageClip = {
    id: input.id,
    kind: 'image',
    trackId: input.trackId ?? 'video-1',
    assetId: input.assetId,
    name: input.id,
    timelineStart: input.timelineStart ?? 0,
    timelineDuration: input.timelineDuration ?? 1_000,
    sourceStart: 0,
    sourceDuration: input.sourceDuration ?? 1_000,
    playbackRate: input.playbackRate ?? { numerator: 1, denominator: 1 },
    effects: input.effects ?? [],
  };
  project.sequence.clips[clip.id] = clip;
  const track = project.sequence.tracks[clip.trackId];
  if (track) track.clipIds.push(clip.id);
  return clip;
};

const addAudioClip = (
  project: EditorProjectV2,
  input: Partial<AudioClip> & Pick<AudioClip, 'id' | 'assetId'>
): AudioClip => {
  const clip: AudioClip = {
    id: input.id,
    kind: 'audio',
    trackId: input.trackId ?? 'audio-1',
    assetId: input.assetId,
    name: input.id,
    timelineStart: input.timelineStart ?? 0,
    timelineDuration: input.timelineDuration ?? 1_000,
    sourceStart: input.sourceStart ?? 0,
    sourceDuration: input.sourceDuration ?? 1_000,
    playbackRate: input.playbackRate ?? { numerator: 1, denominator: 1 },
    sourceStreamId: input.sourceStreamId ?? `${input.assetId}-audio`,
    sourceRole: input.sourceRole,
    gain: input.gain ?? 1,
    fadeInTicks: 0,
    fadeOutTicks: 0,
    effects: input.effects ?? [],
  };
  project.sequence.clips[clip.id] = clip;
  const track = project.sequence.tracks[clip.trackId];
  if (track) track.clipIds.push(clip.id);
  return clip;
};

describe('evaluateSequence', () => {
  it('uses half-open ranges for gaps and image duration', () => {
    const project = createProject();
    project.assets.image = imageAsset('image');
    addImageClip(project, {
      id: 'still',
      assetId: 'image',
      timelineStart: 1_000,
      timelineDuration: 2_000,
    });

    expect(evaluateSequence(project, 999).layers).toEqual([]);
    expect(evaluateSequence(project, 1_000).layers).toMatchObject([
      { kind: 'media', origin: 'clip', clipId: 'still', sourceTick: 0 },
    ]);
    expect(evaluateSequence(project, 2_999).layers).toHaveLength(1);
    expect(evaluateSequence(project, 3_000).layers).toEqual([]);
  });

  it('orders overlapping tracks and maps rational playback rates exactly', () => {
    const project = createProject();
    project.assets.lower = videoAsset('lower');
    project.assets.upper = videoAsset('upper');
    const upperTrack: VideoTrack = {
      id: 'video-2',
      kind: 'video',
      name: 'Upper',
      clipIds: [],
      locked: false,
      visible: true,
      compositingOrder: 2,
    };
    project.sequence.tracks[upperTrack.id] = upperTrack;
    project.sequence.videoTrackIds.push(upperTrack.id);
    addVideoClip(project, {
      id: 'lower-clip',
      assetId: 'lower',
      sourceStart: 100,
      playbackRate: { numerator: 3, denominator: 2 },
      effects: [
        {
          id: 'opacity',
          kind: 'opacity',
          enabled: true,
          opacity: 0.5,
        },
      ],
    });
    addVideoClip(project, {
      id: 'upper-clip',
      assetId: 'upper',
      trackId: 'video-2',
    });

    const evaluation = evaluateSequence(project, 200);
    expect(
      evaluation.layers.map(layer =>
        layer.kind === 'media'
          ? [layer.clipId, layer.sourceTick, layer.opacity]
          : []
      )
    ).toEqual([
      ['lower-clip', 400, 0.5],
      ['upper-clip', 200, 1],
    ]);
    expect(Object.isFrozen(evaluation)).toBe(true);
    expect(Object.isFrozen(evaluation.layers)).toBe(true);
    expect(Object.isFrozen(evaluation.layers[0])).toBe(true);
  });

  it('omits reads outside independently probed stream durations', () => {
    const project = createProject();
    project.assets.short = videoAsset('short', 600);
    addVideoClip(project, {
      id: 'short-clip',
      assetId: 'short',
      timelineStart: 200,
      timelineDuration: 1_000,
      sourceStart: 100,
      sourceDuration: 1_000,
    });

    expect(evaluateSequence(project, 199).layers).toEqual([]);
    expect(evaluateSequence(project, 200).layers).toHaveLength(1);
    expect(evaluateSequence(project, 699).layers).toHaveLength(1);
    expect(evaluateSequence(project, 700).layers).toEqual([]);
    expect(evaluateSequence(project, 1_200).layers).toEqual([]);
  });

  it('resolves offset Capty side streams without fabricating leading or trailing frames', () => {
    const project = createProject();
    project.assets.recording = {
      id: 'recording',
      kind: 'capty-recording',
      name: 'Recording',
      locator: { kind: 'managed', relativePath: 'media/recording/screen.mov' },
      importedAt: NOW,
      durationTicks: 2_000,
      width: 1920,
      height: 1080,
      frameRate: { numerator: 60, denominator: 1 },
      videoStreams: [
        {
          id: 'screen-stream',
          codec: 'h264',
          durationTicks: 2_000,
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
          locator: {
            kind: 'managed',
            relativePath: 'media/recording/camera.mov',
          },
          recordingOffsetTicks: 300,
          durationTicks: 500,
          streams: [
            {
              id: 'screen-stream',
              codec: 'h264',
              durationTicks: 500,
              width: 640,
              height: 480,
              frameRate: { numerator: 30, denominator: 1 },
              hasAlpha: false,
            },
          ],
        },
      },
    };
    addVideoClip(project, {
      id: 'camera-clip',
      assetId: 'recording',
      timelineStart: 300,
      timelineDuration: 500,
      sourceStart: 0,
      sourceDuration: 500,
      sourceStreamId: 'screen-stream',
      sourceRole: 'camera-video',
    });

    expect(evaluateSequence(project, 299).layers).toEqual([]);
    expect(evaluateSequence(project, 300).layers).toMatchObject([
      {
        clipId: 'camera-clip',
        sourceStreamId: 'screen-stream',
        sourceRole: 'camera-video',
        sourceTick: 0,
      },
    ]);
    expect(evaluateSequence(project, 799).layers).toMatchObject([
      { clipId: 'camera-clip', sourceTick: 499 },
    ]);
    expect(evaluateSequence(project, 800).layers).toEqual([]);
  });

  it.each([
    [24, 1, 15_000],
    [25, 1, 14_400],
    [30, 1, 12_000],
    [50, 1, 7_200],
    [60, 1, 6_000],
    [24_000, 1_001, 15_015],
    [30_000, 1_001, 12_012],
    [60_000, 1_001, 6_006],
  ])(
    'keeps semantic First Frame at one frame for %i/%i fps',
    (numerator, denominator, expectedTicks) => {
      const project = createProject();
      project.assets.first = imageAsset('first');
      project.assets.video = videoAsset('video');
      project.timebase.displayFrameRate = { numerator, denominator };
      project.sequence.preRoll = {
        kind: 'output-frame-count',
        assetId: 'first',
        frames: 1,
        fit: 'cover',
      };
      addVideoClip(project, { id: 'video-clip', assetId: 'video' });

      const firstFrame = evaluateSequence(project, expectedTicks - 1);
      const content = evaluateSequence(project, expectedTicks);
      expect(firstFrame.preRollTicks).toBe(expectedTicks);
      expect(firstFrame.contentTick).toBeNull();
      expect(firstFrame.layers).toMatchObject([
        {
          origin: 'pre-roll',
          preRollAssetId: 'first',
          fit: 'cover',
          sourceTick: 0,
        },
      ]);
      expect(content.contentTick).toBe(0);
      expect(content.layers).toMatchObject([{ clipId: 'video-clip' }]);
      expect(getSequenceOutputDuration(project)).toBe(expectedTicks + 1_000);
    }
  );

  it('re-evaluates semantic pre-roll after a frame-rate change', () => {
    const project = createProject();
    project.assets.first = imageAsset('first');
    project.sequence.preRoll = {
      kind: 'output-frame-count',
      assetId: 'first',
      frames: 1,
      fit: 'stretch',
    };
    expect(evaluateSequence(project, 0).preRollTicks).toBe(6_000);
    project.timebase.displayFrameRate = { numerator: 24, denominator: 1 };
    expect(evaluateSequence(project, 0).preRollTicks).toBe(15_000);
  });

  it('evaluates cross-dissolve virtual handles with ordered complementary layers', () => {
    const project = createProject();
    project.assets.video = videoAsset('video', 5_000);
    addVideoClip(project, {
      id: 'from',
      assetId: 'video',
      sourceStart: 500,
      sourceDuration: 1_000,
    });
    addVideoClip(project, {
      id: 'to',
      assetId: 'video',
      timelineStart: 1_000,
      sourceStart: 2_000,
      sourceDuration: 1_000,
    });
    project.sequence.transitions.dissolve = {
      id: 'dissolve',
      type: 'video-cross-dissolve',
      trackId: 'video-1',
      fromClipId: 'from',
      toClipId: 'to',
      cutTick: 1_000,
      durationTicks: 200,
      alignment: 'center',
    };

    const start = evaluateSequence(project, 900).layers;
    const middle = evaluateSequence(project, 1_000).layers;
    expect(start).toMatchObject([
      {
        clipId: 'from',
        sourceTick: 1_400,
        opacity: 1,
        transition: { role: 'outgoing', progress: 0 },
      },
      {
        clipId: 'to',
        sourceTick: 1_900,
        opacity: 0,
        transition: { role: 'incoming', progress: 0 },
      },
    ]);
    expect(middle).toMatchObject([
      { clipId: 'from', sourceTick: 1_500, opacity: 0.5 },
      { clipId: 'to', sourceTick: 2_000, opacity: 0.5 },
    ]);
    expect(evaluateSequence(project, 1_100).layers).toMatchObject([
      { clipId: 'to', transition: undefined },
    ]);
  });

  it('anchors odd non-1x dissolves to exact source boundaries', () => {
    const project = createProject();
    project.assets.video = videoAsset('video', 5_000);
    addVideoClip(project, {
      id: 'from',
      assetId: 'video',
      sourceStart: 500,
      sourceDuration: 1_001,
      timelineDuration: 667,
      playbackRate: { numerator: 3, denominator: 2 },
    });
    addVideoClip(project, {
      id: 'to',
      assetId: 'video',
      timelineStart: 667,
      timelineDuration: 667,
      sourceStart: 2_000,
      sourceDuration: 1_001,
      playbackRate: { numerator: 3, denominator: 2 },
    });
    project.sequence.transitions.dissolve = {
      id: 'dissolve',
      type: 'video-cross-dissolve',
      trackId: 'video-1',
      fromClipId: 'from',
      toClipId: 'to',
      cutTick: 667,
      durationTicks: 5,
      alignment: 'center',
    };

    expect(evaluateSequence(project, 666).layers).toMatchObject([
      { clipId: 'from', sourceTick: 1_499 },
      { clipId: 'to', sourceTick: 1_998 },
    ]);
    expect(evaluateSequence(project, 667).layers).toMatchObject([
      { clipId: 'from', sourceTick: 1_501 },
      { clipId: 'to', sourceTick: 2_000 },
    ]);
    expect(evaluateSequence(project, 668).layers).toMatchObject([
      { clipId: 'from', sourceTick: 1_503 },
      { clipId: 'to', sourceTick: 2_002 },
    ]);
  });

  it('adds explicit fade-black layers inside clip edges', () => {
    const project = createProject();
    project.assets.video = videoAsset('video');
    addVideoClip(project, { id: 'clip', assetId: 'video' });
    project.sequence.transitions.fade = {
      id: 'fade',
      type: 'video-fade-black',
      trackId: 'video-1',
      clipId: 'clip',
      edge: 'out',
      durationTicks: 200,
    };

    expect(evaluateSequence(project, 800).layers).toMatchObject([
      { clipId: 'clip' },
      { kind: 'black', opacity: 0 },
    ]);
    expect(evaluateSequence(project, 900).layers).toMatchObject([
      { clipId: 'clip' },
      { kind: 'black', opacity: 0.5 },
    ]);
    expect(evaluateSequence(project, 1_000).layers).toEqual([]);
  });

  it('creates the canonical canvas spec from one enabled settings effect', () => {
    const project = createProject();
    project.sequence.effects.push({
      id: 'canvas',
      kind: 'canvas-settings',
      enabled: true,
      width: 1080,
      height: 1920,
      backgroundColor: '#123456',
      aspectRatio: { name: '9:16', width: 9, height: 16 },
    });

    expect(evaluateSequence(project, 0).composition).toEqual({
      width: 1080,
      height: 1920,
      backgroundColor: '#123456',
      effects: project.sequence.effects,
    });
  });

  it('emits a silent pre-roll and offset-aware audio skeleton', () => {
    const project = createProject();
    project.assets.first = imageAsset('first');
    project.assets.audio = audioAsset('audio', 800);
    project.sequence.preRoll = {
      kind: 'output-frame-count',
      assetId: 'first',
      frames: 1,
      fit: 'cover',
    };
    const clip = addAudioClip(project, {
      id: 'audio-clip',
      assetId: 'audio',
      timelineStart: 100,
      timelineDuration: 1_000,
      sourceStart: 200,
      sourceDuration: 1_000,
      gain: 0.5,
    });
    clip.effects.push({
      id: 'gain',
      kind: 'audio-gain',
      enabled: true,
      gain: 0.5,
    });
    const track = project.sequence.tracks['audio-1'];
    if (track.kind !== 'audio') throw new Error('Expected audio track');
    track.gain = 0.8;

    expect(evaluateSequence(project, 0).audio.regions).toEqual([]);
    const outputTick = 6_000 + 300;
    expect(evaluateSequence(project, outputTick).audio).toMatchObject({
      tick: outputTick,
      regions: [
        {
          clipId: 'audio-clip',
          sourceTick: 400,
          gain: 0.2,
          muted: false,
          solo: false,
        },
      ],
    });
    expect(evaluateSequence(project, 6_000 + 700).audio.regions).toEqual([]);
  });
});
