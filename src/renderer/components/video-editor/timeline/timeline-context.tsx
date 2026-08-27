import { useRef, useCallback, useMemo } from 'react';
import { TimelineContext } from './timeline-context-value';
import type { UseTimelineZoomReturn } from './use-timeline-zoom';

interface TimelineProviderProps {
  children: React.ReactNode;
  zoom: UseTimelineZoomReturn;
}

export function TimelineProvider({ children, zoom }: TimelineProviderProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
      scrollContainerRef,
      timeToPixels,
      pixelsToTime,
      zoomIn: zoom.zoomIn,
      zoomOut: zoom.zoomOut,
      setZoomLevel: zoom.setZoomLevel,
      resetZoom: zoom.resetZoom,
      canZoomIn: zoom.canZoomIn,
      canZoomOut: zoom.canZoomOut,
    }),
    [zoom, timeToPixels, pixelsToTime]
  );

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}
