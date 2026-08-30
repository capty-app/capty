import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import { getCommandTooltip } from '../commands/command-display';
import type { EditorTrack, SerializedCommandBinding } from '@/types/editor-v2';

interface TrackHeaderProps {
  track: EditorTrack;
  tabIndex: number;
  selected: boolean;
  commandBindings: readonly SerializedCommandBinding[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onToggleLock: () => void;
  onToggleOutput: () => void;
  onToggleSolo: () => void;
  onMove: (direction: -1 | 1) => void;
}

export default function TrackHeader({
  track,
  tabIndex,
  selected,
  commandBindings,
  canMoveUp,
  canMoveDown,
  onSelect,
  onNavigate,
  onToggleLock,
  onToggleOutput,
  onToggleSolo,
  onMove,
}: TrackHeaderProps) {
  const outputEnabled = track.kind === 'video' ? track.visible : !track.muted;
  return (
    <div className="border-border bg-card flex h-12 items-center gap-1 border-r border-b px-2">
      <button
        type="button"
        tabIndex={tabIndex}
        data-timeline-track-id={track.id}
        aria-pressed={selected}
        className={`min-w-0 flex-1 truncate rounded text-left text-xs ${selected ? 'font-semibold underline underline-offset-2' : ''}`}
        onClick={onSelect}
        onKeyDown={event => {
          const direction =
            event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : null;
          if (direction === null) return;
          event.preventDefault();
          event.stopPropagation();
          onNavigate(direction);
        }}
      >
        {track.name}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.name}`}
        aria-pressed={track.locked}
        title={getCommandTooltip('track.toggle-lock', commandBindings)}
        onClick={onToggleLock}
      >
        {track.locked ? (
          <Lock className="size-3" />
        ) : (
          <LockOpen className="size-3" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label={`${outputEnabled ? 'Disable' : 'Enable'} ${track.name} output`}
        aria-pressed={outputEnabled}
        title={getCommandTooltip('track.toggle-output', commandBindings)}
        onClick={onToggleOutput}
      >
        {track.kind === 'video' ? (
          outputEnabled ? (
            <Eye className="size-3" />
          ) : (
            <EyeOff className="size-3" />
          )
        ) : outputEnabled ? (
          <Volume2 className="size-3" />
        ) : (
          <VolumeX className="size-3" />
        )}
      </Button>
      {track.kind === 'audio' ? (
        <Button
          variant={track.solo ? 'secondary' : 'ghost'}
          size="icon"
          className="size-6 text-xs"
          aria-label={`${track.solo ? 'Disable' : 'Enable'} solo for ${track.name}`}
          aria-pressed={track.solo}
          onClick={onToggleSolo}
        >
          S
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="size-5"
        aria-label={`Move ${track.name} up`}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
      >
        <ChevronUp className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-5"
        aria-label={`Move ${track.name} down`}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
      >
        <ChevronDown className="size-3" />
      </Button>
    </div>
  );
}
