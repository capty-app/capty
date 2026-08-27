import { describe, expect, it } from 'vitest';
import { getAudioSegmentFractions } from '@/renderer/components/video-editor/timeline/audio-peaks';

describe('getAudioSegmentFractions', () => {
  it('maps source times against the original source duration', () => {
    expect(getAudioSegmentFractions(60, 0, 30)).toEqual({
      startFraction: 0,
      endFraction: 0.5,
    });
  });

  it('maps trimmed source ranges', () => {
    expect(getAudioSegmentFractions(60, 15, 45)).toEqual({
      startFraction: 0.25,
      endFraction: 0.75,
    });
  });

  it('clamps ranges to the available source', () => {
    expect(getAudioSegmentFractions(60, -10, 80)).toEqual({
      startFraction: 0,
      endFraction: 1,
    });
  });

  it('rejects empty and invalid ranges', () => {
    expect(getAudioSegmentFractions(0, 0, 10)).toBeNull();
    expect(getAudioSegmentFractions(60, 10, 10)).toBeNull();
    expect(getAudioSegmentFractions(60, 70, 80)).toBeNull();
  });
});
