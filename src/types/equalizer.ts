export type EqualizerMode =
  'spectrum' | 'circular' | 'mirror' | 'dots' | 'ring' | 'pulse';

export type EqualizerSource = 'mix' | string;

export type EqualizerAudioSource =
  { type: 'system' } | { type: 'mic' } | { type: 'music'; fileName: string };

export interface EqualizerSettings {
  mode: EqualizerMode;
  source: EqualizerSource;
  x: number;
  y: number;
  width: number;
  height: number;
  colorStart: string;
  colorEnd: string;
  backgroundColor: string;
  backgroundOpacity: number;
  opacity: number;
  sensitivity: number;
}

export interface EqualizerSegment extends EqualizerSettings {
  id: string;
  startTime: number;
  endTime: number;
}

export interface AudioAnalysisData {
  frameRate: number;
  spectrumBandCount: number;
  waveformPointCount: number;
  duration: number;
  frames: Int8Array;
}

export interface EqualizerTrackData {
  id: string;
  volume: number;
  enabled: boolean;
  startTime: number;
  endTime: number;
  trimStart: number;
  speed: number;
  analysis: AudioAnalysisData;
}

export interface EqualizerFrameData {
  spectrum: Float32Array;
  waveform: Float32Array;
}

export const DEFAULT_EQUALIZER_SETTINGS: EqualizerSettings = {
  mode: 'spectrum',
  source: 'mix',
  x: 0.25,
  y: 0.76,
  width: 0.5,
  height: 0.16,
  colorStart: '#8b5cf6',
  colorEnd: '#22d3ee',
  backgroundColor: '#09090b',
  backgroundOpacity: 0.22,
  opacity: 1,
  sensitivity: 1.15,
};

export const EQUALIZER_MIN_WIDTH = 0.12;
export const EQUALIZER_MIN_HEIGHT = 0.08;
export const EQUALIZER_ANALYSIS_VALUE_SCALE = 127;

const EQUALIZER_MODES = new Set<EqualizerMode>([
  'spectrum',
  'circular',
  'mirror',
  'dots',
  'ring',
  'pulse',
]);
const RADIAL_EQUALIZER_MODES = new Set<EqualizerMode>([
  'circular',
  'ring',
  'pulse',
]);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MINIMUM_VISIBLE_RATIO = 0.1;
const MAXIMUM_DIMENSION = 10;
const GEOMETRY_EPSILON = 0.000000001;
const TIMELINE_EPSILON = 0.000001;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

export function isRadialEqualizerMode(mode: EqualizerMode): boolean {
  return RADIAL_EQUALIZER_MODES.has(mode);
}

export function isValidEqualizerSettings(
  value: unknown
): value is EqualizerSettings {
  if (!isRecord(value)) return false;
  if (!EQUALIZER_MODES.has(value.mode as EqualizerMode)) return false;
  if (
    typeof value.source !== 'string' ||
    value.source.length === 0 ||
    value.source.length > 255
  ) {
    return false;
  }
  const width = value.width;
  const height = value.height;
  const isRadial = isRadialEqualizerMode(value.mode as EqualizerMode);
  const minimumWidth = isRadial
    ? Number.EPSILON
    : EQUALIZER_MIN_WIDTH - GEOMETRY_EPSILON;
  const minimumHeight = isRadial
    ? Number.EPSILON
    : EQUALIZER_MIN_HEIGHT - GEOMETRY_EPSILON;
  if (!isNumberInRange(width, minimumWidth, MAXIMUM_DIMENSION)) return false;
  if (!isNumberInRange(height, minimumHeight, MAXIMUM_DIMENSION)) return false;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return false;
  if (
    value.x < -width * (1 - MINIMUM_VISIBLE_RATIO) - GEOMETRY_EPSILON ||
    value.x > 1 - width * MINIMUM_VISIBLE_RATIO + GEOMETRY_EPSILON ||
    value.y < -height * (1 - MINIMUM_VISIBLE_RATIO) - GEOMETRY_EPSILON ||
    value.y > 1 - height * MINIMUM_VISIBLE_RATIO + GEOMETRY_EPSILON
  ) {
    return false;
  }
  if (
    typeof value.colorStart !== 'string' ||
    !COLOR_PATTERN.test(value.colorStart) ||
    typeof value.colorEnd !== 'string' ||
    !COLOR_PATTERN.test(value.colorEnd) ||
    typeof value.backgroundColor !== 'string' ||
    !COLOR_PATTERN.test(value.backgroundColor)
  ) {
    return false;
  }
  if (!isNumberInRange(value.backgroundOpacity, 0, 0.8)) return false;
  if (!isNumberInRange(value.opacity, 0.1, 1)) return false;
  return isNumberInRange(value.sensitivity, 0.5, 2);
}

export function isValidEqualizerSegments(
  value: unknown,
  totalDuration: number
): value is EqualizerSegment[] {
  if (!Array.isArray(value) || !isFiniteNumber(totalDuration)) return false;

  const ids = new Set<string>();
  for (const segment of value) {
    if (!isValidEqualizerSettings(segment) || !isRecord(segment)) return false;
    if (
      typeof segment.id !== 'string' ||
      segment.id.length === 0 ||
      segment.id.length > 128 ||
      ids.has(segment.id)
    ) {
      return false;
    }
    if (
      !isFiniteNumber(segment.startTime) ||
      !isFiniteNumber(segment.endTime) ||
      segment.startTime < 0 ||
      segment.endTime <= segment.startTime ||
      segment.endTime > totalDuration + TIMELINE_EPSILON
    ) {
      return false;
    }
    ids.add(segment.id);
  }

  const ordered = [...value].sort((first, second) => {
    return first.startTime - second.startTime;
  });
  return ordered.every((segment, index) => {
    if (index === 0) return true;
    return segment.startTime >= ordered[index - 1].endTime;
  });
}

export function getActiveEqualizerSegment(
  segments: EqualizerSegment[],
  timelineTime: number
): EqualizerSegment | null {
  if (!Number.isFinite(timelineTime)) return null;

  return (
    segments.find(
      segment =>
        timelineTime >= segment.startTime && timelineTime < segment.endTime
    ) ?? null
  );
}

export type LegacyEqualizerSettings = EqualizerSettings & { enabled?: boolean };

export function migrateLegacyEqualizer(
  settings: LegacyEqualizerSettings | undefined,
  totalDuration: number,
  id: string
): EqualizerSegment[] {
  if (!settings || settings.enabled === false || totalDuration <= 0) return [];

  const { enabled: _legacyEnabled, ...restored } = settings;

  return [
    {
      ...DEFAULT_EQUALIZER_SETTINGS,
      ...restored,
      id,
      startTime: 0,
      endTime: totalDuration,
    },
  ];
}
