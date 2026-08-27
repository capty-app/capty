import {
  Play,
  Pause,
  Scissors,
  Trash2,
  HelpCircle,
  Minus,
  Plus,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { Separator } from '@/renderer/components/ui/separator';
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
  onFitToView,
  scrubAudioEnabled,
  onScrubAudioChange,
  isScrubAudioAvailable,
}: TimelineControlsProps) {
  const {
    pixelsPerSecond,
    zoomIn,
    zoomOut,
    setZoomLevel,
    canZoomIn,
    canZoomOut,
  } = useTimeline();

  return (
    <div className="flex items-center border-b px-1 py-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onTogglePlayPause}
            variant="ghost"
            size="icon"
            className="size-8"
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

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onToggleCutTool}
            variant={isCutToolActive ? 'secondary' : 'ghost'}
            size="icon"
            className="size-8"
          >
            <Scissors className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Cut Tool (C)</TooltipContent>
      </Tooltip>

      {hasSelectedSegment && canDeleteSegment && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onDeleteSegment}
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive size-8"
            >
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Delete Segment (Backspace)</TooltipContent>
        </Tooltip>
      )}

      <Separator orientation="vertical" className="mx-1 h-5" />

      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        {formatTime(timelinePosition)} / {formatTime(totalTimelineDuration)}
        {segmentCount > 1 && (
          <span className="ml-2">({segmentCount} clips)</span>
        )}
      </span>

      {hasSelectedSegment && (
        <>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <SpeedSelector
            speed={selectedSegmentSpeed}
            onSpeedChange={onSpeedChange}
          />
        </>
      )}

      <div className="flex-1" />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={zoomOut}
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!canZoomOut}
            >
              <Minus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Zoom Out (Cmd -)</TooltipContent>
        </Tooltip>

        <Slider
          value={[pixelsPerSecond]}
          min={MIN_PIXELS_PER_SECOND}
          max={MAX_PIXELS_PER_SECOND}
          step={1}
          onValueChange={([value]) => setZoomLevel(value)}
          className="w-24"
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={zoomIn}
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!canZoomIn}
            >
              <Plus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Zoom In (Cmd +)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={onFitToView}
              variant="ghost"
              size="icon"
              className="size-7"
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Fit to View (F)</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Scrub Audio</span>
        <Switch
          checked={scrubAudioEnabled}
          onCheckedChange={onScrubAudioChange}
          disabled={!isScrubAudioAvailable}
        />
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
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
  );
}
