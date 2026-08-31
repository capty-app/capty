import { forwardRef, useCallback, useState } from 'react';
import { AudioLines, CopyPlus, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/renderer/components/ui/context-menu';
import type { EqualizerSegment } from '@/types/equalizer';
import { getEqualizerModeLabel } from '../equalizer-modes';
import Track, { type TrackSegment } from './track';
import TrackRow from './track-row';

interface EqualizerTrackProps {
  segments: EqualizerSegment[];
  totalDuration: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onResize: (id: string, startTime: number, endTime: number) => void;
  onMove: (id: string, startTime: number, endTime: number) => void;
  onGestureEnd: () => void;
  onAdd: (startTime: number, endTime: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

const EqualizerTrack = forwardRef<HTMLDivElement, EqualizerTrackProps>(
  (
    {
      segments,
      totalDuration,
      selectedId,
      onSelect,
      onResize,
      onMove,
      onGestureEnd,
      onAdd,
      onDuplicate,
      onDelete,
    },
    ref
  ) => {
    const [contextSegmentId, setContextSegmentId] = useState<string | null>(
      null
    );

    const handleContextMenu = useCallback((event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      const segment = target.closest('[data-segment]');
      setContextSegmentId(segment?.getAttribute('data-segment') ?? null);
    }, []);

    const renderLabel = useCallback(
      (segment: TrackSegment, widthPixels: number) => {
        const equalizer = segment as EqualizerSegment;
        return (
          <span className="flex items-center gap-1.5">
            <AudioLines className="size-3 shrink-0" />
            {widthPixels >= 64 ? 'Equalizer' : null}
            {widthPixels >= 130 ? (
              <span className="font-normal text-white/70">
                {getEqualizerModeLabel(equalizer.mode)}
              </span>
            ) : null}
          </span>
        );
      },
      []
    );

    return (
      <TrackRow>
        <ContextMenu>
          <ContextMenuTrigger
            className="block h-full"
            onContextMenu={handleContextMenu}
          >
            <Track
              ref={ref}
              segments={segments}
              totalDuration={totalDuration}
              selectedId={selectedId}
              isToolActive={true}
              colors="equalizer"
              features={{
                canDraw: true,
                canMove: true,
                emptyText: 'Click or drag to add equalizer',
                renderLabel,
              }}
              onSelect={onSelect}
              onResize={onResize}
              onMove={onMove}
              onGestureEnd={onGestureEnd}
              onAdd={onAdd}
            />
          </ContextMenuTrigger>
          <ContextMenuContent className="w-40">
            {contextSegmentId ? (
              <>
                <ContextMenuItem onClick={() => onDuplicate(contextSegmentId)}>
                  <CopyPlus className="mr-2 size-4" />
                  Duplicate
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onDelete(contextSegmentId)}>
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </ContextMenuItem>
              </>
            ) : (
              <ContextMenuItem disabled>
                Right-click an equalizer clip
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </TrackRow>
    );
  }
);

EqualizerTrack.displayName = 'EqualizerTrack';

export default EqualizerTrack;
