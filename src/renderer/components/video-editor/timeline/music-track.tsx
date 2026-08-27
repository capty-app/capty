import { useCallback } from 'react';
import { Trash2, Gauge } from 'lucide-react';
import {
  PLAYBACK_SPEED_PRESETS,
  formatPlaybackSpeed,
} from '@/types/playback-speed';
import type { MusicTrack as MusicTrackType } from '@/types/music';
import { SOURCE_ICONS } from '@/types/music';
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
import type { TrackColors } from './track-colors';
import { TRACK_COLORS } from './track-colors';
import { formatDuration } from '../utils';

interface MusicTrackProps {
  track: MusicTrackType;
  totalDuration: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onResize: (id: string, startTime: number, endTime: number) => void;
  onMove: (id: string, startTime: number, endTime: number) => void;
  onGestureEnd?: () => void;
  onSpeedChange: (id: string, speed: number) => void;
  onDelete: (id: string) => void;
}

const DISABLED_COLORS: TrackColors = {
  segment: 'border border-muted-foreground/40 bg-muted-foreground/20',
  segmentSelected: 'border border-muted-foreground/40 bg-muted-foreground/30',
  preview:
    'border-2 border-dashed border-muted-foreground/40 bg-muted-foreground/20',
};

export default function MusicTrack({
  track,
  totalDuration,
  selectedId,
  onSelect,
  onResize,
  onMove,
  onGestureEnd,
  onSpeedChange,
  onDelete,
}: MusicTrackProps) {
  const segments: TrackSegment[] = [
    {
      id: track.id,
      startTime: track.startTime,
      endTime: track.endTime,
    },
  ];

  const Icon = SOURCE_ICONS[track.source];
  const colors = track.enabled ? TRACK_COLORS.music : DISABLED_COLORS;

  const renderLabel = useCallback(
    (_segment: TrackSegment, widthPixels: number) => {
      const hasSpeedChange = track.speed !== 1;
      const duration = track.endTime - track.startTime;

      if (widthPixels < 60) {
        return <Icon className="size-3 shrink-0" />;
      }

      return (
        <span className="inline-flex items-center gap-1.5 truncate px-1">
          <Icon className="size-2.5 shrink-0" />
          {widthPixels >= 100 && (
            <span className="truncate text-xs">{track.name}</span>
          )}
          {widthPixels >= 140 && (
            <span className="text-xs opacity-70">
              {formatDuration(duration)}
            </span>
          )}
          {hasSpeedChange && widthPixels >= 100 && (
            <span className="bg-foreground/10 rounded px-1 py-0.5 text-xs font-medium">
              {formatPlaybackSpeed(track.speed)}
            </span>
          )}
        </span>
      );
    },
    [track.name, track.speed, track.startTime, track.endTime, Icon]
  );

  const handleDelete = useCallback(() => {
    onDelete(track.id);
  }, [onDelete, track.id]);

  const handleSpeedChange = useCallback(
    (speed: number) => {
      onSpeedChange(track.id, speed);
    },
    [onSpeedChange, track.id]
  );

  const isRemovable = track.source === 'music';

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
        <ContextMenuContent className="w-48">
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Gauge className="mr-2 size-4" />
              Speed
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-32">
              {PLAYBACK_SPEED_PRESETS.map(speed => (
                <ContextMenuItem
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={track.speed === speed ? 'bg-accent' : ''}
                >
                  {formatPlaybackSpeed(speed)}
                  {track.speed === speed && (
                    <span className="ml-auto text-xs">*</span>
                  )}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {isRemovable && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleDelete}>
                <Trash2 className="mr-2 size-4" />
                Remove
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </TrackRow>
  );
}
