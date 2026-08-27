import { forwardRef, useState, useCallback, useRef } from 'react';
import { Scissors } from 'lucide-react';
import Playhead from './playhead';
import { useTimeline } from './use-timeline';
import {
  TRACK_COLORS,
  SELECTED_SEGMENT_CLASS,
  type TrackColors,
} from './track-colors';
import { formatDuration } from '../utils';
import { cn } from '@/renderer/lib/utils';

export interface TrackSegment {
  id: string;
  startTime: number;
  endTime: number;
}

export interface TrackFeatures {
  showDuration?: boolean;
  showCutMarkers?: boolean;
  showPlayhead?: boolean;
  canDraw?: boolean;
  canMove?: boolean;
  toolCursor?: string;
  emptyText?: string;
  emptyTextActive?: string;
  renderLabel?: (segment: TrackSegment, widthPixels: number) => React.ReactNode;
  renderSegmentOverlay?: (
    segment: TrackSegment,
    widthPixels: number,
    index: number
  ) => React.ReactNode;
  allowTrackClickOnSegments?: boolean;
}

interface TrackProps {
  segments: TrackSegment[];
  totalDuration: number;
  selectedId: string | null;
  isToolActive?: boolean;
  colors: keyof typeof TRACK_COLORS | TrackColors;
  features?: TrackFeatures;
  playheadPosition?: number;
  disableTransitions?: boolean;
  draggingSegmentId?: string | null;
  onSelect: (id: string | null) => void;
  onResize?: (id: string, startTime: number, endTime: number) => void;
  onMove?: (id: string, startTime: number, endTime: number) => void;
  onAdd?: (startTime: number, endTime: number) => void;
  onGestureEnd?: (type: 'move' | 'resize-start' | 'resize-end') => void;
  onTrackClick?: (time: number) => void;
  onTrackHover?: (time: number) => void;
  onSegmentMouseDown?: (e: React.MouseEvent, segmentId: string) => void;
}

interface DragState {
  type: 'draw' | 'move' | 'resize-start' | 'resize-end';
  segmentId?: string;
  startX: number;
  startTime: number;
  initialStart?: number;
  initialEnd?: number;
}

const MIN_SEGMENT_DURATION = 0.3;
const DEFAULT_SEGMENT_DURATION = 3;
const CLICK_THRESHOLD = 0.1;
const EDGE_RESIZE_RATIO = 0.15;
const MAX_EDGE_THRESHOLD = 0.3;

const Track = forwardRef<HTMLDivElement, TrackProps>(
  (
    {
      segments,
      totalDuration,
      selectedId,
      isToolActive = false,
      colors,
      features = {},
      playheadPosition,
      disableTransitions = false,
      draggingSegmentId,
      onSelect,
      onResize,
      onMove,
      onAdd,
      onGestureEnd,
      onTrackClick,
      onTrackHover,
      onSegmentMouseDown,
    },
    ref
  ) => {
    const { pixelsPerSecond } = useTimeline();
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [previewEnd, setPreviewEnd] = useState<number | null>(null);
    const [isHovering, setIsHovering] = useState(false);
    const lastHoverTimeRef = useRef<number | null>(null);
    const didDragRef = useRef(false);

    const actualRef = (ref as React.RefObject<HTMLDivElement>) || trackRef;

    const colorConfig =
      typeof colors === 'string' ? TRACK_COLORS[colors] : colors;

    const {
      showDuration = false,
      showCutMarkers = false,
      showPlayhead = false,
      canDraw = false,
      canMove = false,
      toolCursor,
      emptyText,
      emptyTextActive,
      renderLabel,
      renderSegmentOverlay,
      allowTrackClickOnSegments = false,
    } = features;

    const xToTime = useCallback(
      (clientX: number): number => {
        const track = actualRef.current;
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        const x = clientX - rect.left;
        return Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
      },
      [actualRef, pixelsPerSecond, totalDuration]
    );

    const timeToPixels = useCallback(
      (time: number): number => time * pixelsPerSecond,
      [pixelsPerSecond]
    );

    const findSegmentAtTime = useCallback(
      (time: number): TrackSegment | undefined => {
        return segments.find(
          seg => time >= seg.startTime && time <= seg.endTime
        );
      },
      [segments]
    );

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        const time = xToTime(e.clientX);
        const clickedSegment = findSegmentAtTime(time);

        if (isToolActive && onTrackClick) {
          if (allowTrackClickOnSegments || !clickedSegment) {
            onTrackClick(time);
            return;
          }
        }

        if (clickedSegment) {
          const segmentDuration =
            clickedSegment.endTime - clickedSegment.startTime;
          const edgeThreshold = Math.min(
            segmentDuration * EDGE_RESIZE_RATIO,
            MAX_EDGE_THRESHOLD
          );

          if (onResize && time - clickedSegment.startTime < edgeThreshold) {
            setDragState({
              type: 'resize-start',
              segmentId: clickedSegment.id,
              startX: e.clientX,
              startTime: time,
              initialStart: clickedSegment.startTime,
              initialEnd: clickedSegment.endTime,
            });
            if (clickedSegment.id !== selectedId) {
              onSelect(clickedSegment.id);
            }
            return;
          }

          if (onResize && clickedSegment.endTime - time < edgeThreshold) {
            setDragState({
              type: 'resize-end',
              segmentId: clickedSegment.id,
              startX: e.clientX,
              startTime: time,
              initialStart: clickedSegment.startTime,
              initialEnd: clickedSegment.endTime,
            });
            if (clickedSegment.id !== selectedId) {
              onSelect(clickedSegment.id);
            }
            return;
          }

          if (canMove && isToolActive && onMove) {
            setDragState({
              type: 'move',
              segmentId: clickedSegment.id,
              startX: e.clientX,
              startTime: time,
              initialStart: clickedSegment.startTime,
              initialEnd: clickedSegment.endTime,
            });
            return;
          }

          if (onSegmentMouseDown) {
            onSegmentMouseDown(e, clickedSegment.id);
            return;
          }
        } else if (canDraw && isToolActive && onAdd) {
          setDragState({
            type: 'draw',
            startX: e.clientX,
            startTime: time,
          });
          setPreviewEnd(time);
          onSelect(null);
        } else if (onTrackClick && isToolActive) {
          onTrackClick(time);
        }
      },
      [
        xToTime,
        findSegmentAtTime,
        onResize,
        onSelect,
        selectedId,
        canMove,
        isToolActive,
        onMove,
        canDraw,
        onAdd,
        onTrackClick,
        allowTrackClickOnSegments,
        onSegmentMouseDown,
      ]
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        const currentTime = xToTime(e.clientX);

        if (!dragState && isHovering && onTrackHover && !isToolActive) {
          if (lastHoverTimeRef.current !== currentTime) {
            lastHoverTimeRef.current = currentTime;
            onTrackHover(currentTime);
          }
          return;
        }

        if (!dragState) return;

        if (dragState.type === 'draw') {
          setPreviewEnd(currentTime);
          return;
        }

        if (!dragState.segmentId) return;

        const duration = dragState.initialEnd! - dragState.initialStart!;

        if (dragState.type === 'move' && onMove) {
          const deltaTime = currentTime - dragState.startTime;
          let newStart = dragState.initialStart! + deltaTime;
          let newEnd = dragState.initialEnd! + deltaTime;

          if (newStart < 0) {
            newStart = 0;
            newEnd = duration;
          }
          if (newEnd > totalDuration) {
            newEnd = totalDuration;
            newStart = totalDuration - duration;
          }

          if (Math.abs(deltaTime) > 0.01) {
            didDragRef.current = true;
          }

          onMove(dragState.segmentId, newStart, newEnd);
        } else if (dragState.type === 'resize-start' && onResize) {
          const newStart = Math.max(
            0,
            Math.min(dragState.initialEnd! - MIN_SEGMENT_DURATION, currentTime)
          );
          didDragRef.current = true;
          onResize(dragState.segmentId, newStart, dragState.initialEnd!);
        } else if (dragState.type === 'resize-end' && onResize) {
          const newEnd = Math.min(
            totalDuration,
            Math.max(
              dragState.initialStart! + MIN_SEGMENT_DURATION,
              currentTime
            )
          );
          didDragRef.current = true;
          onResize(dragState.segmentId, dragState.initialStart!, newEnd);
        }
      },
      [
        xToTime,
        dragState,
        isHovering,
        onTrackHover,
        isToolActive,
        onMove,
        onResize,
        totalDuration,
      ]
    );

    const handleMouseUp = useCallback(() => {
      if (!dragState) return;

      if (
        onGestureEnd &&
        (dragState.type === 'move' ||
          dragState.type === 'resize-start' ||
          dragState.type === 'resize-end')
      ) {
        onGestureEnd(dragState.type);
      }

      if (dragState.type === 'draw' && onAdd) {
        const startTime = dragState.startTime;
        const endTime = previewEnd ?? startTime;
        const wasClick = Math.abs(endTime - startTime) < CLICK_THRESHOLD;

        if (wasClick) {
          const segmentEnd = Math.min(
            startTime + DEFAULT_SEGMENT_DURATION,
            totalDuration
          );
          onAdd(startTime, segmentEnd);
        } else {
          const actualStart = Math.min(startTime, endTime);
          const actualEnd = Math.max(startTime, endTime);
          if (actualEnd - actualStart >= MIN_SEGMENT_DURATION) {
            onAdd(actualStart, actualEnd);
          }
        }
      }

      setDragState(null);
      setPreviewEnd(null);
      setTimeout(() => {
        didDragRef.current = false;
      }, 0);
    }, [dragState, previewEnd, totalDuration, onAdd, onGestureEnd]);

    const handleSegmentClick = useCallback(
      (e: React.MouseEvent, segmentId: string) => {
        e.stopPropagation();
        if (didDragRef.current) return;
        onSelect(segmentId === selectedId ? null : segmentId);
      },
      [onSelect, selectedId]
    );

    const getCursor = (): string | undefined => {
      if (isToolActive && toolCursor) return toolCursor;
      if (dragState?.type === 'move') return 'grabbing';
      if (
        dragState?.type === 'resize-start' ||
        dragState?.type === 'resize-end'
      ) {
        return 'ew-resize';
      }
      if (canDraw && isToolActive) return 'crosshair';
      return undefined;
    };

    const playheadPixels =
      playheadPosition !== undefined
        ? (playheadPosition / 100) * totalDuration * pixelsPerSecond
        : 0;

    return (
      <div
        ref={actualRef}
        className="relative h-full shrink-0 overflow-visible"
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setIsHovering(false);
          lastHoverTimeRef.current = null;
        }}
        onMouseEnter={() => setIsHovering(true)}
      >
        {segments.map((segment, index) => {
          const GAP = 2;
          const prevSegment = index > 0 ? segments[index - 1] : null;
          const isAdjacent =
            prevSegment &&
            Math.abs(segment.startTime - prevSegment.endTime) < 0.01;
          const rawWidth = timeToPixels(segment.endTime - segment.startTime);
          const gapOffset = isAdjacent && rawWidth > GAP ? GAP : 0;
          const leftPixels = timeToPixels(segment.startTime) + gapOffset;
          const widthPixels = Math.max(2, rawWidth - gapOffset);
          const isSelected = segment.id === selectedId;
          const isDragging = segment.id === draggingSegmentId;

          return (
            <div
              key={segment.id}
              data-segment={segment.id}
              className={cn(
                'absolute h-full overflow-hidden rounded',
                isSelected
                  ? cn(colorConfig.segmentSelected, SELECTED_SEGMENT_CLASS)
                  : colorConfig.segment,
                dragState || disableTransitions ? '' : 'transition-all',
                isToolActive && toolCursor
                  ? 'cursor-crosshair'
                  : 'cursor-default'
              )}
              style={{
                left: `${leftPixels}px`,
                width: `${widthPixels}px`,
                minWidth: '4px',
                cursor: isToolActive && toolCursor ? toolCursor : undefined,
                opacity: isDragging ? 0.4 : undefined,
              }}
              onClick={e => handleSegmentClick(e, segment.id)}
            >
              {!(isToolActive && toolCursor) && onResize && (
                <>
                  <div className="group hover:bg-foreground/10 absolute top-0 left-0 z-20 h-full w-3 cursor-ew-resize bg-transparent transition-colors">
                    <div className="bg-foreground/40 group-hover:bg-foreground/70 absolute top-1/2 left-0.5 h-3 w-0.5 -translate-y-1/2 rounded-full" />
                  </div>
                  <div className="group hover:bg-foreground/10 absolute top-0 right-0 z-20 h-full w-3 cursor-ew-resize bg-transparent transition-colors">
                    <div className="bg-foreground/40 group-hover:bg-foreground/70 absolute top-1/2 right-0.5 h-3 w-0.5 -translate-y-1/2 rounded-full" />
                  </div>
                </>
              )}

              {renderSegmentOverlay &&
                renderSegmentOverlay(segment, widthPixels, index)}

              {showDuration && (
                <div className="absolute bottom-3 left-0 flex w-full items-center justify-center">
                  <span className="text-foreground/90 text-xs font-medium">
                    {formatDuration(segment.endTime - segment.startTime)}
                  </span>
                </div>
              )}

              {renderLabel && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-foreground/90 text-xs font-medium">
                    {renderLabel(segment, widthPixels)}
                  </span>
                </div>
              )}

              {showCutMarkers &&
                colorConfig.cutBadge &&
                index < segments.length - 1 && (
                  <div
                    className="absolute top-0 -right-3 z-10 flex h-full w-6 items-start justify-center"
                    style={{ transform: 'translateX(50%)' }}
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'text-primary-foreground flex size-4 items-center justify-center rounded-full',
                          colorConfig.cutBadge
                        )}
                        style={{ marginTop: '-8px' }}
                      >
                        <Scissors className="size-2.5" />
                      </div>
                      <div className={cn('h-full w-px', colorConfig.cutLine)} />
                    </div>
                  </div>
                )}
            </div>
          );
        })}

        {dragState?.type === 'draw' && previewEnd !== null && (
          <div
            className={cn(
              'absolute h-full overflow-hidden rounded',
              colorConfig.preview
            )}
            style={{
              left: `${timeToPixels(Math.min(dragState.startTime, previewEnd))}px`,
              width: `${timeToPixels(Math.abs(previewEnd - dragState.startTime))}px`,
              minWidth: '2px',
            }}
          />
        )}

        {showPlayhead && playheadPosition !== undefined && (
          <Playhead positionPixels={playheadPixels} />
        )}

        {segments.length === 0 &&
          !dragState &&
          (emptyText || emptyTextActive) && (
            <div className="text-muted-foreground/70 pointer-events-none absolute inset-0 flex items-center justify-center text-xs">
              {isToolActive ? emptyTextActive : emptyText}
            </div>
          )}
      </div>
    );
  }
);

Track.displayName = 'Track';

export default Track;
