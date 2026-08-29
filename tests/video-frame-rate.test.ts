import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_FRAME_RATE,
  parseVideoFrameRate,
  VIDEO_FRAME_RATES,
} from '@/types/video';

describe('parseVideoFrameRate', () => {
  it.each(VIDEO_FRAME_RATES)('parses the supported %s fps value', frameRate => {
    expect(parseVideoFrameRate(frameRate)).toBe(Number(frameRate));
  });

  it.each([undefined, null, 30, '', '30fps', '29.97', '120'])(
    'falls back for an unsupported value: %s',
    frameRate => {
      expect(parseVideoFrameRate(frameRate)).toBe(DEFAULT_VIDEO_FRAME_RATE);
    }
  );
});
