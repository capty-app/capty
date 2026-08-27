import type { MutableRefObject, RefObject } from 'react';

export interface TimelineContextValue {
  pixelsPerSecond: number;
  rulerScrollRef: RefObject<HTMLDivElement>;
  tracksScrollRef: MutableRefObject<HTMLDivElement | null>;
  verticalScrollRef: RefObject<HTMLDivElement>;
  timeToPixels: (time: number) => number;
  pixelsToTime: (pixels: number) => number;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoomLevel: (pixels: number) => void;
  resetZoom: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}
