import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { EDITOR_COMMAND_CATALOG } from '@/editor-v2/commands/catalog';
import { createDefaultEditorWorkspace } from '@/editor-v2/persistence/workspace';
import CommandMenu from '../commands/command-menu';
import CommandPalette from '../commands/command-palette';
import {
  createCommandRegistry,
  type RuntimeCommandHandler,
  type RuntimeEditorCommand,
} from '../commands/command-registry';
import ShortcutSheet from '../commands/shortcut-sheet';
import { useEditorKeybindings } from '../store/use-editor-keybindings';
import BrowserDock from './browser-dock';
import DockResizer from './dock-resizer';
import EditorTitleBar from './editor-title-bar';
import InspectorDock from './inspector-dock';
import TimelineDock from './timeline-dock';
import EditorV2Viewer from '../viewer/editor-v2-viewer';
import type {
  EditorProjectV2,
  EditorV2LoadPayload,
  EditorV2Workspace,
} from '@/types/editor-v2';

interface ThreeDockShellProps {
  displayName: string;
  displayPath: string;
  projectToken: string;
  project: EditorProjectV2;
  workspace: EditorV2Workspace;
  commandBindings: EditorV2LoadPayload['commandBindings'];
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
const VIEWER_MINIMUM = 480;
const EMPTY_COMMAND_BINDINGS: EditorV2LoadPayload['commandBindings'] = [];

type WorkspaceRegion =
  'title' | 'browser' | 'viewer' | 'inspector' | 'timeline';

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const resolveDockSizes = (
  width: number,
  requestedLeft: number,
  requestedRight: number,
  leftVisible: boolean,
  rightVisible: boolean
): { left: number; right: number } => {
  let left = leftVisible
    ? clamp(requestedLeft, LEFT_DOCK_MINIMUM, LEFT_DOCK_MAXIMUM)
    : 0;
  let right = rightVisible
    ? clamp(requestedRight, RIGHT_DOCK_MINIMUM, RIGHT_DOCK_MAXIMUM)
    : 0;
  const budget = Math.max(0, width - VIEWER_MINIMUM);
  let overflow = Math.max(0, left + right - budget);
  const leftCapacity = Math.max(0, left - LEFT_DOCK_MINIMUM);
  const leftReduction = Math.min(leftCapacity, Math.ceil(overflow / 2));
  left -= leftReduction;
  overflow -= leftReduction;
  const rightCapacity = Math.max(0, right - RIGHT_DOCK_MINIMUM);
  const rightReduction = Math.min(rightCapacity, overflow);
  right -= rightReduction;
  overflow -= rightReduction;
  if (overflow > 0) left = Math.max(0, left - overflow);
  return { left, right };
};

export default function ThreeDockShell({
  displayName,
  displayPath,
  projectToken,
  project,
  workspace,
  commandBindings,
  canSwitchVersion,
  onWorkspaceChange,
  onWorkspaceCommit,
  onRemoveManaged,
  onMediaOperationStart,
  operationsFrozen,
  onSwitchVersion,
}: ThreeDockShellProps) {
  const activeCommandBindings = commandBindings ?? EMPTY_COMMAND_BINDINGS;
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [playheadTick, setPlayheadTick] = useState(0);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const [commandStatus, setCommandStatus] = useState('');
  const timelineCommandsRef = useRef<readonly RuntimeEditorCommand[]>([]);
  const viewerCommandsRef = useRef<readonly RuntimeEditorCommand[]>([]);
  const scrubAudioRef = useRef<((tick: number) => void) | null>(null);
  const pendingFocusRef = useRef<WorkspaceRegion | null>(null);
  const regionRefs = useRef<Record<WorkspaceRegion, HTMLDivElement | null>>({
    title: null,
    browser: null,
    viewer: null,
    inspector: null,
    timeline: null,
  });
  const timelineMaximum = Math.max(
    TIMELINE_MINIMUM,
    Math.floor(windowSize.height * 0.55)
  );
  const dockSizes = resolveDockSizes(
    windowSize.width,
    workspace.leftDock.size,
    workspace.rightDock.size,
    !workspace.leftDock.collapsed,
    !workspace.rightDock.collapsed
  );
  const leftDockSize = dockSizes.left;
  const rightDockSize = dockSizes.right;
  const leftDockMaximum = Math.min(
    LEFT_DOCK_MAXIMUM,
    Math.max(
      LEFT_DOCK_MINIMUM,
      windowSize.width - VIEWER_MINIMUM - rightDockSize
    )
  );
  const rightDockMaximum = Math.min(
    RIGHT_DOCK_MAXIMUM,
    Math.max(
      RIGHT_DOCK_MINIMUM,
      windowSize.width - VIEWER_MINIMUM - leftDockSize
    )
  );
  const timelineHeight = clamp(
    workspace.timeline.height,
    TIMELINE_MINIMUM,
    timelineMaximum
  );

  useEffect(() => {
    const updateWindowSize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);

  const updateWorkspace = useCallback(
    (update: (current: EditorV2Workspace) => EditorV2Workspace) => {
      onWorkspaceChange(update);
    },
    [onWorkspaceChange]
  );
  const registerScrubAudio = useCallback(
    (handler: ((tick: number) => void) | null) => {
      scrubAudioRef.current = handler;
    },
    []
  );
  const registerViewerCommands = useCallback(
    (commands: readonly RuntimeEditorCommand[] | null) => {
      viewerCommandsRef.current = commands ?? [];
    },
    []
  );
  const registerTimelineCommands = useCallback(
    (commands: readonly RuntimeEditorCommand[] | null) => {
      timelineCommandsRef.current = commands ?? [];
    },
    []
  );
  const focusRegion = useCallback(
    (region: WorkspaceRegion) => {
      const needsBrowser = region === 'browser' && workspace.leftDock.collapsed;
      const needsInspector =
        region === 'inspector' && workspace.rightDock.collapsed;
      const needsTimeline =
        region === 'timeline' && workspace.timeline.collapsed;
      if (!needsBrowser && !needsInspector && !needsTimeline) {
        regionRefs.current[region]?.focus();
        return;
      }
      pendingFocusRef.current = region;
      updateWorkspace(current => ({
        ...current,
        leftDock: needsBrowser
          ? { ...current.leftDock, collapsed: false }
          : current.leftDock,
        rightDock: needsInspector
          ? { ...current.rightDock, collapsed: false }
          : current.rightDock,
        timeline: needsTimeline
          ? { ...current.timeline, collapsed: false }
          : current.timeline,
      }));
      onWorkspaceCommit();
    },
    [onWorkspaceCommit, updateWorkspace, workspace]
  );
  const toggleLeft = useCallback(() => {
    pendingFocusRef.current = workspace.leftDock.collapsed
      ? 'browser'
      : 'title';
    updateWorkspace(current => ({
      ...current,
      leftDock: { ...current.leftDock, collapsed: !current.leftDock.collapsed },
    }));
    onWorkspaceCommit();
  }, [onWorkspaceCommit, updateWorkspace, workspace.leftDock.collapsed]);
  const toggleRight = useCallback(() => {
    pendingFocusRef.current = workspace.rightDock.collapsed
      ? 'inspector'
      : 'title';
    updateWorkspace(current => ({
      ...current,
      rightDock: {
        ...current.rightDock,
        collapsed: !current.rightDock.collapsed,
      },
    }));
    onWorkspaceCommit();
  }, [onWorkspaceCommit, updateWorkspace, workspace.rightDock.collapsed]);
  const toggleTimeline = useCallback(() => {
    pendingFocusRef.current = workspace.timeline.collapsed
      ? 'timeline'
      : 'title';
    updateWorkspace(current => ({
      ...current,
      timeline: {
        ...current.timeline,
        collapsed: !current.timeline.collapsed,
      },
    }));
    onWorkspaceCommit();
  }, [onWorkspaceCommit, updateWorkspace, workspace.timeline.collapsed]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const target = regionRefs.current[pending];
    if (!target) return;
    pendingFocusRef.current = null;
    target.focus();
  }, [
    workspace.leftDock.collapsed,
    workspace.rightDock.collapsed,
    workspace.timeline.collapsed,
  ]);

  const visibleRegions = useMemo<WorkspaceRegion[]>(
    () => [
      'title',
      ...(!workspace.leftDock.collapsed ? (['browser'] as const) : []),
      'viewer',
      ...(!workspace.rightDock.collapsed ? (['inspector'] as const) : []),
      ...(!workspace.timeline.collapsed ? (['timeline'] as const) : []),
    ],
    [
      workspace.leftDock.collapsed,
      workspace.rightDock.collapsed,
      workspace.timeline.collapsed,
    ]
  );
  const cycleRegions = useCallback(() => {
    const active = document.activeElement;
    const index = visibleRegions.findIndex(region => {
      const element = regionRefs.current[region];
      return element === active || Boolean(active && element?.contains(active));
    });
    const next = visibleRegions[(index + 1) % visibleRegions.length];
    regionRefs.current[next]?.focus();
  }, [visibleRegions]);
  const resetWorkspace = useCallback(() => {
    const defaults = createDefaultEditorWorkspace();
    updateWorkspace(current => ({
      ...defaults,
      revision: current.revision,
      lastExportSettings: current.lastExportSettings,
    }));
    onWorkspaceCommit();
    regionRefs.current.viewer?.focus();
  }, [onWorkspaceCommit, updateWorkspace]);

  const shellHandlers = useMemo<
    Readonly<Record<string, RuntimeCommandHandler | undefined>>
  >(
    () => ({
      'project.command-palette': {
        execute: () => setCommandPaletteOpen(true),
        isAvailable: () => true,
      },
      'project.shortcut-sheet': {
        execute: () => setShortcutSheetOpen(true),
        isAvailable: () => true,
      },
      'workspace.cycle-regions': {
        execute: cycleRegions,
        isAvailable: () => visibleRegions.length > 1,
      },
      'workspace.focus-title': {
        execute: () => focusRegion('title'),
        isAvailable: () => true,
      },
      'workspace.focus-browser': {
        execute: () => focusRegion('browser'),
        isAvailable: () => true,
      },
      'workspace.focus-viewer': {
        execute: () => focusRegion('viewer'),
        isAvailable: () => true,
      },
      'workspace.focus-inspector': {
        execute: () => focusRegion('inspector'),
        isAvailable: () => true,
      },
      'workspace.focus-timeline': {
        execute: () => focusRegion('timeline'),
        isAvailable: () => true,
      },
      'workspace.toggle-browser': {
        execute: toggleLeft,
        isAvailable: () => true,
      },
      'workspace.toggle-inspector': {
        execute: toggleRight,
        isAvailable: () => true,
      },
      'workspace.toggle-timeline': {
        execute: toggleTimeline,
        isAvailable: () => true,
      },
      'workspace.reset': {
        execute: resetWorkspace,
        isAvailable: () => true,
      },
    }),
    [
      cycleRegions,
      focusRegion,
      resetWorkspace,
      toggleLeft,
      toggleRight,
      toggleTimeline,
      visibleRegions.length,
    ]
  );
  const childHandlers = useMemo<
    Readonly<Record<string, RuntimeCommandHandler | undefined>>
  >(
    () =>
      Object.fromEntries(
        EDITOR_COMMAND_CATALOG.map(command => {
          const resolveAvailableCommand = () =>
            [...timelineCommandsRef.current, ...viewerCommandsRef.current].find(
              candidate =>
                candidate.id === command.id && candidate.isAvailable()
            );
          return [
            command.id,
            {
              execute: async () => {
                await resolveAvailableCommand()?.execute();
              },
              isAvailable: () => Boolean(resolveAvailableCommand()),
            },
          ];
        })
      ),
    []
  );
  const commandRegistry = useMemo(
    () => createCommandRegistry({ ...childHandlers, ...shellHandlers }),
    [childHandlers, shellHandlers]
  );
  const onKeyDown = useEditorKeybindings(
    commandRegistry,
    activeCommandBindings
  );
  const reportCommand = useCallback((label: string) => {
    setCommandStatus(`${label} completed`);
  }, []);

  return (
    <div
      className="bg-background flex h-screen w-full flex-col overflow-hidden select-none"
      onKeyDown={onKeyDown}
    >
      <div
        ref={element => {
          regionRefs.current.title = element;
        }}
        tabIndex={-1}
        role="region"
        aria-label="Title bar workspace region"
        className="focus-visible:ring-primary outline-none focus-visible:ring-2 focus-visible:ring-inset"
        data-workspace-region="title"
      >
        <EditorTitleBar
          displayName={displayName}
          displayPath={displayPath}
          commandBindings={activeCommandBindings}
          canSwitchVersion={canSwitchVersion}
          leftCollapsed={workspace.leftDock.collapsed}
          rightCollapsed={workspace.rightDock.collapsed}
          timelineCollapsed={workspace.timeline.collapsed}
          onOpenCommandMenu={() => setCommandMenuOpen(true)}
          onToggleLeft={toggleLeft}
          onToggleRight={toggleRight}
          onToggleTimeline={toggleTimeline}
          onSwitchVersion={onSwitchVersion}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {!workspace.leftDock.collapsed ? (
            <>
              <div
                ref={element => {
                  regionRefs.current.browser = element;
                }}
                tabIndex={-1}
                role="region"
                aria-label="Browser workspace region"
                className="focus-visible:ring-primary shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                style={{ width: leftDockSize }}
                data-workspace-region="browser"
              >
                <BrowserDock
                  activeTab={workspace.browserTab}
                  projectToken={projectToken}
                  onRemoveManaged={onRemoveManaged}
                  onMediaOperationStart={onMediaOperationStart}
                  operationsFrozen={operationsFrozen}
                  commandBindings={activeCommandBindings}
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
                maximum={leftDockMaximum}
                onResize={delta =>
                  updateWorkspace(current => ({
                    ...current,
                    leftDock: {
                      ...current.leftDock,
                      size: clamp(
                        current.leftDock.size + delta,
                        LEFT_DOCK_MINIMUM,
                        leftDockMaximum
                      ),
                    },
                  }))
                }
                onResizeEnd={onWorkspaceCommit}
              />
            </>
          ) : null}
          <div
            ref={element => {
              regionRefs.current.viewer = element;
            }}
            tabIndex={-1}
            role="region"
            aria-label="Viewer workspace region"
            className="focus-visible:ring-primary flex min-h-0 min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-inset"
            data-workspace-region="viewer"
          >
            <EditorV2Viewer
              projectToken={projectToken}
              project={project}
              currentTick={playheadTick}
              onCurrentTickChange={setPlayheadTick}
              directManipulation
              scrubAudioEnabled={workspace.scrubAudioEnabled}
              commandBindings={activeCommandBindings}
              onCommandRegistryChange={registerViewerCommands}
              onScrubAudioHandlerChange={registerScrubAudio}
            />
          </div>
          {!workspace.rightDock.collapsed ? (
            <>
              <DockResizer
                orientation="horizontal"
                label="Resize inspector"
                value={rightDockSize}
                minimum={RIGHT_DOCK_MINIMUM}
                maximum={rightDockMaximum}
                onResize={delta =>
                  updateWorkspace(current => ({
                    ...current,
                    rightDock: {
                      ...current.rightDock,
                      size: clamp(
                        current.rightDock.size - delta,
                        RIGHT_DOCK_MINIMUM,
                        rightDockMaximum
                      ),
                    },
                  }))
                }
                onResizeEnd={onWorkspaceCommit}
              />
              <div
                ref={element => {
                  regionRefs.current.inspector = element;
                }}
                tabIndex={-1}
                role="region"
                aria-label="Inspector workspace region"
                className="focus-visible:ring-primary shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                style={{ width: rightDockSize }}
                data-workspace-region="inspector"
              >
                <InspectorDock
                  projectToken={projectToken}
                  commandBindings={activeCommandBindings}
                  onCollapse={toggleRight}
                />
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
            <div
              ref={element => {
                regionRefs.current.timeline = element;
              }}
              tabIndex={-1}
              role="region"
              aria-label="Timeline workspace region"
              className="focus-visible:ring-primary shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{ height: timelineHeight }}
              data-workspace-region="timeline"
            >
              <TimelineDock
                projectToken={projectToken}
                workspace={workspace}
                commandBindings={activeCommandBindings}
                playheadTick={playheadTick}
                onPlayheadChange={tick => {
                  const scrub = scrubAudioRef.current;
                  if (scrub) {
                    scrub(tick);
                    return;
                  }
                  setPlayheadTick(tick);
                }}
                onWorkspaceChange={updateWorkspace}
                onWorkspaceCommit={onWorkspaceCommit}
                onCollapse={toggleTimeline}
                onCommandRegistryChange={registerTimelineCommands}
              />
            </div>
          </>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {commandStatus}
      </p>
      <CommandMenu
        open={commandMenuOpen}
        commands={commandRegistry}
        bindings={activeCommandBindings}
        onOpenChange={setCommandMenuOpen}
        onExecuted={reportCommand}
      />
      <CommandPalette
        open={commandPaletteOpen}
        commands={commandRegistry}
        bindings={activeCommandBindings}
        onOpenChange={setCommandPaletteOpen}
        onExecuted={reportCommand}
      />
      <ShortcutSheet
        open={shortcutSheetOpen}
        commands={commandRegistry}
        bindings={activeCommandBindings}
        onOpenChange={setShortcutSheetOpen}
      />
    </div>
  );
}
