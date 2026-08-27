import { describe, it, expect } from 'vitest';
import {
  getFitToViewPixelsPerSecond,
  getMarkInterval,
} from '@/renderer/components/video-editor/timeline/ruler-scale';
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  TIMELINE_H_PADDING,
} from '@/renderer/components/video-editor/timeline/timeline-constants';

describe('getFitToViewPixelsPerSecond', () => {
  it('accounts for horizontal padding in the fitted width', () => {
    const containerWidth = 1024;
    const displayDuration = 10;
    const pixelsPerSecond = getFitToViewPixelsPerSecond(
      containerWidth,
      displayDuration
    );

    expect(pixelsPerSecond).toBe(100);
    expect(displayDuration * pixelsPerSecond + TIMELINE_H_PADDING * 2).toBe(
      containerWidth
    );
  });

  it('fits the retained display duration instead of the shorter content', () => {
    const containerWidth = 1024;
    const retainedDisplayDuration = 20;
    const pixelsPerSecond = getFitToViewPixelsPerSecond(
      containerWidth,
      retainedDisplayDuration
    );

    expect(pixelsPerSecond).toBe(50);
    expect(
      retainedDisplayDuration * pixelsPerSecond + TIMELINE_H_PADDING * 2
    ).toBe(containerWidth);
  });

  it('clamps to the minimum zoom level', () => {
    expect(getFitToViewPixelsPerSecond(100, 100)).toBe(MIN_PIXELS_PER_SECOND);
  });

  it('clamps to the maximum zoom level', () => {
    expect(getFitToViewPixelsPerSecond(1024, 1)).toBe(MAX_PIXELS_PER_SECOND);
  });

  it('uses the minimum zoom level for non-positive durations', () => {
    expect(getFitToViewPixelsPerSecond(1024, 0)).toBe(MIN_PIXELS_PER_SECOND);
    expect(getFitToViewPixelsPerSecond(1024, -1)).toBe(MIN_PIXELS_PER_SECOND);
  });
});

describe('getMarkInterval', () => {
  it('picks the smallest interval at high zoom', () => {
    expect(getMarkInterval(600)).toBe(0.1);
    expect(getMarkInterval(1000)).toBe(0.1);
  });

  it('picks 0.25 when 0.1 would be too dense', () => {
    expect(getMarkInterval(300)).toBe(0.25);
  });

  it('picks 1 second at the default zoom', () => {
    expect(getMarkInterval(100)).toBe(1);
  });

  it('picks exactly the interval at its threshold', () => {
    expect(getMarkInterval(60)).toBe(1);
    expect(getMarkInterval(120)).toBe(0.5);
  });

  it('scales up through the coarse intervals as zoom decreases', () => {
    expect(getMarkInterval(30)).toBe(2);
    expect(getMarkInterval(10)).toBe(10);
    expect(getMarkInterval(2)).toBe(30);
    expect(getMarkInterval(1)).toBe(60);
  });

  it('falls back to 60 below the minimum zoom', () => {
    expect(getMarkInterval(0.5)).toBe(60);
  });
});
