import {
  Play,
  Pause,
  Scissors,
  Trash2,
  HelpCircle,
  Maximize2,
  ChevronsLeftRight,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { Slider } from '@/renderer/components/ui/slider';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/renderer/components/ui/tooltip';
import { formatTime } from '../utils';
import SpeedSelector from './speed-selector';
import { useTimeline } from './use-timeline';
import {
  MIN_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
} from './timeline-constants';

interface TimelineControlsProps {
  isPlaying: boolean;
  isCutToolActive: boolean;
  hasSelectedSegment: boolean;
  canDeleteSegment: boolean;
  timelinePosition: number;
  totalTimelineDuration: number;
  segmentCount: number;
  selectedSegmentSpeed: number;
  onTogglePlayPause: () => void;
  onToggleCutTool: () => void;
  onDeleteSegment: () => void;
  onSpeedChange: (speed: number) => void;
  onSeekRelative: (deltaSeconds: number) => void;
  onFitToView: () => void;
  scrubAudioEnabled: boolean;
  onScrubAudioChange: (enabled: boolean) => void;
  isScrubAudioAvailable: boolean;
}

export default function TimelineControls({
  isPlaying,
  isCutToolActive,
  hasSelectedSegment,
  canDeleteSegment,
  timelinePosition,
  totalTimelineDuration,
  segmentCount,
  selectedSegmentSpeed,
  onTogglePlayPause,
  onToggleCutTool,
  onDeleteSegment,
  onSpeedChange,
  onSeekRelative,
  onFitToView,
  scrubAudioEnabled,
  onScrubAudioChange,
  isScrubAudioAvailable,
}: TimelineControlsProps) {
  const { pixelsPerSecond, setZoomLevel, canZoomIn, canZoomOut } =
    useTimeline();

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-2">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onToggleCutTool}
              variant={isCutToolActive ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-2 rounded-lg"
            >
              <Scissors className="size-3.5" />
              Cut
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Cut Tool (C)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onDeleteSegment}
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive size-8 rounded-lg"
              disabled={!hasSelectedSegment || !canDeleteSegment}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Delete Segment (Backspace)</TooltipContent>
        </Tooltip>

        <SpeedSelector
          speed={hasSelectedSegment ? selectedSegmentSpeed : 1}
          onSpeedChange={onSpeedChange}
          disabled={!hasSelectedSegment}
        />
      </div>

      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => onSeekRelative(-1)}
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
            >
              <SkipBack className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Back 1s (←)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onTogglePlayPause}
              variant="outline"
              size="icon"
              className="size-9 rounded-full"
            >
              {isPlaying ? (
                <Pause className="size-4" fill="currentColor" />
              ) : (
                <Play className="size-4" fill="currentColor" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isPlaying ? 'Pause' : 'Play'} (Space)
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => onSeekRelative(1)}
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
            >
              <SkipForward className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Forward 1s (→)</TooltipContent>
        </Tooltip>

        <span className="font-mono text-xs tabular-nums">
          {formatTime(timelinePosition)}
          <span className="text-muted-foreground">
            {' / '}
            {formatTime(totalTimelineDuration)}
          </span>
          {segmentCount > 1 && (
            <span className="text-muted-foreground ml-2 font-sans">
              {segmentCount} clips
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
        <div className="flex h-8 items-center gap-2 px-2">
          <ChevronsLeftRight className="text-muted-foreground size-3.5" />
          <Slider
            value={[pixelsPerSecond]}
            min={MIN_PIXELS_PER_SECOND}
            max={MAX_PIXELS_PER_SECOND}
            step={1}
            onValueChange={([value]) => setZoomLevel(value)}
            className="w-24"
            disabled={!canZoomIn && !canZoomOut}
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onFitToView}
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Fit to View (F)</TooltipContent>
        </Tooltip>

        <div className="flex h-8 items-center gap-2 px-2">
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            Scrub audio
          </span>
          <Switch
            checked={scrubAudioEnabled}
            onCheckedChange={onScrubAudioChange}
            disabled={!isScrubAudioAvailable}
          />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-lg">
              <HelpCircle className="text-muted-foreground size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-center">
            {isCutToolActive
              ? 'Click on timeline to cut at that position'
              : 'Drag edges to trim | Hover to scrub | Click to select | Backspace to delete | ←/→ seek 1s (Shift 5s) | , . step frame | Home/End jump | F fit to view'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
