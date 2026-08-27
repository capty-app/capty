import { useCallback, useMemo, useRef } from 'react';
import { Film } from 'lucide-react';
import Track from './track';
import TrackRow from './track-row';
import type { Segment, TrimState } from '../types';
import { formatPlaybackSpeed } from '@/types/playback-speed';
import {
  formatDuration,
  getSegmentDuration,
  getTimelineStartForSegment,
  timelineToVideo,
  SCISSORS_CURSOR,
} from '../utils';
import { useTimeline } from './use-timeline';
import { useReorderDrag } from '../hooks/use-reorder-drag';
import { getTrimResizeBounds } from './trim-math';

interface TimelineTrackProps {
  segments: Segment[];
  selectedSegmentId: string | null;
  isCutToolActive: boolean;
  trimState: TrimState | null;
  onSegmentSelect: (segmentId: string | null) => void;
  onTrimStart: (
    e: React.MouseEvent,
    segmentId: string,
    edge: 'start' | 'end'
  ) => void;
  onTrimResize: (
    segmentId: string,
    edge: 'start' | 'end',
    deltaTlTime: number
  ) => void;
  onTrimEnd: () => void;
  onCut: (cutVideoTime: number) => void;
  onReorder: (segmentId: string, newIndex: number) => void;
  onSeek?: (timelinePosition: number) => void;
}

interface TrimGesture {
  segmentId: string;
  edge: 'start' | 'end';
  startCursorTime: number;
}

export default function TimelineTrack({
  segments,
  selectedSegmentId,
  isCutToolActive,
  trimState,
  onSegmentSelect,
  onTrimStart,
  onTrimResize,
  onTrimEnd,
  onCut,
  onReorder,
  onSeek,
}: TimelineTrackProps) {
  const { pixelsPerSecond } = useTimeline();

  const timelineSegments = useMemo(
    () =>
      segments.map((segment, index) => {
        const startTime = getTimelineStartForSegment(segments, index);
        const duration = getSegmentDuration(segment);
        return {
          id: segment.id,
          startTime,
          endTime: startTime + duration,
        };
      }),
    [segments]
  );

  const segmentMap = useMemo(() => {
    return new Map(segments.map(segment => [segment.id, segment]));
  }, [segments]);

  const totalDuration =
    timelineSegments.length > 0
      ? timelineSegments[timelineSegments.length - 1].endTime
      : 0;

  const rowRef = useRef<HTMLDivElement>(null);
  const trimGestureRef = useRef<TrimGesture | null>(null);

  const { reorderState, handleReorderMouseDown } = useReorderDrag({
    segments,
    isCutToolActive,
    pixelsPerSecond,
    rowRef,
    onReorder,
  });

  const renderLabel = useCallback(
    (trackSegment: { id: string }, widthPixels: number) => {
      const segment = segmentMap.get(trackSegment.id);
      if (!segment) return null;

      const speed = segment.speed ?? 1;
      const hasSpeedChange = speed !== 1;
      const segmentDuration = getSegmentDuration(segment);

      if (widthPixels < 100) {
        return <Film className="size-3.5" />;
      }

      return (
        <span className="inline-flex items-center gap-2">
          <span>{formatDuration(segmentDuration)}</span>
          {hasSpeedChange && (
            <span className="bg-foreground/10 rounded px-1.5 py-0.5 text-xs font-medium">
              {formatPlaybackSpeed(speed)}
            </span>
          )}
        </span>
      );
    },
    [segmentMap]
  );

  const handleGestureStart = useCallback(
    (
      e: React.PointerEvent,
      type: 'move' | 'resize-start' | 'resize-end',
      segmentId: string
    ) => {
      if (type === 'move') return;

      const row = rowRef.current;
      if (!row) return;

      const edge = type === 'resize-start' ? 'start' : 'end';
      const startCursorTime =
        (e.clientX - row.getBoundingClientRect().left) / pixelsPerSecond;
      trimGestureRef.current = { segmentId, edge, startCursorTime };
      onTrimStart(e, segmentId, edge);
    },
    [pixelsPerSecond, onTrimStart]
  );

  const handleResize = useCallback(
    (id: string, newStart: number, newEnd: number) => {
      const gesture = trimGestureRef.current;
      if (!gesture || gesture.segmentId !== id) return;

      const reportedEdge = gesture.edge === 'start' ? newStart : newEnd;
      onTrimResize(id, gesture.edge, reportedEdge - gesture.startCursorTime);
    },
    [onTrimResize]
  );

  const handleGestureEnd = useCallback(
    (type: 'move' | 'resize-start' | 'resize-end') => {
      if (type === 'move') return;

      trimGestureRef.current = null;
      onTrimEnd();
    },
    [onTrimEnd]
  );

  const getResizeBounds = useCallback(
    (segmentId: string, edge: 'start' | 'end') => {
      const segment = segmentMap.get(segmentId);
      const tlSegment = timelineSegments.find(s => s.id === segmentId);
      if (!segment || !tlSegment) {
        return { min: 0, max: Number.POSITIVE_INFINITY };
      }

      const tlEdge = edge === 'start' ? tlSegment.startTime : tlSegment.endTime;
      return getTrimResizeBounds(edge, segment, tlEdge);
    },
    [segmentMap, timelineSegments]
  );

  const dropIndicatorPixels = useMemo(() => {
    if (!reorderState) return null;

    const { dropIndex, segmentId } = reorderState;
    const currentIndex = segments.findIndex(s => s.id === segmentId);
    if (currentIndex === dropIndex) return null;

    if (dropIndex < currentIndex) {
      return getTimelineStartForSegment(segments, dropIndex) * pixelsPerSecond;
    }

    const endTime = timelineSegments[dropIndex]?.endTime;
    if (endTime === undefined) return null;
    return endTime * pixelsPerSecond;
  }, [reorderState, segments, timelineSegments, pixelsPerSecond]);

  const draggingSegmentId = reorderState?.segmentId ?? null;

  return (
    <TrackRow className="relative">
      <Track
        ref={rowRef}
        segments={timelineSegments}
        totalDuration={totalDuration}
        selectedId={selectedSegmentId}
        isToolActive={isCutToolActive}
        colors="video"
        features={{
          showCutMarkers: !reorderState,
          toolCursor: SCISSORS_CURSOR,
          renderLabel,
          allowTrackClickOnSegments: true,
          selectOnResize: false,
        }}
        disableTransitions={trimState !== null || reorderState !== null}
        draggingSegmentId={draggingSegmentId}
        onSelect={id => {
          if (trimState || reorderState) return;
          onSegmentSelect(id);
        }}
        onResize={handleResize}
        onGestureStart={handleGestureStart}
        onGestureEnd={handleGestureEnd}
        getResizeBounds={getResizeBounds}
        onSegmentMouseDown={handleReorderMouseDown}
        onTrackClick={time => {
          const { videoTime } = timelineToVideo(segments, time);
          onCut(videoTime);
          onSeek?.(time);
        }}
      />
      {dropIndicatorPixels !== null && (
        <div
          className="bg-primary shadow-primary/60 pointer-events-none absolute top-0 z-30 h-full w-0.5 shadow-[0_0_6px]"
          style={{ left: `${dropIndicatorPixels}px` }}
        />
      )}
    </TrackRow>
  );
}
