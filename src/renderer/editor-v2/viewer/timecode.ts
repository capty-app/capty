import { scaleTicks } from '@/editor-v2/time/timebase';
import {
  EDITOR_V2_TICKS_PER_SECOND,
  type Rational,
  type TimelineTick,
} from '@/types/editor-v2';

const pad = (value: number): string => String(value).padStart(2, '0');

export const formatViewerTimecode = (
  tick: TimelineTick,
  frameRate: Rational
): string => {
  const safeTick = Math.max(0, tick);
  const totalSeconds = Math.floor(safeTick / EDITOR_V2_TICKS_PER_SECOND);
  const remainderTicks = safeTick % EDITOR_V2_TICKS_PER_SECOND;
  const frame = scaleTicks(
    remainderTicks,
    {
      numerator: frameRate.numerator,
      denominator: EDITOR_V2_TICKS_PER_SECOND * frameRate.denominator,
    },
    'floor'
  );
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frame)}`;
};
