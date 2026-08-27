import type { LucideIcon } from 'lucide-react';
import TrackRow from './track-row';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/renderer/components/ui/tooltip';
import { TRACK_HEADER_WIDTH_CLASS } from './timeline-constants';
import { cn } from '@/renderer/lib/utils';

export interface TrackHeaderItem {
  key: string;
  icon: LucideIcon;
  tooltip: string;
}

interface TimelineTrackHeadersProps {
  headers: TrackHeaderItem[];
}

export default function TimelineTrackHeaders({
  headers,
}: TimelineTrackHeadersProps) {
  return (
    <div
      className={cn(
        'border-border flex shrink-0 flex-col border-r',
        TRACK_HEADER_WIDTH_CLASS
      )}
    >
      {headers.map(({ key, icon: Icon, tooltip }) => (
        <TrackRow key={key} className="flex items-center justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center justify-center">
                <Icon className="text-muted-foreground size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{tooltip}</TooltipContent>
          </Tooltip>
        </TrackRow>
      ))}
    </div>
  );
}
