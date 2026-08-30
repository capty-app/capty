import {
  Trash2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/renderer/components/ui/tooltip';
import UndoRedoButtons from '@/renderer/components/editor/undo-redo';
import ExportProgressIndicator from './export-progress-indicator';
import ProjectPathIndicator from './project-path-indicator';

interface VideoTitleBarProps {
  fileName?: string;
  projectPath?: string;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isExporting?: boolean;
  exportProgress?: number;
  onCancelExport?: () => void;
  onRename?: (newName: string) => Promise<string | null>;
  onSwitchEditorVersion?: () => void;
}

export default function VideoTitleBar({
  fileName,
  projectPath,
  onDelete,
  onUndo,
  onRedo,
  onReset,
  canUndo,
  canRedo,
  isSidebarOpen = false,
  onToggleSidebar,
  isExporting = false,
  exportProgress = 0,
  onCancelExport,
  onRename,
  onSwitchEditorVersion,
}: VideoTitleBarProps) {
  return (
    <div className="drag-region bg-card border-border fixed top-0 right-0 left-0 z-50 flex h-10 w-full items-center justify-between border-b px-2">
      <div className="flex min-w-0 flex-1 items-center pl-16">
        <span className="text-muted-foreground truncate text-sm">
          {fileName || 'Untitled'}
        </span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1">
        {projectPath && (
          <ProjectPathIndicator
            projectPath={projectPath}
            fileName={fileName}
            onRename={onRename}
          />
        )}
        {onSwitchEditorVersion ? (
          <Button
            variant="outline"
            className="h-7"
            onClick={onSwitchEditorVersion}
          >
            Open V2
          </Button>
        ) : null}
        {onCancelExport && (
          <ExportProgressIndicator
            isExporting={isExporting}
            progress={exportProgress}
            onCancel={onCancelExport}
          />
        )}
        <UndoRedoButtons
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onReset} className="size-7" variant="ghost">
              <RefreshCcw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reset to Defaults</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onDelete} className="size-7" variant="ghost">
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Delete Video (Cmd+Delete)
          </TooltipContent>
        </Tooltip>

        {onToggleSidebar && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onToggleSidebar}
                className="size-7"
                variant="ghost"
              >
                {isSidebarOpen ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
