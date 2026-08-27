import { describe, it, expect } from 'vitest';
import {
  TRACK_COLORS,
  DRAW_TRACK_COLORS,
  SELECTED_SEGMENT_CLASS,
  getDrawingTrackColors,
} from '@/renderer/components/video-editor/timeline/track-colors';

describe('TRACK_COLORS', () => {
  it('defines the three track types', () => {
    expect(Object.keys(TRACK_COLORS)).toEqual(['video', 'zoom', 'music']);
  });

  it('gives every track type non-empty class strings', () => {
    for (const colors of Object.values(TRACK_COLORS)) {
      expect(colors.segment).toBeTruthy();
      expect(colors.segmentSelected).toBeTruthy();
      expect(colors.preview).toBeTruthy();
    }
  });

  it('gives only the video track cut marker classes', () => {
    expect(TRACK_COLORS.video.cutBadge).toBeTruthy();
    expect(TRACK_COLORS.video.cutLine).toBeTruthy();
    expect(TRACK_COLORS.zoom.cutBadge).toBeUndefined();
    expect(TRACK_COLORS.music.cutBadge).toBeUndefined();
  });

  it('fills each track with its own solid hue token', () => {
    for (const [key, colors] of Object.entries(TRACK_COLORS)) {
      expect(colors.segment).toContain(`bg-track-${key}`);
      expect(colors.preview).toContain(`track-${key}`);
    }
  });
});

describe('DRAW_TRACK_COLORS', () => {
  it('uses the single draw hue token', () => {
    expect(DRAW_TRACK_COLORS.segment).toContain('bg-track-draw');
    expect(DRAW_TRACK_COLORS.segmentSelected).toBeTruthy();
    expect(DRAW_TRACK_COLORS.preview).toContain('track-draw');
  });

  it('is returned for every drawing type', () => {
    expect(getDrawingTrackColors()).toBe(DRAW_TRACK_COLORS);
  });
});

describe('SELECTED_SEGMENT_CLASS', () => {
  it('uses the foreground token for ring and glow', () => {
    expect(SELECTED_SEGMENT_CLASS).toContain('ring-foreground');
    expect(SELECTED_SEGMENT_CLASS).toContain('shadow-foreground');
  });
});
