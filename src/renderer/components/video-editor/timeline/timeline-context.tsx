import { useRef, useCallback, useMemo } from 'react';
import { TimelineContext } from './timeline-context-value';
import type { UseTimelineZoomReturn } from './use-timeline-zoom';

interface TimelineProviderProps {
  children: React.ReactNode;
  zoom: UseTimelineZoomReturn;
  verticalScrollRef: React.RefObject<HTMLDivElement>;
}

export function TimelineProvider({
  children,
  zoom,
  verticalScrollRef,
}: TimelineProviderProps) {
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement | null>(null);

  const timeToPixels = useCallback(
    (time: number): number => time * zoom.pixelsPerSecond,
    [zoom.pixelsPerSecond]
  );

  const pixelsToTime = useCallback(
    (pixels: number): number => pixels / zoom.pixelsPerSecond,
    [zoom.pixelsPerSecond]
  );

  const value = useMemo(
    () => ({
      pixelsPerSecond: zoom.pixelsPerSecond,
      rulerScrollRef,
      tracksScrollRef,
      verticalScrollRef,
      timeToPixels,
      pixelsToTime,
      zoomIn: zoom.zoomIn,
      zoomOut: zoom.zoomOut,
      setZoomLevel: zoom.setZoomLevel,
      resetZoom: zoom.resetZoom,
      canZoomIn: zoom.canZoomIn,
      canZoomOut: zoom.canZoomOut,
    }),
    [zoom, verticalScrollRef, timeToPixels, pixelsToTime]
  );

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}
