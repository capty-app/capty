import type { TickRange, TimelineTick } from '@/types/editor-v2';

export const isValidTickRange = (range: TickRange): boolean =>
  Number.isSafeInteger(range.start) &&
  Number.isSafeInteger(range.end) &&
  range.start >= 0 &&
  range.end > range.start;

export const getTickRangeDuration = (range: TickRange): TimelineTick =>
  range.end - range.start;

export const containsTick = (range: TickRange, tick: TimelineTick): boolean =>
  tick >= range.start && tick < range.end;

export const intersectTickRanges = (
  left: TickRange,
  right: TickRange
): TickRange | null => {
  const start = Math.max(left.start, right.start);
  const end = Math.min(left.end, right.end);

  if (end <= start) {
    return null;
  }

  return { start, end };
};

export const tickRangesOverlap = (left: TickRange, right: TickRange): boolean =>
  intersectTickRanges(left, right) !== null;
