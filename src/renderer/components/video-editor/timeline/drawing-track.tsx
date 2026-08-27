import { useCallback } from 'react';
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Hash,
  Highlighter,
  Minus,
  PenLine,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import type { Annotation } from '@/types/editor';
import type { DrawingSegment } from '@/types/drawing';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/renderer/components/ui/context-menu';
import Track, { type TrackSegment } from './track';
import TrackRow from './track-row';
import { getDrawingTrackColors } from './track-colors';

interface DrawingTrackProps {
  segment: DrawingSegment;
  totalDuration: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onResize: (id: string, startTime: number, endTime: number) => void;
  onMove: (id: string, startTime: number, endTime: number) => void;
  onGestureEnd?: () => void;
  onDelete: (id: string) => void;
}

function getAnnotationIcon(annotation: Annotation | undefined) {
  switch (annotation?.type) {
    case 'highlight':
      return Highlighter;
    case 'rectangle':
      return Square;
    case 'circle':
      return Circle;
    case 'line':
      return Minus;
    case 'arrow':
      return ArrowUpRight;
    case 'text':
      return Type;
    case 'number':
      return Hash;
    case 'redact':
      return Eraser;
    case 'pen':
    default:
      return PenLine;
  }
}

function getAnnotationLabel(annotation: Annotation | undefined): string {
  switch (annotation?.type) {
    case 'highlight':
      return 'Highlight';
    case 'rectangle':
      return 'Rectangle';
    case 'circle':
      return 'Circle';
    case 'line':
      return 'Line';
    case 'arrow':
      return 'Arrow';
    case 'text':
      return 'Text';
    case 'number':
      return 'Number';
    case 'redact':
      return 'Redact';
    case 'pen':
    default:
      return 'Pen';
  }
}

export default function DrawingTrack({
  segment,
  totalDuration,
  selectedId,
  onSelect,
  onResize,
  onMove,
  onGestureEnd,
  onDelete,
}: DrawingTrackProps) {
  const segments: TrackSegment[] = [
    {
      id: segment.id,
      startTime: segment.startTime,
      endTime: segment.endTime,
    },
  ];

  const annotation = segment.annotations[0];
  const colors = getDrawingTrackColors();

  const renderLabel = useCallback(
    (_trackSegment: TrackSegment, widthPixels: number) => {
      const Icon = getAnnotationIcon(annotation);

      if (widthPixels < 64) {
        return <Icon className="size-3 shrink-0" />;
      }

      return (
        <span className="inline-flex items-center gap-1.5 truncate px-1">
          <Icon className="size-3 shrink-0" />
          {widthPixels >= 100 && (
            <span className="truncate text-xs">
              {getAnnotationLabel(annotation)}
            </span>
          )}
        </span>
      );
    },
    [annotation]
  );

  const handleDelete = useCallback(() => {
    onDelete(segment.id);
  }, [onDelete, segment.id]);

  return (
    <TrackRow>
      <ContextMenu>
        <ContextMenuTrigger className="block h-full">
          <Track
            segments={segments}
            totalDuration={totalDuration}
            selectedId={selectedId}
            isToolActive={true}
            colors={colors}
            features={{
              canMove: true,
              renderLabel,
            }}
            onSelect={onSelect}
            onResize={onResize}
            onMove={onMove}
            onGestureEnd={onGestureEnd}
          />
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          <ContextMenuItem onClick={handleDelete}>
            <Trash2 className="mr-2 size-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TrackRow>
  );
}
