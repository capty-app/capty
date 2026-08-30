import {
  createEditorTimebase,
  normalizeRational,
  scaleTicks,
  ticksForFrames,
  ticksToSeconds,
} from '@/editor-v2/time/timebase';
import {
  containsTick,
  intersectTickRanges,
  isValidTickRange,
} from '@/editor-v2/time/range';
import { EDITOR_V2_TICKS_PER_SECOND } from '@/types/editor-v2';

describe('editor V2 timebase', () => {
  it.each([
    [{ numerator: 24, denominator: 1 }, 15_000],
    [{ numerator: 25, denominator: 1 }, 14_400],
    [{ numerator: 30, denominator: 1 }, 12_000],
    [{ numerator: 60, denominator: 1 }, 6_000],
    [{ numerator: 24_000, denominator: 1_001 }, 15_015],
    [{ numerator: 30_000, denominator: 1_001 }, 12_012],
    [{ numerator: 60_000, denominator: 1_001 }, 6_006],
  ])('represents one frame at %o exactly', (frameRate, expectedTicks) => {
    expect(ticksForFrames(1, frameRate)).toBe(expectedTicks);
  });

  it('normalizes rationals and creates the fixed project timebase', () => {
    expect(
      normalizeRational({ numerator: 60_000, denominator: 2_002 })
    ).toEqual({ numerator: 30_000, denominator: 1_001 });
    expect(createEditorTimebase({ numerator: 120, denominator: 2 })).toEqual({
      ticksPerSecond: EDITOR_V2_TICKS_PER_SECOND,
      displayFrameRate: { numerator: 60, denominator: 1 },
      audioSampleRate: 48_000,
    });
  });

  it('uses explicit rounding for rational tick scaling', () => {
    const rate = { numerator: 1, denominator: 2 };

    expect(scaleTicks(5, rate, 'floor')).toBe(2);
    expect(scaleTicks(5, rate, 'ceil')).toBe(3);
    expect(scaleTicks(5, rate, 'nearest')).toBe(3);
    expect(scaleTicks(-5, rate, 'nearest')).toBe(-3);
    expect(ticksToSeconds(180_000)).toBe(0.5);
  });

  it('rejects invalid or unsafe values', () => {
    expect(() => normalizeRational({ numerator: 0, denominator: 1 })).toThrow(
      RangeError
    );
    expect(() =>
      ticksForFrames(0.5, { numerator: 60, denominator: 1 })
    ).toThrow(RangeError);
    expect(() =>
      createEditorTimebase({ numerator: 60, denominator: 1 }, 0)
    ).toThrow(RangeError);
  });
});

describe('half-open tick ranges', () => {
  it('contains the start but excludes the end', () => {
    const range = { start: 10, end: 20 };

    expect(isValidTickRange(range)).toBe(true);
    expect(containsTick(range, 10)).toBe(true);
    expect(containsTick(range, 20)).toBe(false);
  });

  it('does not overlap abutting ranges', () => {
    expect(
      intersectTickRanges({ start: 0, end: 10 }, { start: 10, end: 20 })
    ).toBeNull();
    expect(
      intersectTickRanges({ start: 0, end: 11 }, { start: 10, end: 20 })
    ).toEqual({ start: 10, end: 11 });
  });
});
