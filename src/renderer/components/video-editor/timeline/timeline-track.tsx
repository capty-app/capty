import { useCallback, useMemo, useRef } from 'react';
import { Film } from 'lucide-react';
import Track from './track';
import TrackRow, { VIDEO_TRACK_HEIGHT } from './track-row';
import TrimPin from './trim-pin';
import SegmentWaveform from './segment-waveform';
import { getAudioSegmentFractions } from './audio-peaks';
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
  waveformSrc?: string | null;
  originalDuration?: number;
}

interface TrimGesture {
  segmentId: string;
  edge: 'start' | 'end';
  initialEdgeTime: number;
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
  waveformSrc,
  originalDuration = 0,
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

      if (widthPixels < 90) {
        return <Film className="size-3" />;
      }

      return (
        <span className="inline-flex items-center gap-1.5">
          <Film className="size-3 shrink-0" />
          <span>{formatDuration(segmentDuration)}</span>
          {hasSpeedChange && (
            <span className="rounded bg-black/25 px-1 text-xs font-semibold">
              {formatPlaybackSpeed(speed)}
            </span>
          )}
        </span>
      );
    },
    [segmentMap]
  );

  const renderWaveform = useCallback(
    (trackSegment: { id: string }) => {
      if (!waveformSrc) return null;
      const segment = segmentMap.get(trackSegment.id);
      if (!segment) return null;

      const fractions = getAudioSegmentFractions(
        originalDuration,
        segment.originalStart,
        segment.originalEnd
      );
      if (!fractions) return null;

      return <SegmentWaveform src={waveformSrc} {...fractions} />;
    },
    [segmentMap, waveformSrc, originalDuration]
  );

  const handleGestureStart = useCallback(
    (
      e: React.PointerEvent,
      type: 'move' | 'resize-start' | 'resize-end',
      segmentId: string
    ) => {
      if (type === 'move') return;

      const timelineSegment = timelineSegments.find(
        segment => segment.id === segmentId
      );
      if (!timelineSegment) return;

      const edge = type === 'resize-start' ? 'start' : 'end';
      const initialEdgeTime =
        edge === 'start' ? timelineSegment.startTime : timelineSegment.endTime;
      trimGestureRef.current = { segmentId, edge, initialEdgeTime };
      onTrimStart(e, segmentId, edge);
    },
    [timelineSegments, onTrimStart]
  );

  const handleResize = useCallback(
    (id: string, newStart: number, newEnd: number) => {
      const gesture = trimGestureRef.current;
      if (!gesture || gesture.segmentId !== id) return;

      const reportedEdge = gesture.edge === 'start' ? newStart : newEnd;
      onTrimResize(id, gesture.edge, reportedEdge - gesture.initialEdgeTime);
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

  const trimmedStart =
    segments.length > 0
      ? segments[0].originalStart - segments[0].trimMinStart
      : 0;
  const lastSegment = segments[segments.length - 1];
  const trimmedEnd = lastSegment
    ? lastSegment.trimMaxEnd - lastSegment.originalEnd
    : 0;

  return (
    <TrackRow className="relative" height={VIDEO_TRACK_HEIGHT}>
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
          renderSegmentOverlay: renderWaveform,
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
      {trimmedStart > 0.05 && !reorderState && (
        <TrimPin seconds={trimmedStart} positionPixels={0} edge="start" />
      )}
      {trimmedEnd > 0.05 && !reorderState && (
        <TrimPin
          seconds={trimmedEnd}
          positionPixels={totalDuration * pixelsPerSecond}
          edge="end"
        />
      )}
      {dropIndicatorPixels !== null && (
        <div
          className="bg-primary shadow-primary/60 pointer-events-none absolute top-0 z-30 h-full w-0.5 shadow-[0_0_6px]"
          style={{ left: `${dropIndicatorPixels}px` }}
        />
      )}
    </TrackRow>
  );
}
