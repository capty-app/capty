import { ticksToSeconds } from '@/editor-v2/time/timebase';
import type {
  AudioTimelinePlan,
  AudioTimelineRegionPlan,
  KeyboardSoundPlan,
} from '@/types/editor-v2';

export interface FFmpegAudioSource {
  path: string;
  streamIndex?: number;
}

export interface FFmpegAudioInput extends FFmpegAudioSource {
  id: string;
  kind: 'media' | 'keyboard';
}

export interface FFmpegAudioRenderPlan {
  inputs: readonly FFmpegAudioInput[];
  filterComplex: string;
  outputLabel: string;
  durationSeconds: number;
}

export interface FFmpegAudioRenderResolvers {
  resolveMedia: (region: AudioTimelineRegionPlan) => FFmpegAudioSource;
  resolveKeyboardSample: (sound: KeyboardSoundPlan) => FFmpegAudioSource;
}

const decimal = (value: number): string => {
  if (!Number.isFinite(value))
    throw new RangeError('FFmpeg audio value is invalid');
  const fixed = value.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
  return fixed === '-0' || fixed === '' ? '0' : fixed;
};

const buildTempoFilters = (rate: number): string[] => {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError('FFmpeg audio playback rate is invalid');
  }
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > Number.EPSILON) {
    filters.push(`atempo=${decimal(remaining)}`);
  }
  return filters;
};

const inputPad = (index: number, input: FFmpegAudioInput): string =>
  `[${index}:a:${input.streamIndex ?? 0}]`;

const fadeFilter = (
  type: 'in' | 'out',
  region: AudioTimelineRegionPlan,
  range: { start: number; end: number }
): string => {
  const start = Math.max(0, ticksToSeconds(range.start - region.outputStart));
  const duration = Math.max(0, ticksToSeconds(range.end - range.start));
  return `afade=t=${type}:st=${decimal(start)}:d=${decimal(duration)}`;
};

const mediaFilters = (region: AudioTimelineRegionPlan): string[] => {
  const filters = [
    'asetpts=PTS-STARTPTS',
    `atrim=start=${decimal(ticksToSeconds(region.sourceStart))}:end=${decimal(ticksToSeconds(region.sourceEnd))}`,
    'asetpts=PTS-STARTPTS',
    ...buildTempoFilters(
      region.playbackRate.numerator / region.playbackRate.denominator
    ),
    `volume=${decimal(region.muted ? 0 : region.gain)}`,
  ];
  if (region.envelope.fadeIn) {
    filters.push(fadeFilter('in', region, region.envelope.fadeIn));
  }
  if (region.envelope.fadeOut) {
    filters.push(fadeFilter('out', region, region.envelope.fadeOut));
  }
  if (region.envelope.crossfade) {
    filters.push(
      fadeFilter(
        region.envelope.crossfade.role === 'incoming' ? 'in' : 'out',
        region,
        region.envelope.crossfade
      )
    );
  }
  filters.push(
    `adelay=${decimal(ticksToSeconds(region.outputStart) * 1_000)}:all=1`
  );
  return filters;
};

export const createFfmpegAudioRenderPlan = (
  timeline: AudioTimelinePlan,
  resolvers: FFmpegAudioRenderResolvers
): FFmpegAudioRenderPlan => {
  const inputs: FFmpegAudioInput[] = [];
  const chains: string[] = [];
  const labels: string[] = [];
  const activeRegions = timeline.regions.filter(region => !region.muted);
  activeRegions.forEach((region, index) => {
    const input: FFmpegAudioInput = {
      id: region.id,
      kind: 'media',
      ...resolvers.resolveMedia(region),
    };
    const inputIndex = inputs.push(input) - 1;
    const label = `media${index}`;
    labels.push(`[${label}]`);
    chains.push(
      `${inputPad(inputIndex, input)}${mediaFilters(region).join(',')}[${label}]`
    );
  });
  timeline.keyboardSounds.forEach((sound, index) => {
    const input: FFmpegAudioInput = {
      id: sound.id,
      kind: 'keyboard',
      ...resolvers.resolveKeyboardSample(sound),
    };
    const inputIndex = inputs.push(input) - 1;
    const label = `keyboard${index}`;
    labels.push(`[${label}]`);
    const playbackRate =
      sound.playbackRate.numerator / sound.playbackRate.denominator;
    const filters = [
      'asetpts=PTS-STARTPTS',
      ...buildTempoFilters(playbackRate),
      `volume=${decimal(sound.volume)}`,
      `adelay=${decimal(ticksToSeconds(sound.outputTick) * 1_000)}:all=1`,
    ];
    chains.push(`${inputPad(inputIndex, input)}${filters.join(',')}[${label}]`);
  });
  const durationSeconds = ticksToSeconds(timeline.durationTicks);
  const outputLabel = 'audio-out';
  if (labels.length === 0) {
    chains.push(
      `anullsrc=r=48000:cl=stereo,atrim=duration=${decimal(durationSeconds)}[${outputLabel}]`
    );
  } else {
    chains.push(
      `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,atrim=duration=${decimal(durationSeconds)}[${outputLabel}]`
    );
  }
  return {
    inputs,
    filterComplex: chains.join(';'),
    outputLabel,
    durationSeconds,
  };
};

export const createFfmpegAudioInputArgs = (
  plan: FFmpegAudioRenderPlan
): string[] => plan.inputs.flatMap(input => ['-i', input.path]);
