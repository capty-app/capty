import {
  createFfmpegAudioInputArgs,
  createFfmpegAudioRenderPlan,
} from '@/main/editor-v2/export/ffmpeg-audio-renderer';
import type { AudioTimelinePlan, KeyboardSoundPlan } from '@/types/editor-v2';

const keyboard: KeyboardSoundPlan = {
  kind: 'keyboard-sound',
  id: 'key',
  clipId: 'clip',
  effectId: 'effect',
  outputTick: 2_400,
  volume: 0.25,
  soundType: 'cherry-red',
  sampleIndex: 2,
  playbackRate: { numerator: 2, denominator: 1 },
};

const timeline: AudioTimelinePlan = {
  durationTicks: 8_000,
  keyboardSounds: [keyboard],
  regions: [
    {
      kind: 'media',
      id: 'music',
      clipId: 'music',
      trackId: 'audio-1',
      assetId: 'asset',
      sourceStreamId: 'stream',
      outputStart: 800,
      outputEnd: 4_800,
      sourceStart: 1_600,
      sourceEnd: 9_600,
      playbackRate: { numerator: 2, denominator: 1 },
      gain: 0.5,
      muted: false,
      solo: false,
      envelope: {
        fadeIn: { start: 800, end: 1_600 },
        fadeOut: { start: 4_000, end: 4_800 },
        crossfade: {
          transitionId: 'crossfade',
          role: 'outgoing',
          start: 4_000,
          end: 4_800,
        },
      },
    },
  ],
};

describe('FFmpeg audio renderer', () => {
  it('serializes canonical media timing, envelopes, keyboard sounds, and mix duration', () => {
    const plan = createFfmpegAudioRenderPlan(timeline, {
      resolveMedia: () => ({ path: '/media/music.wav', streamIndex: 1 }),
      resolveKeyboardSample: () => ({ path: '/sounds/key.mp3' }),
    });

    expect(plan.inputs).toEqual([
      {
        id: 'music',
        kind: 'media',
        path: '/media/music.wav',
        streamIndex: 1,
      },
      { id: 'key', kind: 'keyboard', path: '/sounds/key.mp3' },
    ]);
    expect(createFfmpegAudioInputArgs(plan)).toEqual([
      '-i',
      '/media/music.wav',
      '-i',
      '/sounds/key.mp3',
    ]);
    expect(plan.filterComplex).toBe(
      '[0:a:1]asetpts=PTS-STARTPTS,atrim=start=0.004444444:end=0.026666667,asetpts=PTS-STARTPTS,atempo=2,volume=0.5,afade=t=in:st=0:d=0.002222222,afade=t=out:st=0.008888889:d=0.002222222,afade=t=out:st=0.008888889:d=0.002222222,adelay=2.222222222:all=1[media0];[1:a:0]asetpts=PTS-STARTPTS,atempo=2,volume=0.25,adelay=6.666666667:all=1[keyboard0];[media0][keyboard0]amix=inputs=2:normalize=0:dropout_transition=0,atrim=duration=0.022222222[audio-out]'
    );
  });

  it('creates bounded silence when no sources are active', () => {
    const plan = createFfmpegAudioRenderPlan(
      { durationTicks: 360_000, regions: [], keyboardSounds: [] },
      {
        resolveMedia: () => ({ path: '' }),
        resolveKeyboardSample: () => ({ path: '' }),
      }
    );

    expect(plan.inputs).toEqual([]);
    expect(plan.filterComplex).toBe(
      'anullsrc=r=48000:cl=stereo,atrim=duration=1[audio-out]'
    );
  });
});
