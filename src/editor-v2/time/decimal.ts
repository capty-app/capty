import {
  EDITOR_V2_TICKS_PER_SECOND,
  type Rational,
  type TickRoundingMode,
  type TimelineTick,
} from '@/types/editor-v2';

interface SignedRational {
  numerator: bigint;
  denominator: bigint;
}

const powerOfTen = (exponent: number): bigint => 10n ** BigInt(exponent);

export const decimalToRational = (value: number | string): SignedRational => {
  const source = typeof value === 'number' ? String(value) : value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(source);
  if (!match) throw new RangeError('Value must be a finite decimal');

  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? 0) - fraction.length;
  let numerator = BigInt(`${match[2]}${fraction}` || '0') * sign;
  let denominator = 1n;

  if (exponent >= 0) {
    numerator *= powerOfTen(exponent);
  } else {
    denominator = powerOfTen(-exponent);
  }

  return { numerator, denominator };
};

const divideBigInt = (
  numerator: bigint,
  denominator: bigint,
  rounding: TickRoundingMode
): bigint => {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;

  if (rounding === 'floor') return numerator < 0n ? quotient - 1n : quotient;
  if (rounding === 'ceil') return numerator > 0n ? quotient + 1n : quotient;

  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  if (absoluteRemainder * 2n < denominator) return quotient;
  return numerator < 0n ? quotient - 1n : quotient + 1n;
};

const toSafeInteger = (value: bigint): number => {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) {
    throw new RangeError('Tick calculation exceeds safe integer range');
  }
  return converted;
};

export const decimalSecondsToTicks = (
  value: number | string,
  rounding: TickRoundingMode = 'nearest'
): TimelineTick => {
  const rational = decimalToRational(value);
  return toSafeInteger(
    divideBigInt(
      rational.numerator * BigInt(EDITOR_V2_TICKS_PER_SECOND),
      rational.denominator,
      rounding
    )
  );
};

export const decimalDifferenceToTicks = (
  end: number | string,
  start: number | string,
  multiplier: number | string = 1,
  rounding: TickRoundingMode = 'nearest'
): TimelineTick => {
  const endRational = decimalToRational(end);
  const startRational = decimalToRational(start);
  const multiplierRational = decimalToRational(multiplier);
  const differenceNumerator =
    endRational.numerator * startRational.denominator -
    startRational.numerator * endRational.denominator;
  const differenceDenominator =
    endRational.denominator * startRational.denominator;
  return toSafeInteger(
    divideBigInt(
      differenceNumerator *
        multiplierRational.numerator *
        BigInt(EDITOR_V2_TICKS_PER_SECOND),
      differenceDenominator * multiplierRational.denominator,
      rounding
    )
  );
};

export const decimalToPositiveRational = (value: number | string): Rational => {
  const rational = decimalToRational(value);
  if (rational.numerator <= 0n) {
    throw new RangeError('Rational must be positive');
  }
  return {
    numerator: toSafeInteger(rational.numerator),
    denominator: toSafeInteger(rational.denominator),
  };
};

export const divideTicksByRate = (
  ticks: TimelineTick,
  rate: Rational,
  rounding: TickRoundingMode = 'nearest'
): TimelineTick =>
  toSafeInteger(
    divideBigInt(
      BigInt(ticks) * BigInt(rate.denominator),
      BigInt(rate.numerator),
      rounding
    )
  );
