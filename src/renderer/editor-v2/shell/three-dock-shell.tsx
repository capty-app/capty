import React, { useCallback, useEffect, useState } from 'react';

import BrowserDock from './browser-dock';
import DockResizer from './dock-resizer';
import EditorTitleBar from './editor-title-bar';
import InspectorDock from './inspector-dock';
import TimelineDock from './timeline-dock';
import ViewerPlaceholder from './viewer-placeholder';
import type { EditorProjectV2, EditorV2Workspace } from '@/types/editor-v2';

interface ThreeDockShellProps {
  displayName: string;
  displayPath: string;
  projectToken: string;
  project: EditorProjectV2;
  workspace: EditorV2Workspace;
  canSwitchVersion: boolean;
  onWorkspaceChange: (
    update: (workspace: EditorV2Workspace) => EditorV2Workspace
  ) => void;
  onWorkspaceCommit: () => void;
  onRemoveManaged: (assetId: string) => Promise<void>;
  onMediaOperationStart: () => (() => void) | null;
  operationsFrozen: boolean;
  onSwitchVersion: () => void;
}

const LEFT_DOCK_MINIMUM = 200;
const LEFT_DOCK_MAXIMUM = 400;
const RIGHT_DOCK_MINIMUM = 240;
const RIGHT_DOCK_MAXIMUM = 420;
const TIMELINE_MINIMUM = 180;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export default function ThreeDockShell({
  displayName,
  displayPath,
  projectToken,
  project,
  workspace,
  canSwitchVersion,
  onWorkspaceChange,
  onWorkspaceCommit,
  onRemoveManaged,
  onMediaOperationStart,
  operationsFrozen,
  onSwitchVersion,
}: ThreeDockShellProps) {
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const timelineMaximum = Math.max(
    TIMELINE_MINIMUM,
    Math.floor(windowHeight * 0.55)
  );
  const leftDockSize = clamp(
    workspace.leftDock.size,
    LEFT_DOCK_MINIMUM,
    LEFT_DOCK_MAXIMUM
  );
  const rightDockSize = clamp(
    workspace.rightDock.size,
    RIGHT_DOCK_MINIMUM,
    RIGHT_DOCK_MAXIMUM
  );
  const timelineHeight = clamp(
    workspace.timeline.height,
    TIMELINE_MINIMUM,
    timelineMaximum
  );

  useEffect(() => {
    const updateWindowHeight = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', updateWindowHeight);
    return () => window.removeEventListener('resize', updateWindowHeight);
  }, []);

  const updateWorkspace = useCallback(
    (update: (current: EditorV2Workspace) => EditorV2Workspace) => {
      onWorkspaceChange(update);
    },
    [onWorkspaceChange]
  );
  const toggleLeft = useCallback(() => {
    updateWorkspace(current => ({
      ...current,
      leftDock: { ...current.leftDock, collapsed: !current.leftDock.collapsed },
    }));
    onWorkspaceCommit();
  }, [onWorkspaceCommit, updateWorkspace]);
  const toggleRight = useCallback(() => {
    updateWorkspace(current => ({
      ...current,
      rightDock: {
        ...current.rightDock,
        collapsed: !current.rightDock.collapsed,
      },
    }));
    onWorkspaceCommit();
  }, [onWorkspaceCommit, updateWorkspace]);
  const toggleTimeline = useCallback(() => {
    updateWorkspace(current => ({
      ...current,
      timeline: {
        ...current.timeline,
        collapsed: !current.timeline.collapsed,
      },
    }));
    onWorkspaceCommit();
  }, [onWorkspaceCommit, updateWorkspace]);

  return (
    <div className="bg-background flex h-screen w-full flex-col overflow-hidden select-none">
      <EditorTitleBar
        displayName={displayName}
        displayPath={displayPath}
        canSwitchVersion={canSwitchVersion}
        leftCollapsed={workspace.leftDock.collapsed}
        rightCollapsed={workspace.rightDock.collapsed}
        timelineCollapsed={workspace.timeline.collapsed}
        onToggleLeft={toggleLeft}
        onToggleRight={toggleRight}
        onToggleTimeline={toggleTimeline}
        onSwitchVersion={onSwitchVersion}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {!workspace.leftDock.collapsed ? (
            <>
              <div className="shrink-0" style={{ width: leftDockSize }}>
                <BrowserDock
                  activeTab={workspace.browserTab}
                  projectToken={projectToken}
                  onRemoveManaged={onRemoveManaged}
                  onMediaOperationStart={onMediaOperationStart}
                  operationsFrozen={operationsFrozen}
                  onTabChange={browserTab => {
                    updateWorkspace(current => ({ ...current, browserTab }));
                    onWorkspaceCommit();
                  }}
                  onCollapse={toggleLeft}
                />
              </div>
              <DockResizer
                orientation="horizontal"
                label="Resize project browser"
                value={leftDockSize}
                minimum={LEFT_DOCK_MINIMUM}
                maximum={LEFT_DOCK_MAXIMUM}
                onResize={delta =>
                  updateWorkspace(current => ({
                    ...current,
                    leftDock: {
                      ...current.leftDock,
                      size: clamp(
                        current.leftDock.size + delta,
                        LEFT_DOCK_MINIMUM,
                        LEFT_DOCK_MAXIMUM
                      ),
                    },
                  }))
                }
                onResizeEnd={onWorkspaceCommit}
              />
            </>
          ) : null}
          <ViewerPlaceholder project={project} />
          {!workspace.rightDock.collapsed ? (
            <>
              <DockResizer
                orientation="horizontal"
                label="Resize inspector"
                value={rightDockSize}
                minimum={RIGHT_DOCK_MINIMUM}
                maximum={RIGHT_DOCK_MAXIMUM}
                onResize={delta =>
                  updateWorkspace(current => ({
                    ...current,
                    rightDock: {
                      ...current.rightDock,
                      size: clamp(
                        current.rightDock.size - delta,
                        RIGHT_DOCK_MINIMUM,
                        RIGHT_DOCK_MAXIMUM
                      ),
                    },
                  }))
                }
                onResizeEnd={onWorkspaceCommit}
              />
              <div className="shrink-0" style={{ width: rightDockSize }}>
                <InspectorDock onCollapse={toggleRight} />
              </div>
            </>
          ) : null}
        </div>
        {!workspace.timeline.collapsed ? (
          <>
            <DockResizer
              orientation="vertical"
              label="Resize timeline"
              value={timelineHeight}
              minimum={TIMELINE_MINIMUM}
              maximum={timelineMaximum}
              onResize={delta =>
                updateWorkspace(current => ({
                  ...current,
                  timeline: {
                    ...current.timeline,
                    height: clamp(
                      current.timeline.height - delta,
                      TIMELINE_MINIMUM,
                      timelineMaximum
                    ),
                  },
                }))
              }
              onResizeEnd={onWorkspaceCommit}
            />
            <div className="shrink-0" style={{ height: timelineHeight }}>
              <TimelineDock
                snappingEnabled={workspace.snappingEnabled}
                onSnappingChange={snappingEnabled => {
                  updateWorkspace(current => ({ ...current, snappingEnabled }));
                  onWorkspaceCommit();
                }}
                onCollapse={toggleTimeline}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
