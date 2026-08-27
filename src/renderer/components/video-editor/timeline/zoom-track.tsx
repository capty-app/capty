import { forwardRef, useCallback, useState } from 'react';
import { ZoomIn, Trash2, Copy } from 'lucide-react';
import { ZOOM_LEVELS, type ZoomSegment } from '@/types/zoom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/renderer/components/ui/context-menu';
import Track, { type TrackSegment } from './track';
import TrackRow from './track-row';

interface ZoomTrackProps {
  segments: ZoomSegment[];
  totalDuration: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onResize: (id: string, startTime: number, endTime: number) => void;
  onMove: (id: string, startTime: number, endTime: number) => void;
  onGestureEnd?: () => void;
  onAdd: (startTime: number, endTime: number) => void;
  onUpdateZoomLevel: (id: string, zoomLevel: number) => void;
  onDelete: (id: string) => void;
  onApplyToAll: (id: string) => void;
  onDeleteOthers: (id: string) => void;
}

const ZoomTrack = forwardRef<HTMLDivElement, ZoomTrackProps>(
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
      onUpdateZoomLevel,
      onDelete,
      onApplyToAll,
      onDeleteOthers,
    },
    ref
  ) => {
    const [contextSegmentId, setContextSegmentId] = useState<string | null>(
      null
    );

    const contextSegment = segments.find(seg => seg.id === contextSegmentId);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const segmentEl = target.closest('[data-segment]');
      if (segmentEl) {
        const segmentId = segmentEl.getAttribute('data-segment');
        setContextSegmentId(segmentId);
      } else {
        setContextSegmentId(null);
      }
    }, []);

    const handleZoomLevelChange = useCallback(
      (level: number) => {
        if (contextSegmentId) {
          onUpdateZoomLevel(contextSegmentId, level);
        }
      },
      [contextSegmentId, onUpdateZoomLevel]
    );

    const handleDelete = useCallback(() => {
      if (contextSegmentId) {
        onDelete(contextSegmentId);
      }
    }, [contextSegmentId, onDelete]);

    const handleApplyToAll = useCallback(() => {
      if (contextSegmentId) {
        onApplyToAll(contextSegmentId);
      }
    }, [contextSegmentId, onApplyToAll]);

    const handleDeleteOthers = useCallback(() => {
      if (contextSegmentId) {
        onDeleteOthers(contextSegmentId);
      }
    }, [contextSegmentId, onDeleteOthers]);

    const renderLabel = useCallback(
      (segment: TrackSegment, widthPixels: number) => {
        const zoomSeg = segment as ZoomSegment;
        const level = zoomSeg.zoomLevel;
        const formatted =
          level % 1 === 0 ? `${level}x` : `${level.toFixed(1)}x`;
        const showText = widthPixels >= 50;
        return (
          <span className="flex items-center gap-1">
            <ZoomIn className="size-3 shrink-0" />
            {showText && formatted}
          </span>
        );
      },
      []
    );

    return (
      <TrackRow>
        <ContextMenu>
          <ContextMenuTrigger
            onContextMenu={handleContextMenu}
            className="block h-full"
          >
            <Track
              ref={ref}
              segments={segments}
              totalDuration={totalDuration}
              selectedId={selectedId}
              isToolActive={true}
              colors="zoom"
              features={{
                canDraw: true,
                canMove: true,
                emptyText: 'Click or drag to add zoom',
                renderLabel,
              }}
              onSelect={onSelect}
              onResize={onResize}
              onMove={onMove}
              onGestureEnd={onGestureEnd}
              onAdd={onAdd}
            />
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            {contextSegment ? (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <ZoomIn className="mr-2 size-4" />
                    Zoom Level
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-32">
                    {ZOOM_LEVELS.map(({ value, label }) => (
                      <ContextMenuItem
                        key={value}
                        onClick={() => handleZoomLevelChange(value)}
                        className={
                          contextSegment.zoomLevel === value ? 'bg-accent' : ''
                        }
                      >
                        {label}
                        {contextSegment.zoomLevel === value && (
                          <span className="ml-auto text-xs">*</span>
                        )}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={handleApplyToAll}
                  disabled={segments.length <= 1}
                >
                  <Copy className="mr-2 size-4" />
                  Apply zoom to All
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleDelete}>
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={handleDeleteOthers}
                  disabled={segments.length <= 1}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete Others
                </ContextMenuItem>
              </>
            ) : (
              <ContextMenuItem disabled>
                Right-click a zoom segment
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </TrackRow>
    );
  }
);

ZoomTrack.displayName = 'ZoomTrack';

export default ZoomTrack;
