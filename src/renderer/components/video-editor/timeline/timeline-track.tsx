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
  onCut: (cutVideoTime: number) => void;
  onReorder: (segmentId: string, newIndex: number) => void;
  onSeek?: (timelinePosition: number) => void;
}

export default function TimelineTrack({
  segments,
  selectedSegmentId,
  isCutToolActive,
  trimState,
  onSegmentSelect,
  onTrimStart,
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

  const renderOverlay = useCallback(
    (trackSegment: { id: string }) => {
      if (isCutToolActive) return null;

      const segment = segmentMap.get(trackSegment.id);
      if (!segment) return null;

      return (
        <>
          <div
            className="group hover:bg-foreground/10 absolute top-0 left-0 z-20 h-full w-3 cursor-ew-resize bg-transparent transition-colors"
            onMouseDown={e => onTrimStart(e, segment.id, 'start')}
          >
            <div className="bg-foreground/40 group-hover:bg-foreground/70 absolute top-1/2 left-0.5 h-3 w-0.5 -translate-y-1/2 rounded-full" />
          </div>
          <div
            className="group hover:bg-foreground/10 absolute top-0 right-0 z-20 h-full w-3 cursor-ew-resize bg-transparent transition-colors"
            onMouseDown={e => onTrimStart(e, segment.id, 'end')}
          >
            <div className="bg-foreground/40 group-hover:bg-foreground/70 absolute top-1/2 right-0.5 h-3 w-0.5 -translate-y-1/2 rounded-full" />
          </div>
        </>
      );
    },
    [isCutToolActive, onTrimStart, segmentMap]
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
          renderSegmentOverlay: renderOverlay,
          allowTrackClickOnSegments: true,
        }}
        disableTransitions={trimState !== null || reorderState !== null}
        draggingSegmentId={draggingSegmentId}
        onSelect={id => {
          if (trimState || reorderState) return;
          onSegmentSelect(id);
        }}
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
