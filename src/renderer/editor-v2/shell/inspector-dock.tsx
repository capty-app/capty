import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import { getCommandTooltip } from '@/renderer/editor-v2/commands/command-display';
import SelectionInspector from '@/renderer/editor-v2/inspector/selection-inspector';
import type { SerializedCommandBinding } from '@/types/editor-v2';

interface InspectorDockProps {
  projectToken: string;
  commandBindings: readonly SerializedCommandBinding[];
  onCollapse: () => void;
}

export default function InspectorDock({
  projectToken,
  commandBindings,
  onCollapse,
}: InspectorDockProps) {
  return (
    <aside aria-label="Inspector" className="bg-card flex h-full flex-col">
      <div className="border-border flex h-10 items-center gap-2 border-b px-3">
        <SlidersHorizontal className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">Inspector</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SelectionInspector projectToken={projectToken} />
      </div>
      <div className="border-border border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full"
          title={getCommandTooltip(
            'workspace.toggle-inspector',
            commandBindings
          )}
          onClick={onCollapse}
        >
          Collapse inspector
        </Button>
      </div>
    </aside>
  );
}
