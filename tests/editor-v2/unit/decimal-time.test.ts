import { describe, expect, it } from 'vitest';

import {
  decimalSecondsToTicks,
  decimalToPositiveRational,
  decimalToRational,
  divideTicksByRate,
} from '@/editor-v2/time/decimal';

import { EDITOR_V2_TICKS_PER_SECOND } from '@/types/editor-v2';

describe('decimal V1 time conversion', () => {
  it.each([
    ['0.0000013888888888888889', 1],
    ['0.000004166666666666667', 2],
    ['-0.000004166666666666667', -2],
    ['1e-3', 360],
    ['1.25', 450_000],
  ])('rounds %s seconds to exact nearest ticks', (seconds, ticks) => {
    expect(decimalSecondsToTicks(seconds)).toBe(ticks);
  });

  it('uses ties away from zero', () => {
    expect(decimalSecondsToTicks('0.0000013888888888888888888888889')).toBe(1);
    expect(decimalSecondsToTicks('-0.0000013888888888888888888888889')).toBe(
      -1
    );
  });

  it('parses exponents without binary floating-point arithmetic', () => {
    expect(decimalToRational('1.25e2')).toEqual({
      numerator: 125n,
      denominator: 1n,
    });
  });

  it('converts supported speeds and divides ticks by rate', () => {
    expect(decimalToPositiveRational(1.25)).toEqual({
      numerator: 125,
      denominator: 100,
    });
    expect(
      divideTicksByRate(EDITOR_V2_TICKS_PER_SECOND, {
        numerator: 5,
        denominator: 4,
      })
    ).toBe(288_000);
  });

  it('rejects invalid and unsafe values', () => {
    expect(() => decimalToRational(Number.NaN)).toThrow();
    expect(() => decimalToPositiveRational(0)).toThrow();
    expect(() => decimalSecondsToTicks('1e100')).toThrow();
  });
});
