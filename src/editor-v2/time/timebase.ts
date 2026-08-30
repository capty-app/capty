import {
  EDITOR_V2_TICKS_PER_SECOND,
  type EditorTimebase,
  type Rational,
  type TickRoundingMode,
  type TimelineTick,
} from '@/types/editor-v2';

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
};

export const isPositiveRational = (value: Rational): boolean =>
  Number.isSafeInteger(value.numerator) &&
  value.numerator > 0 &&
  Number.isSafeInteger(value.denominator) &&
  value.denominator > 0;

export const normalizeRational = (value: Rational): Rational => {
  if (!isPositiveRational(value)) {
    throw new RangeError('Rational values must use positive safe integers');
  }

  const divisor = greatestCommonDivisor(value.numerator, value.denominator);

  return {
    numerator: value.numerator / divisor,
    denominator: value.denominator / divisor,
  };
};

const divide = (
  numerator: number,
  denominator: number,
  rounding: TickRoundingMode
): number => {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError('Tick calculations must use safe integers');
  }

  if (denominator <= 0) {
    throw new RangeError('Tick calculation denominator must be positive');
  }

  switch (rounding) {
    case 'floor':
      return Math.floor(numerator / denominator);
    case 'ceil':
      return Math.ceil(numerator / denominator);
    case 'nearest': {
      const sign = Math.sign(numerator);
      const absoluteNumerator = Math.abs(numerator);
      const quotient = Math.floor(absoluteNumerator / denominator);
      const remainder = absoluteNumerator % denominator;
      const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
      return rounded * sign;
    }
  }
};

export const createEditorTimebase = (
  displayFrameRate: Rational,
  audioSampleRate = 48_000
): EditorTimebase => {
  const normalizedFrameRate = normalizeRational(displayFrameRate);

  if (!Number.isSafeInteger(audioSampleRate) || audioSampleRate <= 0) {
    throw new RangeError('Audio sample rate must be a positive safe integer');
  }

  return {
    ticksPerSecond: EDITOR_V2_TICKS_PER_SECOND,
    displayFrameRate: normalizedFrameRate,
    audioSampleRate,
  };
};

export const ticksForFrames = (
  frameCount: number,
  frameRate: Rational,
  rounding: TickRoundingMode = 'nearest'
): TimelineTick => {
  if (!Number.isSafeInteger(frameCount)) {
    throw new RangeError('Frame count must be a safe integer');
  }

  const normalizedFrameRate = normalizeRational(frameRate);
  const numerator =
    frameCount * EDITOR_V2_TICKS_PER_SECOND * normalizedFrameRate.denominator;

  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError('Frame tick calculation exceeds safe integer range');
  }

  return divide(numerator, normalizedFrameRate.numerator, rounding);
};

export const scaleTicks = (
  ticks: TimelineTick,
  multiplier: Rational,
  rounding: TickRoundingMode = 'nearest'
): TimelineTick => {
  if (!Number.isSafeInteger(ticks)) {
    throw new RangeError('Ticks must be a safe integer');
  }

  const normalizedMultiplier = normalizeRational(multiplier);
  const numerator = ticks * normalizedMultiplier.numerator;

  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError('Scaled tick calculation exceeds safe integer range');
  }

  return divide(numerator, normalizedMultiplier.denominator, rounding);
};

export const ticksToSeconds = (ticks: TimelineTick): number => {
  if (!Number.isSafeInteger(ticks)) {
    throw new RangeError('Ticks must be a safe integer');
  }

  return ticks / EDITOR_V2_TICKS_PER_SECOND;
};
