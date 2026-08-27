import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  TIMELINE_H_PADDING,
} from './timeline-constants';

const MARK_INTERVALS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
const TARGET_PIXELS_BETWEEN_MARKS = 60;

export function getFitToViewPixelsPerSecond(
  containerWidth: number,
  displayDuration: number
): number {
  if (displayDuration <= 0) return MIN_PIXELS_PER_SECOND;

  const availableWidth = Math.max(0, containerWidth - TIMELINE_H_PADDING * 2);
  const target = availableWidth / displayDuration;
  return Math.max(
    MIN_PIXELS_PER_SECOND,
    Math.min(MAX_PIXELS_PER_SECOND, target)
  );
}

export function getMarkInterval(pixelsPerSecond: number): number {
  const rawInterval = TARGET_PIXELS_BETWEEN_MARKS / pixelsPerSecond;
  for (const interval of MARK_INTERVALS) {
    if (rawInterval <= interval) return interval;
  }
  return 60;
}
