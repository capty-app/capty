import type { Segment } from '../types';

export const MIN_SOURCE_SEGMENT_DURATION = 0.5;

export interface TrimBounds {
  min: number;
  max: number;
}

export function getTrimResizeBounds(
  edge: 'start' | 'end',
  segment: Segment,
  tlEdge: number
): TrimBounds {
  const speed = segment.speed ?? 1;

  if (edge === 'start') {
    return {
      min: tlEdge - (segment.originalStart - segment.trimMinStart) / speed,
      max:
        tlEdge +
        (segment.originalEnd -
          MIN_SOURCE_SEGMENT_DURATION -
          segment.originalStart) /
          speed,
    };
  }

  return {
    min:
      tlEdge -
      (segment.originalEnd -
        (segment.originalStart + MIN_SOURCE_SEGMENT_DURATION)) /
        speed,
    max: tlEdge + (segment.trimMaxEnd - segment.originalEnd) / speed,
  };
}

export function applyTrimDelta(
  edge: 'start' | 'end',
  segment: Segment,
  initialValue: number,
  deltaTlTime: number
): number {
  const speed = segment.speed ?? 1;
  const candidate = initialValue + deltaTlTime * speed;

  if (edge === 'start') {
    return Math.max(
      segment.trimMinStart,
      Math.min(segment.originalEnd - MIN_SOURCE_SEGMENT_DURATION, candidate)
    );
  }

  return Math.min(
    segment.trimMaxEnd,
    Math.max(segment.originalStart + MIN_SOURCE_SEGMENT_DURATION, candidate)
  );
}
