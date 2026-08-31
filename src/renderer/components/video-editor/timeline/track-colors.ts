export interface TrackColors {
  segment: string;
  segmentSelected: string;
  preview: string;
  cutLine?: string;
  cutBadge?: string;
}

export const SELECTED_SEGMENT_CLASS =
  'ring-2 ring-foreground/90 shadow-[0_0_12px] shadow-foreground/25';

export const TRACK_COLORS: Record<string, TrackColors> = {
  video: {
    segment: 'bg-track-video',
    segmentSelected: 'bg-track-video',
    preview: 'border-2 border-dashed border-track-video/70 bg-track-video/30',
    cutLine: 'bg-border',
    cutBadge: 'border-border bg-secondary text-secondary-foreground border',
  },
  zoom: {
    segment: 'bg-track-zoom',
    segmentSelected: 'bg-track-zoom',
    preview: 'border-2 border-dashed border-track-zoom/70 bg-track-zoom/30',
  },
  music: {
    segment: 'bg-track-music',
    segmentSelected: 'bg-track-music',
    preview: 'border-2 border-dashed border-track-music/70 bg-track-music/30',
  },
  equalizer: {
    segment: 'bg-track-equalizer',
    segmentSelected: 'bg-track-equalizer',
    preview:
      'border-2 border-dashed border-track-equalizer/70 bg-track-equalizer/30',
  },
};

export const DRAW_TRACK_COLORS: TrackColors = {
  segment: 'bg-track-draw',
  segmentSelected: 'bg-track-draw',
  preview: 'border-2 border-dashed border-track-draw/70 bg-track-draw/30',
};

export function getDrawingTrackColors(): TrackColors {
  return DRAW_TRACK_COLORS;
}
