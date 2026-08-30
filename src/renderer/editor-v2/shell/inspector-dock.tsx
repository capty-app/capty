import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';

interface InspectorDockProps {
  onCollapse: () => void;
}

export default function InspectorDock({ onCollapse }: InspectorDockProps) {
  return (
    <aside aria-label="Inspector" className="bg-card flex h-full flex-col">
      <div className="border-border flex h-10 items-center gap-2 border-b px-3">
        <SlidersHorizontal className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">Inspector</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-center">
        <div>
          <p className="text-sm font-medium">Nothing selected</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Select a clip, track, effect, or transition to edit its properties.
          </p>
        </div>
      </div>
      <div className="border-border border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full"
          onClick={onCollapse}
        >
          Collapse inspector
        </Button>
      </div>
    </aside>
  );
}
