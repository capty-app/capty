import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import Playhead from './playhead';
import { useTimeline } from './use-timeline';
import { formatTime } from '../utils';
import {
  MIN_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
  TIMELINE_H_PADDING,
  TIMELINE_END_PADDING,
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
    const ghostRef = useRef<HTMLDivElement>(null);
    const ghostChipRef = useRef<HTMLSpanElement>(null);

    const hideGhost = useCallback(() => {
      if (ghostRef.current) ghostRef.current.style.display = 'none';
    }, []);

    const moveGhost = useCallback((positionPixels: number, time: number) => {
      const ghost = ghostRef.current;
      if (!ghost) return;
      ghost.style.display = 'block';
      ghost.style.left = `${positionPixels}px`;
      if (ghostChipRef.current) {
        ghostChipRef.current.textContent = formatTime(time);
      }
    }, []);

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
      const x = clientX - rect.left + scrollLeft - TIMELINE_H_PADDING;

      if (x > totalWidth) {
        const endPos = totalDuration - 0.01;
        moveGhost(TIMELINE_H_PADDING + totalWidth, totalDuration);
        if (lastQuantizedPosRef.current !== endPos) {
          lastQuantizedPosRef.current = endPos;
          onPreviewSeek?.(endPos);
        }
        return;
      }

      const tlPos = Math.max(0, x / pixelsPerSecond);
      const quantizedPos = Math.floor(tlPos / SCRUB_STEP) * SCRUB_STEP;
      moveGhost(TIMELINE_H_PADDING + tlPos * pixelsPerSecond, tlPos);

      if (lastQuantizedPosRef.current !== quantizedPos) {
        lastQuantizedPosRef.current = quantizedPos;
        onPreviewSeek?.(quantizedPos);
      }
    }, [
      moveGhost,
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
      hideGhost();
      onPreviewSeek?.(null);

      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    }, [onPreviewSeek, hideGhost]);

    useEffect(() => {
      if (isPlaying || isTrimming) hideGhost();
    }, [isPlaying, isTrimming, hideGhost]);

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

          const timeAtMouse =
            (mouseTimelineX - TIMELINE_H_PADDING) / pixelsPerSecond;

          const zoomDelta = -e.deltaY * PINCH_ZOOM_SENSITIVITY;
          const newPixelsPerSecond = Math.max(
            MIN_PIXELS_PER_SECOND,
            Math.min(MAX_PIXELS_PER_SECOND, pixelsPerSecond * (1 + zoomDelta))
          );

          setZoomLevel(newPixelsPerSecond);

          requestAnimationFrame(() => {
            const newMouseTimelineX =
              TIMELINE_H_PADDING + timeAtMouse * newPixelsPerSecond;
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
      const playheadX = TIMELINE_H_PADDING + playheadPixels;

      if (playheadX > visibleRight - SCROLL_MARGIN) {
        const newScrollLeft = playheadX - containerWidth + SCROLL_MARGIN;
        container.scrollLeft = newScrollLeft;
        syncScroll(newScrollLeft);
      }
    }, [isPlaying, playheadPixels, actualRef, syncScroll]);

    return (
      <div
        ref={actualRef}
        className="scrollbar-overlay relative flex min-h-full w-full flex-col"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        <div
          className="relative flex flex-col gap-2 pt-4 pb-2"
          style={{
            width: `${displayWidth + TIMELINE_H_PADDING + TIMELINE_END_PADDING}px`,
            minWidth: '100%',
          }}
        >
          {children}

          <div
            ref={ghostRef}
            className="pointer-events-none absolute top-0 bottom-0"
            style={{ display: 'none' }}
          >
            <div className="bg-foreground/20 absolute top-4 bottom-0 left-0 z-10 w-px" />
            <span
              ref={ghostChipRef}
              className="bg-secondary text-secondary-foreground border-border absolute top-0 left-0 z-30 -translate-x-1/2 rounded-md border px-1.5 font-mono text-xs tabular-nums"
            />
          </div>

          <Playhead positionPixels={TIMELINE_H_PADDING + playheadPixels} />
        </div>
      </div>
    );
  }
);

TimelineTracks.displayName = 'TimelineTracks';

export default TimelineTracks;
