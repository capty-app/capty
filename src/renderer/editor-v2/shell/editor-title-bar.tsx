import React from 'react';
import {
  Download,
  ListFilter,
  PanelLeftOpen,
  PanelRightOpen,
  Rows3,
} from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import { getCommandTooltip } from '../commands/command-display';
import type { SerializedCommandBinding } from '@/types/editor-v2';

interface EditorTitleBarProps {
  displayName: string;
  displayPath: string;
  commandBindings: readonly SerializedCommandBinding[];
  canSwitchVersion: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  timelineCollapsed: boolean;
  onOpenCommandMenu: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleTimeline: () => void;
  onSwitchVersion: () => void;
}

export default function EditorTitleBar({
  displayName,
  displayPath,
  commandBindings,
  canSwitchVersion,
  leftCollapsed,
  rightCollapsed,
  timelineCollapsed,
  onOpenCommandMenu,
  onToggleLeft,
  onToggleRight,
  onToggleTimeline,
  onSwitchVersion,
}: EditorTitleBarProps) {
  return (
    <header className="drag-region bg-card border-border flex h-10 shrink-0 items-center border-b px-2 pl-20">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate text-sm font-medium">{displayName}</span>
        <span className="text-muted-foreground hidden truncate text-xs xl:block">
          {displayPath}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2"
          aria-label="Editor commands"
          onClick={onOpenCommandMenu}
        >
          <ListFilter className="size-3.5" />
          <span className="hidden xl:inline">Commands</span>
        </Button>
        {leftCollapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Show browser"
            title={getCommandTooltip(
              'workspace.toggle-browser',
              commandBindings
            )}
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
            title={getCommandTooltip(
              'workspace.toggle-timeline',
              commandBindings
            )}
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
            title={getCommandTooltip(
              'workspace.toggle-inspector',
              commandBindings
            )}
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
