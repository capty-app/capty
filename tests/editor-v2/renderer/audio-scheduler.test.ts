import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { buildAudioTimelinePlan } from '@/editor-v2/timeline/audio-plan';
import { EditorV2AudioScheduler } from '@/renderer/editor-v2/viewer/audio-scheduler';
import type { EditorProjectV2 } from '@/types/editor-v2';

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Audio scheduler',
    createdAt: '2026-09-01T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.audio = {
    id: 'audio',
    kind: 'audio',
    name: 'Audio',
    locator: { kind: 'managed', relativePath: 'media/audio.wav' },
    importedAt: '2026-09-01T00:00:00.000Z',
    durationTicks: 48_000,
    channels: 2,
    sampleRate: 48_000,
    audioStreams: [
      {
        id: 'stream',
        codec: 'pcm_s16le',
        durationTicks: 48_000,
        channels: 2,
        sampleRate: 48_000,
      },
    ],
  };
  project.sequence.clips.audio = {
    id: 'audio',
    kind: 'audio',
    trackId: 'audio',
    assetId: 'audio',
    name: 'Audio',
    timelineStart: 0,
    timelineDuration: 24_000,
    sourceStart: 4_800,
    sourceDuration: 24_000,
    playbackRate: { numerator: 1, denominator: 1 },
    sourceStreamId: 'stream',
    gain: 0.5,
    fadeInTicks: 4_800,
    fadeOutTicks: 4_800,
    effects: [],
  };
  project.sequence.tracks.audio.clipIds.push('audio');
  return project;
};

const createMediaStream = (sourceStartSeconds = 4_800 / 360_000) => {
  let emitted = false;
  const dispose = vi.fn();
  return {
    dispose,
    next: vi.fn(async () => {
      if (emitted) return null;
      emitted = true;
      return {
        buffer: { duration: 1 } as AudioBuffer,
        sourceStartSeconds,
        sourceDurationSeconds: 28_800 / 360_000 - sourceStartSeconds,
      };
    }),
  };
};

const createAudioContext = () => {
  const starts: unknown[][] = [];
  const stops: unknown[][] = [];
  const parameters: Array<Array<[string, number, number]>> = [];
  const playbackRates: Array<{ value: number }> = [];
  const createParameter = () => {
    const events: Array<[string, number, number]> = [];
    parameters.push(events);
    return {
      value: 1,
      setValueAtTime: (value: number, time: number) =>
        events.push(['set', value, time]),
      linearRampToValueAtTime: (value: number, time: number) =>
        events.push(['ramp', value, time]),
    } as unknown as AudioParam;
  };
  const context = {
    currentTime: 1,
    sampleRate: 48_000,
    destination: {},
    createBuffer: vi.fn(() => ({ duration: 0 })),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 1 }),
    createGain: vi.fn(() => ({
      gain: createParameter(),
      connect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => {
      const playbackRate = { value: 1 };
      playbackRates.push(playbackRate);
      return {
        buffer: null,
        playbackRate,
        connect: vi.fn(),
        start: (...arguments_: unknown[]) => starts.push(arguments_),
        stop: (...arguments_: unknown[]) => stops.push(arguments_),
        onended: null,
      };
    }),
  } as unknown as AudioContext;
  return { context, starts, stops, parameters, playbackRates };
};

describe('EditorV2AudioScheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads through the authorized media capability and schedules one canonical clock', async () => {
    const audio = createAudioContext();
    window.editorV2 = {
      getMediaStatus: vi.fn().mockResolvedValue({
        status: 'resolved',
        asset: {
          assetId: 'audio',
          sourceStreamId: 'stream',
          availability: 'available',
          mediaUrl: 'capty-media://token',
        },
      }),
    } as unknown as Window['editorV2'];
    const scheduler = new EditorV2AudioScheduler({
      projectToken: 'token',
      createContext: () => audio.context,
      createMediaStream: async input =>
        createMediaStream(input.sourceStartSeconds),
    });
    const project = createProject();

    await scheduler.play(project, buildAudioTimelinePlan(project), 2_400);

    expect(window.editorV2.getMediaStatus).toHaveBeenCalledWith({
      projectToken: 'token',
      assetId: 'audio',
      sourceStreamId: 'stream',
      sourceRole: undefined,
    });
    expect(audio.starts).toEqual([[1.02, 0, 0.06]]);
    expect(
      audio.parameters.some(events => events.some(event => event[0] === 'ramp'))
    ).toBe(true);
    expect(scheduler.getPlaybackTick()).toBe(2_400);
    (audio.context as unknown as { currentTime: number }).currentTime = 1.52;
    expect(scheduler.getPlaybackTick()).toBe(182_400);

    scheduler.stop();
    expect(audio.stops).toHaveLength(1);
    expect(scheduler.getPlaybackTick()).toBeNull();
  });

  it('applies canonical keyboard sample playback rates', async () => {
    const audio = createAudioContext();
    window.editorV2 = {} as Window['editorV2'];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1)),
      })
    );
    const scheduler = new EditorV2AudioScheduler({
      projectToken: 'token',
      createContext: () => audio.context,
    });
    const project = createProject();
    const plan = {
      durationTicks: 360_000,
      regions: [],
      keyboardSounds: [
        {
          kind: 'keyboard-sound' as const,
          id: 'key',
          clipId: 'clip',
          effectId: 'effect',
          outputTick: 0,
          volume: 0.5,
          soundType: 'cherry-blue' as const,
          sampleIndex: 0,
          playbackRate: { numerator: 2, denominator: 1 },
        },
      ],
    };

    await scheduler.play(project, plan, 0);

    expect(audio.playbackRates[0].value).toBe(2);
    expect(audio.starts).toEqual([[1.02]]);
  });

  it('disposes a media stream when initial decoding fails', async () => {
    const audio = createAudioContext();
    window.editorV2 = {
      getMediaStatus: vi.fn().mockResolvedValue({
        status: 'resolved',
        asset: {
          assetId: 'audio',
          availability: 'available',
          mediaUrl: 'capty-media://token',
        },
      }),
    } as unknown as Window['editorV2'];
    const stream = {
      dispose: vi.fn(),
      next: vi.fn().mockRejectedValue(new Error('decode failed')),
    };
    const scheduler = new EditorV2AudioScheduler({
      projectToken: 'token',
      createContext: () => audio.context,
      createMediaStream: async () => stream,
    });
    const project = createProject();

    await expect(
      scheduler.play(project, buildAudioTimelinePlan(project), 0)
    ).rejects.toThrow('decode failed');
    expect(stream.dispose).toHaveBeenCalledOnce();
  });

  it('schedules a bounded scrub and disposes its context', async () => {
    const audio = createAudioContext();
    window.editorV2 = {
      getMediaStatus: vi.fn().mockResolvedValue({
        status: 'resolved',
        asset: {
          assetId: 'audio',
          availability: 'available',
          mediaUrl: 'capty-media://token',
        },
      }),
    } as unknown as Window['editorV2'];
    const scheduler = new EditorV2AudioScheduler({
      projectToken: 'token',
      createContext: () => audio.context,
      createMediaStream: async input =>
        createMediaStream(input.sourceStartSeconds),
    });
    const project = createProject();

    await scheduler.scrub(project, buildAudioTimelinePlan(project), 12_000);
    expect(audio.starts).toEqual([[1, 0, 0.03333333333333333]]);
    await scheduler.dispose();
    expect(audio.context.close).toHaveBeenCalledOnce();
  });
});
