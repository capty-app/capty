import React from 'react';
import { Magnet, MousePointer2, Rows3 } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';

interface TimelineDockProps {
  snappingEnabled: boolean;
  onSnappingChange: (enabled: boolean) => void;
  onCollapse: () => void;
}

export default function TimelineDock({
  snappingEnabled,
  onSnappingChange,
  onCollapse,
}: TimelineDockProps) {
  return (
    <section aria-label="Timeline" className="bg-card flex h-full flex-col">
      <div className="border-border flex h-9 items-center justify-between border-b px-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" className="h-7 gap-2 px-2">
            <MousePointer2 className="size-3.5" />
            Select
          </Button>
          <Button
            variant={snappingEnabled ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7"
            aria-label={
              snappingEnabled ? 'Disable snapping' : 'Enable snapping'
            }
            onClick={() => onSnappingChange(!snappingEnabled)}
          >
            <Magnet className="size-3.5" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="h-7" onClick={onCollapse}>
          Collapse timeline
        </Button>
      </div>
      <div className="border-border flex h-7 shrink-0 border-b">
        <div className="border-border text-muted-foreground flex w-44 items-center border-r px-3 text-xs">
          Tracks
        </div>
        <div className="text-muted-foreground flex flex-1 items-center justify-between px-3 font-mono text-xs">
          <span>00:00</span>
          <span>00:05</span>
          <span>00:10</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="bg-primary absolute top-0 bottom-0 left-1/3 w-px" />
        <div className="text-primary absolute top-0 left-1/3 size-0 -translate-x-1/2 border-x-4 border-t-6 border-x-transparent border-t-current" />
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Rows3 className="size-4" />
            Timeline tracks will appear here
          </div>
        </div>
      </div>
    </section>
  );
}
