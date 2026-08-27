import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import Playhead from './playhead';
import { useTimeline } from './use-timeline';
import {
  MIN_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
} from './timeline-constants';

const SCRUB_STEP = 1 / 120;
const SCROLL_MARGIN = 100;
const PINCH_ZOOM_SENSITIVITY = 0.01;

interface TimelineTracksProps {
  children: React.ReactNode;
  totalDuration: number;
  minDisplayDuration?: number;
  playheadPosition: number;
  isPlaying: boolean;
  isTrimming: boolean;
  onPreviewSeek?: (tlPos: number | null) => void;
}

const TimelineTracks = forwardRef<HTMLDivElement, TimelineTracksProps>(
  (
    {
      children,
      totalDuration,
      minDisplayDuration,
      playheadPosition,
      isPlaying,
      isTrimming,
      onPreviewSeek,
    },
    ref
  ) => {
    const {
      pixelsPerSecond,
      rulerScrollRef,
      tracksScrollRef,
      verticalScrollRef,
      setZoomLevel,
    } = useTimeline();
    const containerRef = useRef<HTMLDivElement>(null);
    const [isHovering, setIsHovering] = useState(false);
    const lastQuantizedPosRef = useRef<number | null>(null);
    const rafIdRef = useRef<number | null>(null);
    const pendingClientXRef = useRef<number | null>(null);

    const actualRef = (ref as React.RefObject<HTMLDivElement>) || containerRef;
    const totalWidth = totalDuration * pixelsPerSecond;
    const displayDuration = Math.max(totalDuration, minDisplayDuration ?? 0);
    const displayWidth = displayDuration * pixelsPerSecond;

    const computeAndSeek = useCallback(() => {
      if (isPlaying || isTrimming || !isHovering) return;
      if (totalDuration === 0) return;

      const clientX = pendingClientXRef.current;
      if (clientX === null) return;

      const container = actualRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const x = clientX - rect.left + scrollLeft;

      if (x > totalWidth) {
        const endPos = totalDuration - 0.01;
        if (lastQuantizedPosRef.current !== endPos) {
          lastQuantizedPosRef.current = endPos;
          onPreviewSeek?.(endPos);
        }
        return;
      }

      const tlPos = Math.max(0, x / pixelsPerSecond);
      const quantizedPos = Math.floor(tlPos / SCRUB_STEP) * SCRUB_STEP;

      if (lastQuantizedPosRef.current !== quantizedPos) {
        lastQuantizedPosRef.current = quantizedPos;
        onPreviewSeek?.(quantizedPos);
      }
    }, [
      isPlaying,
      isTrimming,
      isHovering,
      totalDuration,
      totalWidth,
      pixelsPerSecond,
      actualRef,
      onPreviewSeek,
    ]);

    const scheduleSeek = useCallback(() => {
      if (rafIdRef.current !== null) return;

      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        computeAndSeek();
      });
    }, [computeAndSeek]);

    const syncScroll = useCallback(
      (scrollLeft: number) => {
        if (rulerScrollRef.current) {
          rulerScrollRef.current.scrollLeft = scrollLeft;
        }
      },
      [rulerScrollRef]
    );

    useEffect(() => {
      tracksScrollRef.current = actualRef.current;
      return () => {
        tracksScrollRef.current = null;
      };
    }, [tracksScrollRef, actualRef]);

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (isPlaying || isTrimming || !isHovering) return;

        pendingClientXRef.current = e.clientX;
        scheduleSeek();
      },
      [isPlaying, isTrimming, isHovering, scheduleSeek]
    );

    const handleMouseEnter = useCallback(() => {
      setIsHovering(true);
      lastQuantizedPosRef.current = null;
    }, []);

    const handleMouseLeave = useCallback(() => {
      setIsHovering(false);
      lastQuantizedPosRef.current = null;
      pendingClientXRef.current = null;
      onPreviewSeek?.(null);

      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    }, [onPreviewSeek]);

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        syncScroll(e.currentTarget.scrollLeft);
      },
      [syncScroll]
    );

    const handleWheel = useCallback(
      (e: React.WheelEvent<HTMLDivElement>) => {
        const container = actualRef.current;
        if (!container) return;

        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const scrollLeft = container.scrollLeft;
          const mouseTimelineX = mouseX + scrollLeft;

          const timeAtMouse = mouseTimelineX / pixelsPerSecond;

          const zoomDelta = -e.deltaY * PINCH_ZOOM_SENSITIVITY;
          const newPixelsPerSecond = Math.max(
            MIN_PIXELS_PER_SECOND,
            Math.min(MAX_PIXELS_PER_SECOND, pixelsPerSecond * (1 + zoomDelta))
          );

          setZoomLevel(newPixelsPerSecond);

          requestAnimationFrame(() => {
            const newMouseTimelineX = timeAtMouse * newPixelsPerSecond;
            const newScrollLeft = Math.max(0, newMouseTimelineX - mouseX);
            container.scrollLeft = newScrollLeft;
            syncScroll(newScrollLeft);
          });
          return;
        }

        const isHorizontalIntent =
          e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);

        if (isHorizontalIntent) {
          const horizontalDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
          if (horizontalDelta === 0) return;

          e.preventDefault();

          const newScrollLeft = Math.max(
            0,
            Math.min(
              container.scrollWidth - container.clientWidth,
              container.scrollLeft + horizontalDelta
            )
          );

          container.scrollLeft = newScrollLeft;
          syncScroll(newScrollLeft);
          return;
        }

        if (e.deltaY === 0) return;

        const verticalContainer = verticalScrollRef.current;
        if (!verticalContainer) return;

        const maxScrollTop =
          verticalContainer.scrollHeight - verticalContainer.clientHeight;
        if (maxScrollTop <= 0) return;

        e.preventDefault();

        verticalContainer.scrollTop = Math.max(
          0,
          Math.min(maxScrollTop, verticalContainer.scrollTop + e.deltaY)
        );
      },
      [actualRef, syncScroll, pixelsPerSecond, setZoomLevel, verticalScrollRef]
    );

    const playheadPixels = (playheadPosition / 100) * totalWidth;

    useEffect(() => {
      if (!isPlaying) return;

      const container = actualRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const scrollLeft = container.scrollLeft;
      const visibleRight = scrollLeft + containerWidth;

      if (playheadPixels > visibleRight - SCROLL_MARGIN) {
        const newScrollLeft = playheadPixels - containerWidth + SCROLL_MARGIN;
        container.scrollLeft = newScrollLeft;
        syncScroll(newScrollLeft);
      }
    }, [isPlaying, playheadPixels, actualRef, syncScroll]);

    return (
      <div
        ref={actualRef}
        className="scrollbar-overlay relative flex w-full flex-col"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        <div
          className="relative flex flex-col"
          style={{ width: `${displayWidth}px`, minWidth: '100%' }}
        >
          {children}

          <Playhead positionPixels={playheadPixels} />
        </div>
      </div>
    );
  }
);

TimelineTracks.displayName = 'TimelineTracks';

export default TimelineTracks;
