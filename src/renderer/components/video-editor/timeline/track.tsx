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
  selectOnResize?: boolean;
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
  onGestureStart?: (
    e: React.PointerEvent,
    type: 'move' | 'resize-start' | 'resize-end',
    segmentId: string
  ) => void;
  onGestureEnd?: (type: 'move' | 'resize-start' | 'resize-end') => void;
  onTrackClick?: (time: number) => void;
  onSegmentMouseDown?: (e: React.MouseEvent, segmentId: string) => void;
  getResizeBounds?: (
    segmentId: string,
    edge: 'start' | 'end'
  ) => { min: number; max: number };
}

interface DragState {
  type: 'draw' | 'move' | 'resize-start' | 'resize-end';
  segmentId?: string;
  startX: number;
  startTime: number;
  initialStart?: number;
  initialEnd?: number;
  bounds?: { min: number; max: number };
  wasSelected?: boolean;
}

const MIN_SEGMENT_DURATION = 0.3;
const DEFAULT_SEGMENT_DURATION = 3;
const CLICK_THRESHOLD = 0.1;
const EDGE_HANDLE_PIXELS = 12;

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
      onGestureStart,
      onGestureEnd,
      onTrackClick,
      onSegmentMouseDown,
      getResizeBounds,
    },
    ref
  ) => {
    const { pixelsPerSecond } = useTimeline();
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [previewEnd, setPreviewEnd] = useState<number | null>(null);
    const didDragRef = useRef(false);
    const suppressClickRef = useRef(false);

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
      selectOnResize = true,
    } = features;

    const rawXToTime = useCallback(
      (clientX: number): number => {
        const track = actualRef.current;
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        return (clientX - rect.left) / pixelsPerSecond;
      },
      [actualRef, pixelsPerSecond]
    );

    const xToTime = useCallback(
      (clientX: number): number =>
        Math.max(0, Math.min(totalDuration, rawXToTime(clientX))),
      [rawXToTime, totalDuration]
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

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (e.button !== 0) return;

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
            EDGE_HANDLE_PIXELS / pixelsPerSecond,
            segmentDuration / 3
          );

          if (onResize && time - clickedSegment.startTime < edgeThreshold) {
            setDragState({
              type: 'resize-start',
              segmentId: clickedSegment.id,
              startX: e.clientX,
              startTime: time,
              initialStart: clickedSegment.startTime,
              initialEnd: clickedSegment.endTime,
              bounds: getResizeBounds?.(clickedSegment.id, 'start'),
              wasSelected: clickedSegment.id === selectedId,
            });
            e.currentTarget.setPointerCapture(e.pointerId);
            onGestureStart?.(e, 'resize-start', clickedSegment.id);
            if (selectOnResize && clickedSegment.id !== selectedId) {
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
              bounds: getResizeBounds?.(clickedSegment.id, 'end'),
              wasSelected: clickedSegment.id === selectedId,
            });
            e.currentTarget.setPointerCapture(e.pointerId);
            onGestureStart?.(e, 'resize-end', clickedSegment.id);
            if (selectOnResize && clickedSegment.id !== selectedId) {
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
              wasSelected: clickedSegment.id === selectedId,
            });
            e.currentTarget.setPointerCapture(e.pointerId);
            onGestureStart?.(e, 'move', clickedSegment.id);
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
          e.currentTarget.setPointerCapture(e.pointerId);
          setPreviewEnd(time);
          onSelect(null);
        } else if (onTrackClick && isToolActive) {
          onTrackClick(time);
        }
      },
      [
        xToTime,
        findSegmentAtTime,
        pixelsPerSecond,
        onResize,
        onSelect,
        selectedId,
        selectOnResize,
        canMove,
        isToolActive,
        onMove,
        canDraw,
        onAdd,
        onTrackClick,
        allowTrackClickOnSegments,
        onSegmentMouseDown,
        onGestureStart,
        getResizeBounds,
      ]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!dragState) return;

        const currentTime = xToTime(e.clientX);

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
          const bounds = dragState.bounds;
          const newStart = bounds
            ? Math.max(bounds.min, Math.min(bounds.max, rawXToTime(e.clientX)))
            : Math.max(
                0,
                Math.min(
                  dragState.initialEnd! - MIN_SEGMENT_DURATION,
                  currentTime
                )
              );
          didDragRef.current = true;
          onResize(dragState.segmentId, newStart, dragState.initialEnd!);
        } else if (dragState.type === 'resize-end' && onResize) {
          const bounds = dragState.bounds;
          const newEnd = bounds
            ? Math.max(bounds.min, Math.min(bounds.max, rawXToTime(e.clientX)))
            : Math.min(
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
      [xToTime, rawXToTime, dragState, onMove, onResize, totalDuration]
    );

    const handlePointerUp = useCallback(() => {
      if (!dragState) return;

      const isResize =
        dragState.type === 'resize-start' || dragState.type === 'resize-end';

      if (
        !didDragRef.current &&
        dragState.segmentId &&
        (dragState.type === 'move' || (isResize && selectOnResize))
      ) {
        suppressClickRef.current = true;
        onSelect(dragState.wasSelected ? null : dragState.segmentId);
      }

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
        suppressClickRef.current = false;
      }, 0);
    }, [
      dragState,
      previewEnd,
      totalDuration,
      onAdd,
      onGestureEnd,
      onSelect,
      selectOnResize,
    ]);

    const handleSegmentClick = useCallback(
      (e: React.MouseEvent, segmentId: string) => {
        e.stopPropagation();
        if (didDragRef.current || suppressClickRef.current) return;
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
        className="group/track relative h-full shrink-0 overflow-visible"
        style={{ cursor: getCursor() }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
                'group/seg absolute h-full overflow-hidden rounded-md',
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
                minWidth: '8px',
                cursor: isToolActive && toolCursor ? toolCursor : undefined,
                opacity: isDragging ? 0.4 : undefined,
              }}
              onClick={e => handleSegmentClick(e, segment.id)}
            >
              {renderSegmentOverlay &&
                renderSegmentOverlay(segment, widthPixels, index)}

              {!(isToolActive && toolCursor) && onResize && (
                <>
                  <div className="absolute top-0 left-0 z-20 h-full w-3 cursor-ew-resize">
                    <div
                      className={cn(
                        'absolute top-1/2 left-1 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-black/45 opacity-0 transition-opacity hover:bg-black/70',
                        'group-hover/seg:opacity-100',
                        isSelected && 'opacity-100'
                      )}
                    />
                  </div>
                  <div className="absolute top-0 right-0 z-20 h-full w-3 cursor-ew-resize">
                    <div
                      className={cn(
                        'absolute top-1/2 right-1 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-black/45 opacity-0 transition-opacity hover:bg-black/70',
                        'group-hover/seg:opacity-100',
                        isSelected && 'opacity-100'
                      )}
                    />
                  </div>
                </>
              )}

              {showDuration && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <span className="text-xs font-medium text-white/95">
                    {formatDuration(segment.endTime - segment.startTime)}
                  </span>
                </div>
              )}

              {renderLabel && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <span className="text-xs font-medium text-white/95">
                    {renderLabel(segment, widthPixels)}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {showCutMarkers &&
          colorConfig.cutBadge &&
          segments.map((segment, index) =>
            index < segments.length - 1 ? (
              <div
                key={`cut-${segment.id}`}
                className="pointer-events-none absolute top-0 z-10 flex h-full flex-col items-center"
                style={{
                  left: `${timeToPixels(segment.endTime)}px`,
                  transform: 'translateX(-50%)',
                }}
              >
                <div
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-full',
                    colorConfig.cutBadge
                  )}
                  style={{ marginTop: '-8px' }}
                >
                  <Scissors className="size-2.5" />
                </div>
                <div className={cn('w-px flex-1', colorConfig.cutLine)} />
              </div>
            ) : null
          )}

        {dragState?.type === 'draw' && previewEnd !== null && (
          <div
            className={cn(
              'absolute h-full overflow-hidden rounded-md',
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
            <div className="border-border text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border border-dashed text-xs opacity-0 transition-opacity group-hover/track:opacity-100">
              {isToolActive ? emptyTextActive : emptyText}
            </div>
          )}
      </div>
    );
  }
);

Track.displayName = 'Track';

export default Track;
