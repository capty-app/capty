import type { LucideIcon } from 'lucide-react';
import { TIMELINE_H_PADDING } from './timeline-constants';

export interface TrackLabelProps {
  icon: LucideIcon;
  text: string;
}

export default function TrackLabel({ icon: Icon, text }: TrackLabelProps) {
  return (
    <div
      className="group/label sticky left-0 z-20 h-full shrink-0"
      style={{ width: TIMELINE_H_PADDING }}
    >
      <div className="bg-card group-hover/label:bg-secondary group-hover/label:ring-border flex h-full w-max max-w-8 items-center gap-1.5 overflow-hidden rounded-r-md px-2 transition-all group-hover/label:max-w-44 group-hover/label:shadow-sm group-hover/label:ring-1">
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground text-xs whitespace-nowrap opacity-0 transition-opacity group-hover/label:opacity-100">
          {text}
        </span>
      </div>
    </div>
  );
}
