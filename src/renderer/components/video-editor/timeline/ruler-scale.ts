const MARK_INTERVALS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
const TARGET_PIXELS_BETWEEN_MARKS = 60;

export function getMarkInterval(pixelsPerSecond: number): number {
  const rawInterval = TARGET_PIXELS_BETWEEN_MARKS / pixelsPerSecond;
  for (const interval of MARK_INTERVALS) {
    if (rawInterval <= interval) return interval;
  }
  return 60;
}
