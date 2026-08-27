import { describe, it, expect } from 'vitest';
import {
  TRACK_COLORS,
  DRAWING_TRACK_COLORS,
  SELECTED_SEGMENT_CLASS,
  getDrawingTrackColors,
} from '@/renderer/components/video-editor/timeline/track-colors';

const DRAWING_TYPES = [
  'pen',
  'highlight',
  'rectangle',
  'circle',
  'line',
  'arrow',
  'text',
  'number',
  'redact',
];

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

  it('references its own hue token in every class string', () => {
    for (const [key, colors] of Object.entries(TRACK_COLORS)) {
      expect(colors.segment).toContain(`track-${key}`);
      expect(colors.segmentSelected).toContain(`track-${key}`);
      expect(colors.preview).toContain(`track-${key}`);
    }
  });
});

describe('DRAWING_TRACK_COLORS', () => {
  it('defines all nine drawing types', () => {
    expect(Object.keys(DRAWING_TRACK_COLORS)).toEqual(DRAWING_TYPES);
  });

  it('references its own hue token in every class string', () => {
    for (const [key, colors] of Object.entries(DRAWING_TRACK_COLORS)) {
      expect(colors.segment).toContain(`track-draw-${key}`);
      expect(colors.segmentSelected).toContain(`track-draw-${key}`);
      expect(colors.preview).toContain(`track-draw-${key}`);
    }
  });
});

describe('getDrawingTrackColors', () => {
  it('returns the matching entry for a known type', () => {
    expect(getDrawingTrackColors('rectangle')).toBe(
      DRAWING_TRACK_COLORS.rectangle
    );
  });

  it('falls back to pen for unknown or missing types', () => {
    expect(getDrawingTrackColors(undefined)).toBe(DRAWING_TRACK_COLORS.pen);
    expect(getDrawingTrackColors('unknown')).toBe(DRAWING_TRACK_COLORS.pen);
  });
});

describe('SELECTED_SEGMENT_CLASS', () => {
  it('uses the primary token for ring and glow', () => {
    expect(SELECTED_SEGMENT_CLASS).toContain('ring-primary');
    expect(SELECTED_SEGMENT_CLASS).toContain('shadow-primary');
  });
});
