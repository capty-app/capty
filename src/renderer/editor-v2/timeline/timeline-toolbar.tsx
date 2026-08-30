import React from 'react';
import {
  ChevronsLeftRight,
  Film,
  Magnet,
  Minus,
  Music,
  Plus,
  Scissors,
  Trash2,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';

interface TimelineToolbarProps {
  canPlace: boolean;
  canEditClips: boolean;
  hasSelection: boolean;
  snappingEnabled: boolean;
  rippleEnabled: boolean;
  scrubAudioEnabled: boolean;
  canEditTransition: boolean;
  onAddTrack: (kind: 'video' | 'audio') => void;
  onPlace: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onToggleSnapping: () => void;
  onToggleRipple: () => void;
  onToggleScrubAudio: () => void;
  onCreateTransition: (
    type: 'video-cross-dissolve' | 'audio-crossfade'
  ) => void;
  onCreateFade: (edge: 'in' | 'out') => void;
  onChangeTransitionDuration: (direction: -1 | 1) => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomIn: () => void;
  onCollapse: () => void;
}

export default function TimelineToolbar({
  canPlace,
  canEditClips,
  hasSelection,
  snappingEnabled,
  rippleEnabled,
  scrubAudioEnabled,
  canEditTransition,
  onAddTrack,
  onPlace,
  onSplit,
  onDelete,
  onToggleSnapping,
  onToggleRipple,
  onToggleScrubAudio,
  onCreateTransition,
  onCreateFade,
  onChangeTransitionDuration,
  onZoomOut,
  onZoomFit,
  onZoomIn,
  onCollapse,
}: TimelineToolbarProps) {
  return (
    <div className="border-border flex h-9 shrink-0 items-center justify-between border-b px-2">
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Add video track"
          onClick={() => onAddTrack('video')}
        >
          <Film className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Add audio track"
          onClick={() => onAddTrack('audio')}
        >
          <Music className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Place selected media"
          disabled={!canPlace}
          onClick={onPlace}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Split selected clips"
          disabled={!canEditClips}
          onClick={onSplit}
        >
          <Scissors className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive size-7"
          aria-label="Delete timeline selection"
          disabled={!hasSelection}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant={snappingEnabled ? 'secondary' : 'ghost'}
          className="size-7"
          aria-label="Toggle snapping"
          onClick={onToggleSnapping}
        >
          <Magnet className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant={rippleEnabled ? 'secondary' : 'ghost'}
          className="h-7 gap-1 px-2"
          aria-pressed={rippleEnabled}
          onClick={onToggleRipple}
        >
          <ChevronsLeftRight className="size-3.5" />
          Ripple
        </Button>
        <Button
          size="icon"
          variant={scrubAudioEnabled ? 'secondary' : 'ghost'}
          className="size-7"
          aria-label="Toggle scrub audio"
          aria-pressed={scrubAudioEnabled}
          onClick={onToggleScrubAudio}
        >
          <Volume2 className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onCreateTransition('video-cross-dissolve')}
        >
          Dissolve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onCreateTransition('audio-crossfade')}
        >
          Crossfade
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onCreateFade('in')}
        >
          Fade in
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onCreateFade('out')}
        >
          Fade out
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Shorten selected transition"
          disabled={!canEditTransition}
          onClick={() => onChangeTransitionDuration(-1)}
        >
          <Minus className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Extend selected transition"
          disabled={!canEditTransition}
          onClick={() => onChangeTransitionDuration(1)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Zoom timeline out"
          onClick={onZoomOut}
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Fit timeline"
          onClick={onZoomFit}
        >
          <ChevronsLeftRight className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Zoom timeline in"
          onClick={onZoomIn}
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onCollapse}>
          Collapse timeline
        </Button>
      </div>
    </div>
  );
}
