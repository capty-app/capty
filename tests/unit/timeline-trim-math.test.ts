import { describe, it, expect } from 'vitest';
import {
  getTrimResizeBounds,
  applyTrimDelta,
  MIN_SOURCE_SEGMENT_DURATION,
} from '@/renderer/components/video-editor/timeline/trim-math';
import type { Segment } from '@/renderer/components/video-editor/types';

function makeSegment(overrides: Partial<Segment> = {}): Segment {
  return {
    id: 'seg-1',
    originalStart: 2,
    originalEnd: 8,
    trimMinStart: 0,
    trimMaxEnd: 10,
    ...overrides,
  };
}

describe('applyTrimDelta', () => {
  it('applies a timeline delta one-to-one at speed 1', () => {
    const segment = makeSegment();
    expect(applyTrimDelta('start', segment, 2, 1)).toBe(3);
    expect(applyTrimDelta('end', segment, 8, -1)).toBe(7);
  });

  it('scales the delta by speed', () => {
    expect(applyTrimDelta('start', makeSegment({ speed: 2 }), 2, 1)).toBe(4);
    expect(applyTrimDelta('start', makeSegment({ speed: 0.5 }), 2, 1)).toBe(
      2.5
    );
  });

  it('clamps the start edge at trimMinStart when extending', () => {
    expect(applyTrimDelta('start', makeSegment(), 2, -5)).toBe(0);
  });

  it('clamps the end edge at trimMaxEnd when extending', () => {
    expect(applyTrimDelta('end', makeSegment(), 8, 5)).toBe(10);
  });

  it('preserves the minimum source duration when shrinking', () => {
    const segment = makeSegment();
    expect(applyTrimDelta('start', segment, 2, 100)).toBe(
      8 - MIN_SOURCE_SEGMENT_DURATION
    );
    expect(applyTrimDelta('end', segment, 8, -100)).toBe(
      2 + MIN_SOURCE_SEGMENT_DURATION
    );
  });
});

describe('getTrimResizeBounds', () => {
  it('bounds the start edge by lead-in and minimum duration at speed 1', () => {
    const bounds = getTrimResizeBounds('start', makeSegment(), 5);
    expect(bounds.min).toBe(3);
    expect(bounds.max).toBe(5 + (8 - MIN_SOURCE_SEGMENT_DURATION - 2));
  });

  it('lets the end edge extend past the current timeline end', () => {
    const bounds = getTrimResizeBounds('end', makeSegment(), 11);
    expect(bounds.max).toBe(13);
    expect(bounds.min).toBe(11 - (8 - (2 + MIN_SOURCE_SEGMENT_DURATION)));
  });

  it('converts the minimum source duration into timeline time per speed', () => {
    const atSpeed = (speed: number) => {
      const segment = makeSegment({
        originalStart: 2,
        originalEnd: 2 + MIN_SOURCE_SEGMENT_DURATION,
        speed,
      });
      const bounds = getTrimResizeBounds('start', segment, 5);
      return bounds.max - 5;
    };
    expect(atSpeed(0.5)).toBe(0);
    expect(atSpeed(1)).toBe(0);
    expect(atSpeed(2)).toBe(0);

    const shrinkable = (speed: number) => {
      const segment = makeSegment({ originalStart: 2, originalEnd: 3, speed });
      const bounds = getTrimResizeBounds('start', segment, 5);
      return bounds.max - 5;
    };
    expect(shrinkable(0.5)).toBe(1);
    expect(shrinkable(1)).toBe(0.5);
    expect(shrinkable(2)).toBe(0.25);
  });

  it('scales the extension range by speed', () => {
    const bounds = getTrimResizeBounds('end', makeSegment({ speed: 2 }), 11);
    expect(bounds.max).toBe(12);
  });
});
