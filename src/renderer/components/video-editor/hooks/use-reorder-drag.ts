import { useState, useCallback, useEffect, useRef } from 'react';
import type { Segment } from '../types';
import { getSegmentDuration, getTimelineStartForSegment } from '../utils';

const DRAG_THRESHOLD = 5;

interface ReorderDragState {
  segmentId: string;
  dropIndex: number;
}

interface UseReorderDragProps {
  segments: Segment[];
  isCutToolActive: boolean;
  pixelsPerSecond: number;
  rowRef: React.RefObject<HTMLElement | null>;
  onReorder: (segmentId: string, newIndex: number) => void;
}

interface UseReorderDragReturn {
  reorderState: ReorderDragState | null;
  handleReorderMouseDown: (e: React.MouseEvent, segmentId: string) => void;
}

export function useReorderDrag({
  segments,
  isCutToolActive,
  pixelsPerSecond,
  rowRef,
  onReorder,
}: UseReorderDragProps): UseReorderDragReturn {
  const [reorderState, setReorderState] = useState<ReorderDragState | null>(
    null
  );
  const segmentsRef = useRef(segments);
  const pixelsPerSecondRef = useRef(pixelsPerSecond);
  const onReorderRef = useRef(onReorder);

  segmentsRef.current = segments;
  pixelsPerSecondRef.current = pixelsPerSecond;
  onReorderRef.current = onReorder;

  const getDropIndex = useCallback(
    (clientX: number, trackEl: HTMLElement, draggedId: string): number => {
      const segs = segmentsRef.current;
      const pps = pixelsPerSecondRef.current;
      const rect = trackEl.getBoundingClientRect();
      const x = clientX - rect.left;
      const cursorTime = x / pps;

      const draggedIndex = segs.findIndex(s => s.id === draggedId);

      for (let i = 0; i < segs.length; i++) {
        const segStart = getTimelineStartForSegment(segs, i);
        const segDuration = getSegmentDuration(segs[i]);
        const segMid = segStart + segDuration / 2;

        if (cursorTime < segMid) {
          if (i === draggedIndex) return draggedIndex;
          return i > draggedIndex ? i - 1 : i;
        }
      }

      if (draggedIndex === segs.length - 1) return draggedIndex;
      return segs.length - 1;
    },
    []
  );

  const handleReorderMouseDown = useCallback(
    (e: React.MouseEvent, segmentId: string) => {
      if (isCutToolActive) return;
      if (segments.length <= 1) return;

      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;

      const suppressClick = (clickEvent: MouseEvent) => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = Math.abs(moveEvent.clientX - startX);
        const dy = Math.abs(moveEvent.clientY - startY);

        if (!isDragging) {
          if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;

          isDragging = true;
          document.addEventListener('click', suppressClick, true);
          const currentIndex = segmentsRef.current.findIndex(
            s => s.id === segmentId
          );
          setReorderState({ segmentId, dropIndex: currentIndex });
          return;
        }

        if (!rowRef.current) return;

        const dropIndex = getDropIndex(
          moveEvent.clientX,
          rowRef.current,
          segmentId
        );
        setReorderState(prev =>
          prev && prev.dropIndex !== dropIndex ? { ...prev, dropIndex } : prev
        );
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        if (!isDragging) return;

        setTimeout(() => {
          document.removeEventListener('click', suppressClick, true);
        }, 0);

        setReorderState(prev => {
          if (!prev) return null;
          const currentIndex = segmentsRef.current.findIndex(
            s => s.id === prev.segmentId
          );
          if (currentIndex !== prev.dropIndex) {
            onReorderRef.current(prev.segmentId, prev.dropIndex);
          }
          return null;
        });
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [isCutToolActive, segments.length, getDropIndex, rowRef]
  );

  useEffect(() => {
    return () => {
      setReorderState(null);
    };
  }, []);

  return {
    reorderState,
    handleReorderMouseDown,
  };
}
