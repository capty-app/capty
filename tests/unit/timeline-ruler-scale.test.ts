import { describe, it, expect } from 'vitest';
import { getMarkInterval } from '@/renderer/components/video-editor/timeline/ruler-scale';

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
