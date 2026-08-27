import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  DEFAULT_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
  ZOOM_STEP,
} from './timeline-constants';

interface UseTimelineZoomOptions {
  initialPixelsPerSecond?: number;
  onZoomChange?: (pixelsPerSecond: number) => void;
}

export interface UseTimelineZoomReturn {
  pixelsPerSecond: number;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoomLevel: (pixels: number) => void;
  resetZoom: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

export function useTimelineZoom(
  options: UseTimelineZoomOptions = {}
): UseTimelineZoomReturn {
  const { initialPixelsPerSecond = DEFAULT_PIXELS_PER_SECOND, onZoomChange } =
    options;

  const [pixelsPerSecond, setPixelsPerSecondState] = useState(
    Math.max(
      MIN_PIXELS_PER_SECOND,
      Math.min(MAX_PIXELS_PER_SECOND, initialPixelsPerSecond)
    )
  );

  useEffect(() => {
    if (
      initialPixelsPerSecond >= MIN_PIXELS_PER_SECOND &&
      initialPixelsPerSecond <= MAX_PIXELS_PER_SECOND
    ) {
      setPixelsPerSecondState(initialPixelsPerSecond);
    }
  }, [initialPixelsPerSecond]);

  const setZoomLevel = useCallback(
    (pixels: number) => {
      const clamped = Math.max(
        MIN_PIXELS_PER_SECOND,
        Math.min(MAX_PIXELS_PER_SECOND, pixels)
      );
      setPixelsPerSecondState(clamped);
      onZoomChange?.(clamped);
    },
    [onZoomChange]
  );

  const zoomIn = useCallback(() => {
    setPixelsPerSecondState(prev => {
      const next = Math.min(MAX_PIXELS_PER_SECOND, prev * ZOOM_STEP);
      onZoomChange?.(next);
      return next;
    });
  }, [onZoomChange]);

  const zoomOut = useCallback(() => {
    setPixelsPerSecondState(prev => {
      const next = Math.max(MIN_PIXELS_PER_SECOND, prev / ZOOM_STEP);
      onZoomChange?.(next);
      return next;
    });
  }, [onZoomChange]);

  const resetZoom = useCallback(() => {
    setPixelsPerSecondState(DEFAULT_PIXELS_PER_SECOND);
    onZoomChange?.(DEFAULT_PIXELS_PER_SECOND);
  }, [onZoomChange]);

  const canZoomIn = useMemo(
    () => pixelsPerSecond < MAX_PIXELS_PER_SECOND,
    [pixelsPerSecond]
  );

  const canZoomOut = useMemo(
    () => pixelsPerSecond > MIN_PIXELS_PER_SECOND,
    [pixelsPerSecond]
  );

  return {
    pixelsPerSecond,
    zoomIn,
    zoomOut,
    setZoomLevel,
    resetZoom,
    canZoomIn,
    canZoomOut,
  };
}
