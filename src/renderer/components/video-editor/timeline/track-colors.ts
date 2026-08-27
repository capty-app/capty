export interface TrackColors {
  segment: string;
  segmentSelected: string;
  preview: string;
  cutLine?: string;
  cutBadge?: string;
}

export const SELECTED_SEGMENT_CLASS =
  'ring-1 ring-primary shadow-[0_0_8px] shadow-primary/40';

export const TRACK_COLORS: Record<string, TrackColors> = {
  video: {
    segment: 'border border-track-video/50 bg-track-video/25',
    segmentSelected: 'border border-track-video/50 bg-track-video/35',
    preview: 'border-2 border-dashed border-track-video/60 bg-track-video/25',
    cutLine: 'bg-track-video/60',
    cutBadge: 'bg-track-video',
  },
  zoom: {
    segment: 'border border-track-zoom/50 bg-track-zoom/25',
    segmentSelected: 'border border-track-zoom/50 bg-track-zoom/35',
    preview: 'border-2 border-dashed border-track-zoom/60 bg-track-zoom/25',
  },
  music: {
    segment: 'border border-track-music/50 bg-track-music/25',
    segmentSelected: 'border border-track-music/50 bg-track-music/35',
    preview: 'border-2 border-dashed border-track-music/60 bg-track-music/25',
  },
};

export const DRAWING_TRACK_COLORS: Record<string, TrackColors> = {
  pen: {
    segment: 'border border-track-draw-pen/50 bg-track-draw-pen/25',
    segmentSelected: 'border border-track-draw-pen/50 bg-track-draw-pen/35',
    preview:
      'border-2 border-dashed border-track-draw-pen/60 bg-track-draw-pen/25',
  },
  highlight: {
    segment: 'border border-track-draw-highlight/50 bg-track-draw-highlight/25',
    segmentSelected:
      'border border-track-draw-highlight/50 bg-track-draw-highlight/35',
    preview:
      'border-2 border-dashed border-track-draw-highlight/60 bg-track-draw-highlight/25',
  },
  rectangle: {
    segment: 'border border-track-draw-rectangle/50 bg-track-draw-rectangle/25',
    segmentSelected:
      'border border-track-draw-rectangle/50 bg-track-draw-rectangle/35',
    preview:
      'border-2 border-dashed border-track-draw-rectangle/60 bg-track-draw-rectangle/25',
  },
  circle: {
    segment: 'border border-track-draw-circle/50 bg-track-draw-circle/25',
    segmentSelected:
      'border border-track-draw-circle/50 bg-track-draw-circle/35',
    preview:
      'border-2 border-dashed border-track-draw-circle/60 bg-track-draw-circle/25',
  },
  line: {
    segment: 'border border-track-draw-line/50 bg-track-draw-line/25',
    segmentSelected: 'border border-track-draw-line/50 bg-track-draw-line/35',
    preview:
      'border-2 border-dashed border-track-draw-line/60 bg-track-draw-line/25',
  },
  arrow: {
    segment: 'border border-track-draw-arrow/50 bg-track-draw-arrow/25',
    segmentSelected: 'border border-track-draw-arrow/50 bg-track-draw-arrow/35',
    preview:
      'border-2 border-dashed border-track-draw-arrow/60 bg-track-draw-arrow/25',
  },
  text: {
    segment: 'border border-track-draw-text/50 bg-track-draw-text/25',
    segmentSelected: 'border border-track-draw-text/50 bg-track-draw-text/35',
    preview:
      'border-2 border-dashed border-track-draw-text/60 bg-track-draw-text/25',
  },
  number: {
    segment: 'border border-track-draw-number/50 bg-track-draw-number/25',
    segmentSelected:
      'border border-track-draw-number/50 bg-track-draw-number/35',
    preview:
      'border-2 border-dashed border-track-draw-number/60 bg-track-draw-number/25',
  },
  redact: {
    segment: 'border border-track-draw-redact/50 bg-track-draw-redact/25',
    segmentSelected:
      'border border-track-draw-redact/50 bg-track-draw-redact/35',
    preview:
      'border-2 border-dashed border-track-draw-redact/60 bg-track-draw-redact/25',
  },
};

export function getDrawingTrackColors(type: string | undefined): TrackColors {
  if (type && type in DRAWING_TRACK_COLORS) {
    return DRAWING_TRACK_COLORS[type];
  }
  return DRAWING_TRACK_COLORS.pen;
}
