import React from 'react';
import { Download, PanelLeftOpen, PanelRightOpen, Rows3 } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';

interface EditorTitleBarProps {
  displayName: string;
  displayPath: string;
  canSwitchVersion: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  timelineCollapsed: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleTimeline: () => void;
  onSwitchVersion: () => void;
}

export default function EditorTitleBar({
  displayName,
  displayPath,
  canSwitchVersion,
  leftCollapsed,
  rightCollapsed,
  timelineCollapsed,
  onToggleLeft,
  onToggleRight,
  onToggleTimeline,
  onSwitchVersion,
}: EditorTitleBarProps) {
  return (
    <header className="drag-region bg-card border-border flex h-10 shrink-0 items-center border-b px-2 pl-20">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate text-sm font-medium">{displayName}</span>
        <span className="text-muted-foreground truncate text-xs">
          {displayPath}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {leftCollapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Show browser"
            onClick={onToggleLeft}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        ) : null}
        {timelineCollapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Show timeline"
            onClick={onToggleTimeline}
          >
            <Rows3 className="size-4" />
          </Button>
        ) : null}
        {rightCollapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Show inspector"
            onClick={onToggleRight}
          >
            <PanelRightOpen className="size-4" />
          </Button>
        ) : null}
        {canSwitchVersion ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={onSwitchVersion}
          >
            Open V1
          </Button>
        ) : null}
        <Button size="sm" className="h-7 gap-2" disabled>
          <Download className="size-3.5" />
          Export
        </Button>
      </div>
    </header>
  );
}
