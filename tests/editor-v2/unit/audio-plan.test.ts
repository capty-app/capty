import { createDeleteClipsCommand } from '@/editor-v2/commands/timeline-edits';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { ticksForFrames } from '@/editor-v2/time/timebase';
import {
  buildAudioTimelinePlan,
  buildCompleteAudioTimelinePlan,
  evaluateAudioPlan,
  getAudioEnvelopeGain,
} from '@/editor-v2/timeline/audio-plan';
import type {
  AudioClip,
  AudioMediaAsset,
  AudioTrack,
  EditorProjectV2,
  VideoClip,
  VideoMediaAsset,
} from '@/types/editor-v2';

const NOW = '2026-09-01T00:00:00.000Z';

const createProject = (): EditorProjectV2 =>
  createEmptyEditorProject({
    id: 'project',
    name: 'Audio plan',
    createdAt: NOW,
    sequenceId: 'sequence',
    videoTrackId: 'video-1',
    audioTrackId: 'audio-1',
  });

const audioAsset = (id: string, durationTicks = 20_000): AudioMediaAsset => ({
  id,
  kind: 'audio',
  name: id,
  locator: { kind: 'managed', relativePath: `media/${id}.wav` },
  importedAt: NOW,
  durationTicks,
  channels: 2,
  sampleRate: 48_000,
  audioStreams: [
    {
      id: `${id}-stream`,
      codec: 'pcm_s16le',
      durationTicks,
      channels: 2,
      sampleRate: 48_000,
    },
  ],
});

const videoAsset = (id: string, durationTicks = 20_000): VideoMediaAsset => ({
  id,
  kind: 'video',
  name: id,
  locator: { kind: 'managed', relativePath: `media/${id}.mp4` },
  importedAt: NOW,
  durationTicks,
  width: 1920,
  height: 1080,
  frameRate: { numerator: 60, denominator: 1 },
  videoStreams: [
    {
      id: `${id}-video`,
      codec: 'h264',
      durationTicks,
      width: 1920,
      height: 1080,
      frameRate: { numerator: 60, denominator: 1 },
      hasAlpha: false,
    },
  ],
  audioStreams: [
    {
      id: `${id}-audio`,
      codec: 'aac',
      durationTicks,
      channels: 2,
      sampleRate: 48_000,
    },
  ],
});

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
    sourceStreamId: input.sourceStreamId ?? `${input.assetId}-stream`,
    sourceRole: input.sourceRole,
    linkedGroupId: input.linkedGroupId,
    gain: input.gain ?? 1,
    fadeInTicks: input.fadeInTicks ?? 0,
    fadeOutTicks: input.fadeOutTicks ?? 0,
    effects: input.effects ?? [],
  };
  project.sequence.clips[clip.id] = clip;
  project.sequence.tracks[clip.trackId].clipIds.push(clip.id);
  return clip;
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
    linkedGroupId: input.linkedGroupId,
    effects: input.effects ?? [],
  };
  project.sequence.clips[clip.id] = clip;
  project.sequence.tracks[clip.trackId].clipIds.push(clip.id);
  return clip;
};

const addAudioTrack = (project: EditorProjectV2, track: AudioTrack): void => {
  project.sequence.tracks[track.id] = track;
  project.sequence.audioTrackIds.push(track.id);
};

describe('AudioPlan', () => {
  it('maps trims, rates, gains, missing tails, and semantic pre-roll', () => {
    const project = createProject();
    project.assets.music = audioAsset('music', 4_000);
    project.sequence.preRoll = {
      kind: 'output-frame-count',
      assetId: 'first-frame',
      frames: 1,
      fit: 'cover',
    };
    addAudioClip(project, {
      id: 'music-clip',
      assetId: 'music',
      timelineStart: 100,
      timelineDuration: 3_000,
      sourceStart: 1_000,
      sourceDuration: 5_000,
      playbackRate: { numerator: 2, denominator: 1 },
      gain: 0.5,
      effects: [{ id: 'gain', kind: 'audio-gain', enabled: true, gain: 0.5 }],
    });

    const plan = buildAudioTimelinePlan(project);
    expect(plan.durationTicks).toBe(9_100);
    expect(plan.regions).toMatchObject([
      {
        outputStart: 6_100,
        outputEnd: 7_600,
        sourceStart: 1_000,
        sourceEnd: 4_000,
        playbackRate: { numerator: 2, denominator: 1 },
        gain: 0.25,
      },
    ]);
    expect(evaluateAudioPlan(project, 6_200, 200).regions[0]).toMatchObject({
      sourceTick: 1_200,
      gain: 0.25,
    });
  });

  it('keeps independently intersected offset streams and suppresses embedded fallback', () => {
    const project = createProject();
    project.assets.recording = videoAsset('recording', 10_000);
    addVideoClip(project, {
      id: 'screen',
      assetId: 'recording',
      linkedGroupId: 'group',
      timelineStart: 0,
      timelineDuration: 2_000,
      sourceDuration: 2_000,
    });
    addAudioClip(project, {
      id: 'system',
      assetId: 'recording',
      linkedGroupId: 'group',
      timelineStart: 300,
      timelineDuration: 700,
      sourceStart: 0,
      sourceDuration: 700,
      sourceStreamId: 'recording-audio',
    });

    const plan = buildAudioTimelinePlan(project);
    expect(plan.regions.map(region => region.id)).toEqual(['system']);
    expect(plan.regions[0]).toMatchObject({
      outputStart: 300,
      outputEnd: 1_000,
    });
  });

  it('uses embedded audio only when no accepted external sibling exists', () => {
    const project = createProject();
    project.assets.recording = videoAsset('recording', 1_500);
    addVideoClip(project, {
      id: 'screen',
      assetId: 'recording',
      timelineDuration: 2_000,
      sourceDuration: 2_000,
      playbackRate: { numerator: 1, denominator: 1 },
    });

    expect(buildAudioTimelinePlan(project).regions).toMatchObject([
      {
        id: 'screen:embedded-audio',
        outputStart: 0,
        outputEnd: 1_500,
        sourceEnd: 1_500,
      },
    ]);
  });

  it('applies track solo and mute precedence in mix order', () => {
    const project = createProject();
    project.assets.one = audioAsset('one');
    project.assets.two = audioAsset('two');
    addAudioTrack(project, {
      id: 'audio-2',
      kind: 'audio',
      name: 'Solo',
      clipIds: [],
      locked: false,
      muted: false,
      solo: true,
      gain: 0.75,
      mixOrder: -1,
    });
    addAudioClip(project, { id: 'one', assetId: 'one' });
    addAudioClip(project, {
      id: 'two',
      assetId: 'two',
      trackId: 'audio-2',
      gain: 0.5,
    });

    expect(buildAudioTimelinePlan(project).regions).toMatchObject([
      { id: 'two', muted: false, solo: true, gain: 0.375 },
      { id: 'one', muted: true, solo: false },
    ]);
  });

  it('maps independently probed Capty system and microphone stream bounds', () => {
    const project = createProject();
    project.assets.recording = {
      id: 'recording',
      kind: 'capty-recording',
      name: 'Recording',
      locator: { kind: 'managed', relativePath: 'media/screen.mov' },
      importedAt: NOW,
      durationTicks: 2_000,
      width: 1920,
      height: 1080,
      frameRate: { numerator: 60, denominator: 1 },
      videoStreams: [],
      audioStreams: [],
      sources: {
        systemAudio: {
          kind: 'audio',
          locator: { kind: 'managed', relativePath: 'media/system.m4a' },
          recordingOffsetTicks: 100,
          durationTicks: 1_000,
          streams: [
            {
              id: 'system-stream',
              codec: 'aac',
              durationTicks: 1_000,
              channels: 2,
              sampleRate: 48_000,
            },
          ],
        },
        microphoneAudio: {
          kind: 'audio',
          locator: { kind: 'managed', relativePath: 'media/mic.m4a' },
          recordingOffsetTicks: 300,
          durationTicks: 600,
          streams: [
            {
              id: 'mic-stream',
              codec: 'aac',
              durationTicks: 600,
              channels: 1,
              sampleRate: 48_000,
            },
          ],
        },
      },
    };
    addAudioClip(project, {
      id: 'system',
      assetId: 'recording',
      timelineStart: 100,
      timelineDuration: 1_000,
      sourceDuration: 1_000,
      sourceStreamId: 'system-stream',
      sourceRole: 'system-audio',
    });
    addAudioClip(project, {
      id: 'microphone',
      assetId: 'recording',
      timelineStart: 300,
      timelineDuration: 1_000,
      sourceDuration: 1_000,
      sourceStreamId: 'mic-stream',
      sourceRole: 'microphone-audio',
    });

    expect(buildAudioTimelinePlan(project).regions).toMatchObject([
      { id: 'system', outputStart: 100, outputEnd: 1_100, sourceEnd: 1_000 },
      { id: 'microphone', outputStart: 300, outputEnd: 900, sourceEnd: 600 },
    ]);
  });

  it.each([
    { numerator: 10, denominator: 1 },
    { numerator: 20, denominator: 1 },
    { numerator: 24, denominator: 1 },
    { numerator: 25, denominator: 1 },
    { numerator: 30, denominator: 1 },
    { numerator: 40, denominator: 1 },
    { numerator: 50, denominator: 1 },
    { numerator: 60, denominator: 1 },
    { numerator: 30_000, denominator: 1_001 },
  ])(
    'shifts audio by exactly one semantic First Frame at $numerator/$denominator',
    rate => {
      const project = createProject();
      project.timebase.displayFrameRate = rate;
      project.assets.music = audioAsset('music', 360_000);
      project.sequence.preRoll = {
        kind: 'output-frame-count',
        assetId: 'first-frame',
        frames: 1,
        fit: 'cover',
      };
      addAudioClip(project, {
        id: 'music',
        assetId: 'music',
        timelineDuration: 360_000,
        sourceDuration: 360_000,
      });
      const preRollTicks = ticksForFrames(1, rate, 'nearest');

      expect(buildAudioTimelinePlan(project)).toMatchObject({
        durationTicks: preRollTicks + 360_000,
        regions: [
          { outputStart: preRollTicks, outputEnd: preRollTicks + 360_000 },
        ],
      });
    }
  );

  it('reflects Ripple deletion and reordered source ranges without stale audio', () => {
    const project = createProject();
    project.assets.music = audioAsset('music');
    addAudioClip(project, {
      id: 'first',
      assetId: 'music',
      timelineDuration: 1_000,
      sourceStart: 4_000,
      sourceDuration: 2_000,
      playbackRate: { numerator: 2, denominator: 1 },
    });
    addAudioClip(project, {
      id: 'second',
      assetId: 'music',
      timelineStart: 1_000,
      timelineDuration: 1_000,
      sourceStart: 1_000,
      sourceDuration: 1_000,
    });

    const result = createDeleteClipsCommand({
      clipIds: ['first'],
      ripple: true,
    }).apply(project);

    expect(buildAudioTimelinePlan(result.document).regions).toMatchObject([
      {
        id: 'second',
        outputStart: 0,
        outputEnd: 1_000,
        sourceStart: 1_000,
        sourceEnd: 2_000,
      },
    ]);
  });

  it('creates complementary fades and audio crossfade handles', () => {
    const project = createProject();
    project.assets.music = audioAsset('music');
    addAudioClip(project, {
      id: 'out',
      assetId: 'music',
      timelineDuration: 1_000,
      sourceStart: 1_000,
      sourceDuration: 1_000,
      fadeInTicks: 200,
    });
    addAudioClip(project, {
      id: 'in',
      assetId: 'music',
      timelineStart: 1_000,
      timelineDuration: 1_000,
      sourceStart: 3_000,
      sourceDuration: 1_000,
      fadeOutTicks: 200,
    });
    project.sequence.transitions.crossfade = {
      id: 'crossfade',
      type: 'audio-crossfade',
      trackId: 'audio-1',
      fromClipId: 'out',
      toClipId: 'in',
      cutTick: 1_000,
      durationTicks: 400,
      alignment: 'center',
    };

    const [outgoing, incoming] = buildAudioTimelinePlan(project).regions;
    expect(outgoing).toMatchObject({
      outputEnd: 1_200,
      sourceEnd: 2_200,
      envelope: {
        fadeIn: { start: 0, end: 200 },
        crossfade: { role: 'outgoing', start: 800, end: 1_200 },
      },
    });
    expect(incoming).toMatchObject({
      outputStart: 800,
      sourceStart: 2_800,
      envelope: {
        fadeOut: { start: 1_800, end: 2_000 },
        crossfade: { role: 'incoming', start: 800, end: 1_200 },
      },
    });
    expect(getAudioEnvelopeGain(outgoing, 1_000)).toBe(0.5);
    expect(getAudioEnvelopeGain(incoming, 1_000)).toBe(0.5);
  });

  it('maps deterministic keyboard samples through cuts, rates, and pre-roll', async () => {
    const project = createProject();
    project.assets.recording = videoAsset('recording');
    project.sequence.preRoll = {
      kind: 'output-frame-count',
      assetId: 'first-frame',
      frames: 1,
      fit: 'contain',
    };
    const clip = addVideoClip(project, {
      id: 'screen',
      assetId: 'recording',
      timelineStart: 200,
      sourceStart: 1_000,
      sourceDuration: 2_000,
      timelineDuration: 1_000,
      playbackRate: { numerator: 2, denominator: 1 },
    });
    clip.effects.push({
      id: 'keyboard',
      kind: 'keyboard',
      enabled: true,
      timeDomain: 'source',
      data: {
        kind: 'v2-data',
        relativePath: 'data/keyboard.json',
        fingerprint: { byteLength: 1, sha256: 'hash' },
      },
      style: {
        displayDuration: 1,
        position: 'bottom-center',
        fontSize: 'medium',
        opacity: 0.75,
      },
      sound: { enabled: true, volume: 0.4, type: 'cherry-blue' },
    });

    const completePlan = await buildCompleteAudioTimelinePlan(
      project,
      async () => ({
        kind: 'keyboard',
        value: {
          events: [
            {
              timestamp: 0.001,
              key: 'x',
              keyCode: 1,
              modifiers: [],
              type: 'down',
            },
            {
              timestamp: 0.003333,
              key: 'a',
              keyCode: 2,
              modifiers: [],
              type: 'down',
            },
            {
              timestamp: 0.004,
              key: 'a',
              keyCode: 2,
              modifiers: [],
              type: 'up',
            },
            {
              timestamp: 0.005556,
              key: 'b',
              keyCode: 3,
              modifiers: [],
              type: 'down',
            },
          ],
          meta: { startTime: NOW, duration: 3, sampleRate: 60 },
        },
      })
    );

    expect(completePlan.keyboardSounds).toMatchObject([
      {
        outputTick: 6_300,
        sampleIndex: 1,
        volume: 0.4,
        playbackRate: { numerator: 2, denominator: 1 },
      },
      {
        outputTick: 6_700,
        sampleIndex: 2,
        volume: 0.4,
        playbackRate: { numerator: 2, denominator: 1 },
      },
    ]);
  });
});
