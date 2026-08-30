export const EDITOR_V2_TICKS_PER_SECOND = 360_000;

export type TimelineTick = number;

export interface Rational {
  numerator: number;
  denominator: number;
}

export interface EditorTimebase {
  ticksPerSecond: typeof EDITOR_V2_TICKS_PER_SECOND;
  displayFrameRate: Rational;
  audioSampleRate: number;
}

export interface TickRange {
  start: TimelineTick;
  end: TimelineTick;
}

export interface SourceTimeMapping {
  timelineRange: TickRange;
  sourceRange: TickRange;
  playbackRate: Rational;
}

export type TickRoundingMode = 'floor' | 'ceil' | 'nearest';
