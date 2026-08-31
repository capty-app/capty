import { EQUALIZER_ANALYSIS_VALUE_SCALE } from '@/types/equalizer';

export const EQUALIZER_ANALYSIS_FRAME_RATE = 24;
export const EQUALIZER_SPECTRUM_BANDS = 24;
export const EQUALIZER_WAVEFORM_POINTS = 32;
export const EQUALIZER_ANALYSIS_HEIGHT = 64;
export const EQUALIZER_ANALYSIS_WIDTH =
  EQUALIZER_SPECTRUM_BANDS + EQUALIZER_WAVEFORM_POINTS;
export const EQUALIZER_RAW_FRAME_SIZE =
  EQUALIZER_ANALYSIS_WIDTH * EQUALIZER_ANALYSIS_HEIGHT;
export const EQUALIZER_VALUES_PER_FRAME =
  EQUALIZER_SPECTRUM_BANDS + EQUALIZER_WAVEFORM_POINTS;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseEqualizerVideoFrame(
  frame: Uint8Array,
  target: Int8Array,
  targetOffset: number
): void {
  for (let band = 0; band < EQUALIZER_SPECTRUM_BANDS; band++) {
    let activePixels = 0;
    for (let y = 0; y < EQUALIZER_ANALYSIS_HEIGHT; y++) {
      if (frame[y * EQUALIZER_ANALYSIS_WIDTH + band] > 0) activePixels++;
    }
    target[targetOffset + band] = Math.round(
      clamp((activePixels - 1) / (EQUALIZER_ANALYSIS_HEIGHT - 1), 0, 1) *
        EQUALIZER_ANALYSIS_VALUE_SCALE
    );
  }

  const waveformOffset = targetOffset + EQUALIZER_SPECTRUM_BANDS;
  const center = (EQUALIZER_ANALYSIS_HEIGHT - 1) / 2;

  for (let point = 0; point < EQUALIZER_WAVEFORM_POINTS; point++) {
    let top = EQUALIZER_ANALYSIS_HEIGHT;
    let bottom = -1;
    let weightedY = 0;
    let weight = 0;
    const x = EQUALIZER_SPECTRUM_BANDS + point;

    for (let y = 0; y < EQUALIZER_ANALYSIS_HEIGHT; y++) {
      const pixel = frame[y * EQUALIZER_ANALYSIS_WIDTH + x];
      if (pixel === 0) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      weightedY += y * pixel;
      weight += pixel;
    }

    if (weight === 0) {
      target[waveformOffset + point] = 0;
      continue;
    }

    const upperAmplitude = Math.max(0, (center - top) / center);
    const lowerAmplitude = Math.max(0, (bottom - center) / center);
    const direction = weightedY / weight <= center ? 1 : -1;
    target[waveformOffset + point] = Math.round(
      direction *
        clamp(Math.max(upperAmplitude, lowerAmplitude), 0, 1) *
        EQUALIZER_ANALYSIS_VALUE_SCALE
    );
  }
}
