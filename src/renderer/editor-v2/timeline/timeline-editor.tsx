import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createCommandRegistry } from '../commands/command-registry';
import { useEditorKeybindings } from '../store/use-editor-keybindings';
import { useEditorStore } from '../store/use-editor-store';
import {
  createAddTrackCommand,
  createRemoveTransitionCommand,
} from '@/editor-v2/commands/operations';
import { createPlaceAssetCommand } from '@/editor-v2/commands/placement';
import {
  solveBoundarySnap,
  type SnapGuide,
} from '@/editor-v2/commands/snapping';
import {
  createDeleteClipsCommand,
  createDeleteTrackCommand,
  createMoveClipsCommand,
  createMoveClipsToAdjacentTrackCommand,
  createReorderTrackCommand,
  createSplitClipsCommand,
  createTrimClipsCommand,
  createUpdateTrackCommand,
} from '@/editor-v2/commands/timeline-edits';
import {
  createChangeTransitionDurationCommand,
  createValidatedTransitionCommand,
} from '@/editor-v2/commands/transitions';
import { ticksForFrames } from '@/editor-v2/time/timebase';
import { getSequenceOutputDuration } from '@/editor-v2/timeline';
import TimelineToolbar from './timeline-toolbar';
import TimelineTrackArea from './timeline-track-area';
import type {
  EditorClip,
  EditorProjectV2,
  EditorTrack,
  EditorV2Workspace,
  MediaAssetStatus,
  SerializedCommandBinding,
} from '@/types/editor-v2';

interface TimelineEditorProps {
  projectToken: string;
  workspace: EditorV2Workspace;
  commandBindings: readonly SerializedCommandBinding[];
  playheadTick: number;
  onPlayheadChange: (tick: number) => void;
  onWorkspaceChange: (
    update: (workspace: EditorV2Workspace) => EditorV2Workspace
  ) => void;
  onWorkspaceCommit: () => void;
  onCollapse: () => void;
}

interface GestureState {
  pointerId: number;
  clipIds: string[];
  primaryClipId: string;
  action: 'move' | 'trim-start' | 'trim-end';
  startClientX: number;
  startClientY: number;
  appliedDelta: number;
  appliedTrackSteps: number;
  initialSnapEdges: number[];
}

const MINIMUM_ZOOM = 10;
const MAXIMUM_ZOOM = 800;
const TRACK_HEIGHT = 48;
const SNAP_THRESHOLD_PIXELS = 8;

const createTrack = (
  kind: EditorTrack['kind'],
  project: EditorProjectV2
): EditorTrack => {
  const count =
    kind === 'video'
      ? project.sequence.videoTrackIds.length
      : project.sequence.audioTrackIds.length;
  const base = {
    id: crypto.randomUUID(),
    kind,
    name: `${kind === 'video' ? 'Video' : 'Audio'} ${count + 1}`,
    clipIds: [],
    locked: false,
  };
  return kind === 'video'
    ? { ...base, kind: 'video', visible: true, compositingOrder: count }
    : {
        ...base,
        kind: 'audio',
        muted: false,
        solo: false,
        gain: 1,
        mixOrder: count,
      };
};

const selectedClipIds = (
  selection: ReturnType<typeof useEditorStore>['selection']
): string[] => (selection.kind === 'clips' ? selection.clipIds : []);

const getGestureClips = (
  project: EditorProjectV2,
  clipIds: readonly string[]
): EditorClip[] => {
  const groupIds = new Set(
    clipIds
      .map(clipId => project.sequence.clips[clipId]?.linkedGroupId)
      .filter((groupId): groupId is string => Boolean(groupId))
  );
  return Object.values(project.sequence.clips).filter(
    clip =>
      clipIds.includes(clip.id) ||
      Boolean(clip.linkedGroupId && groupIds.has(clip.linkedGroupId))
  );
};

const findPlacementTrack = (
  project: EditorProjectV2,
  preferredTrackId: string | null,
  assetId: string
): EditorTrack | undefined => {
  const asset = project.assets[assetId];
  const requiredKind = asset?.kind === 'audio' ? 'audio' : 'video';
  if (preferredTrackId) {
    const preferred = project.sequence.tracks[preferredTrackId];
    if (preferred?.kind === requiredKind && !preferred.locked) return preferred;
  }
  const ids =
    requiredKind === 'video'
      ? project.sequence.videoTrackIds
      : project.sequence.audioTrackIds;
  return ids
    .map(id => project.sequence.tracks[id])
    .find(track => !track.locked);
};

export default function TimelineEditor({
  projectToken,
  workspace,
  commandBindings,
  playheadTick,
  onPlayheadChange,
  onWorkspaceChange,
  onWorkspaceCommit,
  onCollapse,
}: TimelineEditorProps) {
  const store = useEditorStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const preferredTrackIdRef = useRef<string | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const [placementAssetId, setPlacementAssetId] = useState<string | null>(null);
  const [snapGuide, setSnapGuide] = useState<SnapGuide | null>(null);
  const [statuses, setStatuses] = useState<Record<string, MediaAssetStatus>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const duration = Math.max(
    getSequenceOutputDuration(store.document),
    5 * store.document.timebase.ticksPerSecond
  );
  const pixelsPerTick =
    workspace.timeline.zoom / store.document.timebase.ticksPerSecond;
  const timelineWidth = Math.max(1, duration * pixelsPerTick);
  const orderedTrackIds = [
    ...store.document.sequence.videoTrackIds,
    ...store.document.sequence.audioTrackIds,
  ];
  const clipIds = selectedClipIds(store.selection);
  const frameTicks = ticksForFrames(
    1,
    store.document.timebase.displayFrameRate,
    'nearest'
  );

  useEffect(() => {
    if (store.selection.kind === 'asset') {
      setPlacementAssetId(store.selection.assetId);
    }
  }, [store.selection]);

  useEffect(() => {
    const clips = Object.values(store.document.sequence.clips);
    if (clips.length === 0) return;
    let active = true;
    void Promise.all(
      clips.map(async clip => ({
        clip,
        result: await window.editorV2.getMediaStatus({
          projectToken,
          assetId: clip.assetId,
          sourceStreamId:
            'sourceStreamId' in clip ? clip.sourceStreamId : undefined,
          sourceRole: 'sourceRole' in clip ? clip.sourceRole : undefined,
        }),
      }))
    ).then(results => {
      if (!active) return;
      const next: Record<string, MediaAssetStatus> = {};
      for (const { clip, result } of results) {
        next[clip.id] =
          result.status === 'resolved'
            ? result.asset
            : {
                assetId: clip.assetId,
                availability: 'error',
                error: result.error,
              };
      }
      setStatuses(next);
    });
    return () => {
      active = false;
    };
  }, [projectToken, store.document.sequence.clips]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const expected = workspace.timeline.scrollTick * pixelsPerTick;
    if (Math.abs(scroll.scrollLeft - expected) > 1)
      scroll.scrollLeft = expected;
  }, [pixelsPerTick, workspace.timeline.scrollTick]);

  const reportFailure = useCallback((message: string) => setError(message), []);
  const stopAutoScroll = useCallback(() => {
    autoScrollDirectionRef.current = 0;
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);
  const setAutoScrollDirection = useCallback(
    (direction: -1 | 0 | 1) => {
      autoScrollDirectionRef.current = direction;
      if (direction === 0) {
        stopAutoScroll();
        return;
      }
      if (autoScrollFrameRef.current !== null) return;
      const update = () => {
        const scroll = scrollRef.current;
        const currentDirection = autoScrollDirectionRef.current;
        if (!scroll || currentDirection === 0) {
          autoScrollFrameRef.current = null;
          return;
        }
        const previousScrollLeft = scroll.scrollLeft;
        scroll.scrollLeft = Math.max(
          0,
          scroll.scrollLeft + currentDirection * 8
        );
        const deltaPixels = scroll.scrollLeft - previousScrollLeft;
        const gesture = gestureRef.current;
        if (gesture && deltaPixels !== 0) {
          const deltaTicks = Math.round(deltaPixels / pixelsPerTick);
          if (deltaTicks !== 0) {
            const command =
              gesture.action === 'move'
                ? createMoveClipsCommand(gesture.clipIds, deltaTicks)
                : createTrimClipsCommand(
                    gesture.clipIds,
                    gesture.action === 'trim-start' ? 'start' : 'end',
                    deltaTicks,
                    workspace.rippleEnabled
                  );
            if (store.previewTransaction(command)) {
              gesture.appliedDelta += deltaTicks;
            }
          }
        }
        autoScrollFrameRef.current = requestAnimationFrame(update);
      };
      autoScrollFrameRef.current = requestAnimationFrame(update);
    },
    [pixelsPerTick, stopAutoScroll, store, workspace.rippleEnabled]
  );
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const run = useCallback(
    (
      command: Parameters<typeof store.execute>[0],
      failure: string
    ): boolean => {
      const succeeded = store.execute(command);
      setError(succeeded ? null : failure);
      return succeeded;
    },
    [store]
  );

  const setZoom = useCallback(
    (zoom: number) => {
      onWorkspaceChange(current => ({
        ...current,
        timeline: {
          ...current.timeline,
          zoom: Math.min(MAXIMUM_ZOOM, Math.max(MINIMUM_ZOOM, zoom)),
        },
      }));
      onWorkspaceCommit();
    },
    [onWorkspaceChange, onWorkspaceCommit]
  );

  const fitTimeline = useCallback(() => {
    const viewport = scrollRef.current?.clientWidth ?? 1;
    setZoom((viewport * store.document.timebase.ticksPerSecond) / duration);
  }, [duration, setZoom, store.document.timebase.ticksPerSecond]);

  const updateClipSelection = useCallback(
    (clipId: string, additive: boolean) => {
      if (!additive || store.selection.kind !== 'clips') {
        store.setSelection({
          kind: 'clips',
          clipIds: [clipId],
          primaryClipId: clipId,
        });
        return;
      }
      const current = store.selection.clipIds;
      const next = current.includes(clipId)
        ? current.filter(id => id !== clipId)
        : [...current, clipId];
      store.setSelection(
        next.length === 0
          ? { kind: 'none' }
          : { kind: 'clips', clipIds: next, primaryClipId: clipId }
      );
    },
    [store]
  );

  const deleteSelection = useCallback(() => {
    if (store.selection.kind === 'transition') {
      run(
        createRemoveTransitionCommand(store.selection.transitionId),
        'The transition could not be removed'
      );
      return;
    }
    if (store.selection.kind === 'track') {
      run(
        createDeleteTrackCommand(store.selection.trackId),
        'The selected track or one of its linked sibling tracks is locked'
      );
      return;
    }
    if (clipIds.length === 0) return;
    run(
      createDeleteClipsCommand({
        clipIds,
        ripple: workspace.rippleEnabled,
      }),
      'The selected clips could not be deleted'
    );
  }, [clipIds, run, store.selection, workspace.rippleEnabled]);

  const splitSelection = useCallback(() => {
    if (clipIds.length === 0) return;
    run(
      createSplitClipsCommand(clipIds, playheadTick, () => crypto.randomUUID()),
      'Move the playhead inside an unlocked selected clip and outside transitions'
    );
  }, [clipIds, playheadTick, run]);

  const placeSelectedAsset = useCallback(() => {
    if (!placementAssetId) return;
    const track = findPlacementTrack(
      store.document,
      preferredTrackIdRef.current,
      placementAssetId
    );
    if (!track) {
      reportFailure(
        'Add or unlock a compatible track before placing this asset'
      );
      return;
    }
    run(
      createPlaceAssetCommand({
        assetId: placementAssetId,
        trackId: track.id,
        timelineStart: playheadTick,
        clipId: crypto.randomUUID(),
        ripple: workspace.rippleEnabled,
      }),
      'The selected asset could not be placed at the playhead'
    );
  }, [
    placementAssetId,
    playheadTick,
    reportFailure,
    run,
    store.document,
    workspace.rippleEnabled,
  ]);

  const addTrack = useCallback(
    (kind: EditorTrack['kind']) => {
      const track = createTrack(kind, store.document);
      if (
        run(
          createAddTrackCommand(track),
          `The ${kind} track could not be added`
        )
      ) {
        preferredTrackIdRef.current = track.id;
        store.setSelection({ kind: 'track', trackId: track.id });
      }
    },
    [run, store]
  );

  const selectAllClips = useCallback(() => {
    const ids = Object.keys(store.document.sequence.clips);
    store.setSelection(
      ids.length === 0
        ? { kind: 'none' }
        : { kind: 'clips', clipIds: ids, primaryClipId: ids[0] }
    );
  }, [store]);

  const nudge = useCallback(
    (direction: -1 | 1) => {
      if (clipIds.length === 0) return;
      run(
        createMoveClipsCommand(clipIds, direction * frameTicks),
        'The selected clips could not be nudged'
      );
    },
    [clipIds, frameTicks, run]
  );

  const registry = useMemo(
    () =>
      createCommandRegistry({
        'edit.undo': {
          execute: () => {
            store.undo();
          },
          isAvailable: () => store.canUndo,
        },
        'edit.redo': {
          execute: () => {
            store.redo();
          },
          isAvailable: () => store.canRedo,
        },
        'edit.select-all-clips': {
          execute: selectAllClips,
          isAvailable: () =>
            Object.keys(store.document.sequence.clips).length > 0,
        },
        'edit.clear-selection': {
          execute: () => {
            if (gestureRef.current) {
              gestureRef.current = null;
              stopAutoScroll();
              store.cancelTransaction();
              setSnapGuide(null);
              return;
            }
            store.setSelection({ kind: 'none' });
          },
          isAvailable: () =>
            store.selection.kind !== 'none' || Boolean(gestureRef.current),
        },
        'edit.delete-selection': {
          execute: deleteSelection,
          isAvailable: () => store.selection.kind !== 'none',
        },
        'edit.split-at-playhead': {
          execute: splitSelection,
          isAvailable: () => clipIds.length > 0,
        },
        'edit.toggle-snapping': {
          execute: () => {
            onWorkspaceChange(current => ({
              ...current,
              snappingEnabled: !current.snappingEnabled,
            }));
            onWorkspaceCommit();
          },
          isAvailable: () => true,
        },
        'edit.toggle-ripple': {
          execute: () => {
            onWorkspaceChange(current => ({
              ...current,
              rippleEnabled: !current.rippleEnabled,
            }));
            onWorkspaceCommit();
          },
          isAvailable: () => true,
        },
        'timeline.zoom-in': {
          execute: () => setZoom(workspace.timeline.zoom * 1.25),
          isAvailable: () => workspace.timeline.zoom < MAXIMUM_ZOOM,
        },
        'timeline.zoom-out': {
          execute: () => setZoom(workspace.timeline.zoom / 1.25),
          isAvailable: () => workspace.timeline.zoom > MINIMUM_ZOOM,
        },
        'timeline.zoom-fit': { execute: fitTimeline, isAvailable: () => true },
        'track.add-video': {
          execute: () => addTrack('video'),
          isAvailable: () => true,
        },
        'track.add-audio': {
          execute: () => addTrack('audio'),
          isAvailable: () => true,
        },
        'clip.move-track-up': {
          execute: () => {
            run(
              createMoveClipsToAdjacentTrackCommand(clipIds, -1),
              'The selected clips cannot move to the track above'
            );
          },
          isAvailable: () => clipIds.length > 0,
        },
        'clip.move-track-down': {
          execute: () => {
            run(
              createMoveClipsToAdjacentTrackCommand(clipIds, 1),
              'The selected clips cannot move to the track below'
            );
          },
          isAvailable: () => clipIds.length > 0,
        },
        'clip.nudge-left': {
          execute: () => nudge(-1),
          isAvailable: () => clipIds.length > 0,
        },
        'clip.nudge-right': {
          execute: () => nudge(1),
          isAvailable: () => clipIds.length > 0,
        },
      }),
    [
      addTrack,
      clipIds,
      deleteSelection,
      fitTimeline,
      nudge,
      onWorkspaceChange,
      onWorkspaceCommit,
      run,
      selectAllClips,
      setZoom,
      splitSelection,
      stopAutoScroll,
      store,
      workspace.timeline.zoom,
    ]
  );
  const onKeyDown = useEditorKeybindings(registry, commandBindings);

  const beginGesture = useCallback(
    (
      event: React.PointerEvent,
      clip: EditorClip,
      action: GestureState['action']
    ) => {
      if (event.button !== 0) return;
      const track = store.document.sequence.tracks[clip.trackId];
      if (track.locked) {
        reportFailure(`${track.name} is locked`);
        return;
      }
      if (
        store.selection.kind !== 'clips' ||
        !store.selection.clipIds.includes(clip.id)
      ) {
        store.setSelection({
          kind: 'clips',
          clipIds: [clip.id],
          primaryClipId: clip.id,
        });
      }
      const ids =
        store.selection.kind === 'clips' &&
        store.selection.clipIds.includes(clip.id)
          ? store.selection.clipIds
          : [clip.id];
      if (!store.beginTransaction()) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const gestureClips = getGestureClips(store.document, ids);
      gestureRef.current = {
        pointerId: event.pointerId,
        clipIds: ids,
        primaryClipId: clip.id,
        action,
        startClientX: event.clientX,
        startClientY: event.clientY,
        appliedDelta: 0,
        appliedTrackSteps: 0,
        initialSnapEdges:
          action === 'move'
            ? gestureClips.flatMap(current => [
                current.timelineStart,
                current.timelineStart + current.timelineDuration,
              ])
            : [
                action === 'trim-end'
                  ? clip.timelineStart + clip.timelineDuration
                  : clip.timelineStart,
              ],
      };
      setError(null);
    },
    [reportFailure, store]
  );

  const updateGesture = useCallback(
    (event: React.PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const primary = store.document.sequence.clips[gesture.primaryClipId];
      if (!primary) return;
      if (gesture.action === 'move') {
        const desiredTrackSteps = Math.round(
          (event.clientY - gesture.startClientY) / TRACK_HEIGHT
        );
        while (gesture.appliedTrackSteps !== desiredTrackSteps) {
          const direction =
            desiredTrackSteps > gesture.appliedTrackSteps ? 1 : -1;
          if (
            !store.previewTransaction(
              createMoveClipsToAdjacentTrackCommand(gesture.clipIds, direction)
            )
          ) {
            break;
          }
          gesture.appliedTrackSteps += direction;
        }
      }
      let totalDelta = Math.round(
        (event.clientX - gesture.startClientX) / pixelsPerTick
      );
      if (workspace.snappingEnabled) {
        const movingClips = getGestureClips(store.document, gesture.clipIds);
        const closest = solveBoundarySnap({
          project: store.document,
          boundaryTicks: gesture.initialSnapEdges,
          deltaTicks: totalDelta,
          pixelsPerTick,
          pixelThreshold: SNAP_THRESHOLD_PIXELS,
          playheadTick,
          excludeClipIds: new Set(movingClips.map(clip => clip.id)),
        });
        if (closest) {
          totalDelta = closest.deltaTicks;
          setSnapGuide(closest.snap.guide ?? null);
        } else {
          setSnapGuide(null);
        }
      }
      const incrementalDelta = totalDelta - gesture.appliedDelta;
      if (incrementalDelta !== 0) {
        const command =
          gesture.action === 'move'
            ? createMoveClipsCommand(gesture.clipIds, incrementalDelta)
            : createTrimClipsCommand(
                gesture.clipIds,
                gesture.action === 'trim-start' ? 'start' : 'end',
                incrementalDelta,
                workspace.rippleEnabled
              );
        if (store.previewTransaction(command))
          gesture.appliedDelta = totalDelta;
      }
      const scroll = scrollRef.current;
      if (!scroll) return;
      const bounds = scroll.getBoundingClientRect();
      if (event.clientX > bounds.right - 32) {
        setAutoScrollDirection(1);
        return;
      }
      if (event.clientX < bounds.left + 32) {
        setAutoScrollDirection(-1);
        return;
      }
      setAutoScrollDirection(0);
    },
    [
      pixelsPerTick,
      playheadTick,
      setAutoScrollDirection,
      store,
      workspace.rippleEnabled,
      workspace.snappingEnabled,
    ]
  );

  const finishGesture = useCallback(
    (event: React.PointerEvent, cancel: boolean) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      stopAutoScroll();
      setSnapGuide(null);
      if (
        cancel ||
        (gesture.appliedDelta === 0 && gesture.appliedTrackSteps === 0)
      ) {
        store.cancelTransaction();
        return;
      }
      store.commitTransaction(
        `timeline.${gesture.action}`,
        gesture.action === 'move' ? 'Move clips' : 'Trim clips'
      );
      onWorkspaceCommit();
    },
    [onWorkspaceCommit, stopAutoScroll, store]
  );

  const createTransition = useCallback(
    (type: 'video-cross-dissolve' | 'audio-crossfade') => {
      if (
        store.selection.kind !== 'clips' ||
        store.selection.clipIds.length !== 2
      ) {
        reportFailure('Select two adjacent clips on one track');
        return;
      }
      const clips = store.selection.clipIds
        .map(id => store.document.sequence.clips[id])
        .sort((left, right) => left.timelineStart - right.timelineStart);
      const [from, to] = clips;
      const durationTicks = Math.max(
        frameTicks * 2,
        Math.round(store.document.timebase.ticksPerSecond / 2)
      );
      run(
        createValidatedTransitionCommand({
          id: crypto.randomUUID(),
          type,
          trackId: from.trackId,
          fromClipId: from.id,
          toClipId: to.id,
          cutTick: from.timelineStart + from.timelineDuration,
          durationTicks,
          alignment: 'center',
        }),
        'The selected clips are not transition-compatible or lack source handles'
      );
    },
    [frameTicks, reportFailure, run, store.document, store.selection]
  );

  const changeSelectedTransitionDuration = useCallback(
    (direction: -1 | 1) => {
      if (store.selection.kind !== 'transition') return;
      const transition =
        store.document.sequence.transitions[store.selection.transitionId];
      if (!transition) return;
      run(
        createChangeTransitionDurationCommand(
          transition.id,
          transition.durationTicks + direction * frameTicks
        ),
        'The selected transition duration could not be changed'
      );
    },
    [frameTicks, run, store.document, store.selection]
  );

  const createFadeBlack = useCallback(
    (edge: 'in' | 'out') => {
      if (
        store.selection.kind !== 'clips' ||
        store.selection.clipIds.length !== 1
      ) {
        reportFailure('Select one video or image clip');
        return;
      }
      const clip = store.document.sequence.clips[store.selection.primaryClipId];
      if (!clip || clip.kind === 'audio') {
        reportFailure('Fade to black requires a video or image clip');
        return;
      }
      run(
        createValidatedTransitionCommand({
          id: crypto.randomUUID(),
          type: 'video-fade-black',
          trackId: clip.trackId,
          clipId: clip.id,
          edge,
          durationTicks: Math.min(
            Math.round(store.document.timebase.ticksPerSecond / 2),
            clip.timelineDuration
          ),
        }),
        'The fade could not be added to this clip edge'
      );
    },
    [reportFailure, run, store.document, store.selection]
  );

  return (
    <section
      aria-label="Timeline"
      tabIndex={0}
      className="bg-card flex h-full flex-col outline-none"
      onKeyDown={onKeyDown}
      onPointerMove={updateGesture}
      onPointerUp={event => finishGesture(event, false)}
      onPointerCancel={event => finishGesture(event, true)}
    >
      <TimelineToolbar
        canPlace={Boolean(placementAssetId)}
        canEditClips={clipIds.length > 0}
        hasSelection={store.selection.kind !== 'none'}
        snappingEnabled={workspace.snappingEnabled}
        rippleEnabled={workspace.rippleEnabled}
        canEditTransition={store.selection.kind === 'transition'}
        onAddTrack={addTrack}
        onPlace={placeSelectedAsset}
        onSplit={splitSelection}
        onDelete={deleteSelection}
        onToggleSnapping={() =>
          void registry
            .find(command => command.id === 'edit.toggle-snapping')
            ?.execute()
        }
        onToggleRipple={() =>
          void registry
            .find(command => command.id === 'edit.toggle-ripple')
            ?.execute()
        }
        onCreateTransition={createTransition}
        onCreateFade={createFadeBlack}
        onChangeTransitionDuration={changeSelectedTransitionDuration}
        onZoomOut={() => setZoom(workspace.timeline.zoom / 1.25)}
        onZoomFit={fitTimeline}
        onZoomIn={() => setZoom(workspace.timeline.zoom * 1.25)}
        onCollapse={onCollapse}
      />
      {error ? (
        <div
          role="status"
          className="text-destructive border-border border-b px-3 py-1 text-xs"
        >
          {error}
        </div>
      ) : null}
      <TimelineTrackArea
        project={store.document}
        selection={store.selection}
        orderedTrackIds={orderedTrackIds}
        selectedClipIds={clipIds}
        statuses={statuses}
        duration={duration}
        pixelsPerTick={pixelsPerTick}
        timelineWidth={timelineWidth}
        playheadTick={playheadTick}
        snapGuide={snapGuide}
        frameTicks={frameTicks}
        scrollRef={scrollRef}
        onScrollTickChange={scrollTick => {
          onWorkspaceChange(current => ({
            ...current,
            timeline: { ...current.timeline, scrollTick },
          }));
          onWorkspaceCommit();
        }}
        onPlayheadChange={onPlayheadChange}
        onTrackSelect={trackId => {
          preferredTrackIdRef.current = trackId;
          store.setSelection({ kind: 'track', trackId });
        }}
        onTrackToggleLock={trackId => {
          const track = store.document.sequence.tracks[trackId];
          run(
            createUpdateTrackCommand(trackId, { locked: !track.locked }),
            'The track lock could not be changed'
          );
        }}
        onTrackToggleOutput={trackId => {
          const track = store.document.sequence.tracks[trackId];
          run(
            createUpdateTrackCommand(
              trackId,
              track.kind === 'video'
                ? { visible: !track.visible }
                : { muted: !track.muted }
            ),
            'The track output could not be changed'
          );
        }}
        onTrackToggleSolo={trackId => {
          const track = store.document.sequence.tracks[trackId];
          if (track.kind !== 'audio') return;
          run(
            createUpdateTrackCommand(trackId, { solo: !track.solo }),
            'Solo could not be changed'
          );
        }}
        onTrackMove={(trackId, targetIndex) =>
          run(
            createReorderTrackCommand(trackId, targetIndex),
            'The track could not be reordered'
          )
        }
        onClipSelect={updateClipSelection}
        onClipGestureStart={beginGesture}
        onTransitionSelect={transitionId =>
          store.setSelection({ kind: 'transition', transitionId })
        }
        onTransitionExtend={(transitionId, durationTicks) =>
          run(
            createChangeTransitionDurationCommand(transitionId, durationTicks),
            'The transition duration could not be extended'
          )
        }
      />
    </section>
  );
}
