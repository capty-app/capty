import React, { useEffect, useState } from 'react';

import { getPreRollDuration } from '@/editor-v2/timeline/pre-roll';
import TimelineClip from './timeline-clip';
import TimelineRuler from './timeline-ruler';
import TrackHeader from './track-header';
import type { SnapGuide } from '@/editor-v2/commands/snapping';
import { EDITOR_V2_TICKS_PER_SECOND } from '@/types/editor-v2';
import type {
  ClipEffect,
  EditorClip,
  EditorProjectV2,
  EditorSelection,
  EditorV2DataValue,
  MediaAssetStatus,
  SerializedCommandBinding,
} from '@/types/editor-v2';

interface TimelineTrackAreaProps {
  projectToken: string;
  project: EditorProjectV2;
  selection: EditorSelection;
  commandBindings: readonly SerializedCommandBinding[];
  orderedTrackIds: string[];
  selectedClipIds: string[];
  statuses: Record<string, MediaAssetStatus>;
  duration: number;
  pixelsPerTick: number;
  timelineWidth: number;
  playheadTick: number;
  snapGuide: SnapGuide | null;
  frameTicks: number;
  scrollRef: React.RefObject<HTMLDivElement>;
  onScrollTickChange: (tick: number) => void;
  onPlayheadChange: (tick: number) => void;
  onTrackSelect: (trackId: string) => void;
  onTrackToggleLock: (trackId: string) => void;
  onTrackToggleOutput: (trackId: string) => void;
  onTrackToggleSolo: (trackId: string) => void;
  onTrackMove: (trackId: string, targetIndex: number) => void;
  onClipSelect: (clipId: string, additive: boolean) => void;
  onEffectSelect: (clipId: string, effectId: string) => void;
  onSequenceEffectSelect: (effectId: string) => void;
  onFirstFrameSelect: (assetId: string) => void;
  onClipGestureStart: (
    event: React.PointerEvent,
    clip: EditorClip,
    action: 'move' | 'trim-start' | 'trim-end'
  ) => void;
  onTransitionSelect: (transitionId: string) => void;
  onTransitionExtend: (transitionId: string, durationTicks: number) => void;
}

const TRACK_HEADER_WIDTH = 176;
const TRACK_HEIGHT = 48;
const EFFECT_LANE_HEIGHT = 32;
const CLIP_EFFECT_LANE_HEIGHT = 24;

type TimelineLaneEffect = Extract<
  ClipEffect,
  { kind: 'zoom' | 'annotation' | 'subtitle' | 'cursor' | 'keyboard' }
>;

const getTimelineLaneEffects = (clip: EditorClip): TimelineLaneEffect[] =>
  clip.effects.filter(
    (effect): effect is TimelineLaneEffect =>
      effect.kind === 'zoom' ||
      effect.kind === 'annotation' ||
      effect.kind === 'subtitle' ||
      effect.kind === 'cursor' ||
      effect.kind === 'keyboard'
  );

interface TimelineEffectItem {
  id: string;
  start: number;
  end: number;
}

const dataKindForEffect = (
  effect: TimelineLaneEffect
): 'cursor' | 'keyboard' | 'subtitles' | null => {
  switch (effect.kind) {
    case 'cursor':
      return 'cursor';
    case 'keyboard':
      return 'keyboard';
    case 'subtitle':
      return 'subtitles';
    default:
      return null;
  }
};

const sourceTickToOutputTick = (
  clip: EditorClip,
  sourceTick: number,
  contentOffsetTicks: number
): number =>
  contentOffsetTicks +
  clip.timelineStart +
  Math.round(
    ((sourceTick - clip.sourceStart) * clip.playbackRate.denominator) /
      clip.playbackRate.numerator
  );

const getDataEffectItems = (
  clip: EditorClip,
  effect: TimelineLaneEffect,
  data: EditorV2DataValue | null,
  contentOffsetTicks: number
): TimelineEffectItem[] => {
  if (!data) return [];
  const clipStart = contentOffsetTicks + clip.timelineStart;
  const clipEnd = clipStart + clip.timelineDuration;
  const createItem = (id: string, sourceStart: number, sourceEnd: number) => {
    const start = Math.max(
      clipStart,
      sourceTickToOutputTick(clip, sourceStart, contentOffsetTicks)
    );
    const end = Math.min(
      clipEnd,
      sourceTickToOutputTick(clip, sourceEnd, contentOffsetTicks)
    );
    return end >= clipStart && start < clipEnd
      ? { id, start, end: Math.max(start, end) }
      : null;
  };
  if (effect.kind === 'cursor' && data.kind === 'cursor') {
    return data.value.events
      .map((event, index) => {
        const tick = event.timestamp * EDITOR_V2_TICKS_PER_SECOND;
        return createItem(`cursor-${index}`, tick, tick);
      })
      .filter((item): item is TimelineEffectItem => item !== null);
  }
  if (effect.kind === 'keyboard' && data.kind === 'keyboard') {
    const duration = effect.style.displayDuration * EDITOR_V2_TICKS_PER_SECOND;
    return data.value.events
      .map((event, index) => {
        const start = event.timestamp * EDITOR_V2_TICKS_PER_SECOND;
        return createItem(`keyboard-${index}`, start, start + duration);
      })
      .filter((item): item is TimelineEffectItem => item !== null);
  }
  if (effect.kind === 'subtitle' && data.kind === 'subtitles') {
    return data.value.segments
      .map((segment, index) =>
        createItem(
          `subtitle-${index}`,
          segment.start * EDITOR_V2_TICKS_PER_SECOND,
          segment.end * EDITOR_V2_TICKS_PER_SECOND
        )
      )
      .filter((item): item is TimelineEffectItem => item !== null);
  }
  return [];
};

const transitionPosition = (
  transitionId: string,
  project: EditorProjectV2
): number => {
  const transition = project.sequence.transitions[transitionId];
  if (transition.type !== 'video-fade-black') return transition.cutTick;
  const clip = project.sequence.clips[transition.clipId];
  if (!clip) return 0;
  return transition.edge === 'in'
    ? clip.timelineStart
    : clip.timelineStart + clip.timelineDuration;
};

export default function TimelineTrackArea({
  projectToken,
  project,
  selection,
  commandBindings,
  orderedTrackIds,
  selectedClipIds,
  statuses,
  duration,
  pixelsPerTick,
  timelineWidth,
  playheadTick,
  snapGuide,
  frameTicks,
  scrollRef,
  onScrollTickChange,
  onPlayheadChange,
  onTrackSelect,
  onTrackToggleLock,
  onTrackToggleOutput,
  onTrackToggleSolo,
  onTrackMove,
  onClipSelect,
  onEffectSelect,
  onSequenceEffectSelect,
  onFirstFrameSelect,
  onClipGestureStart,
  onTransitionSelect,
  onTransitionExtend,
}: TimelineTrackAreaProps) {
  const sequenceLaneEffects = project.sequence.effects.filter(
    effect => effect.kind === 'annotation'
  );
  const preRollTicks = getPreRollDuration(project);
  const firstFrameLaneHeight = project.sequence.preRoll
    ? EFFECT_LANE_HEIGHT
    : 0;
  const drawingLaneHeight =
    sequenceLaneEffects.length > 0 ? EFFECT_LANE_HEIGHT : 0;
  const sequenceLaneHeight = firstFrameLaneHeight + drawingLaneHeight;
  const [expandedClipIds, setExpandedClipIds] = useState<Set<string>>(
    () => new Set()
  );
  const [effectData, setEffectData] = useState<
    Record<string, EditorV2DataValue | null>
  >({});
  const effectRowsByTrack = new Map<
    string,
    Array<{ clip: EditorClip; effect: TimelineLaneEffect }>
  >();
  for (const trackId of orderedTrackIds) {
    const track = project.sequence.tracks[trackId];
    const rows = track.clipIds.flatMap(clipId => {
      const clip = project.sequence.clips[clipId];
      return expandedClipIds.has(clipId)
        ? getTimelineLaneEffects(clip).map(effect => ({ clip, effect }))
        : [];
    });
    effectRowsByTrack.set(trackId, rows);
  }
  useEffect(() => {
    let active = true;
    const targets = Object.values(project.sequence.clips).flatMap(clip => {
      if (!expandedClipIds.has(clip.id)) return [];
      return getTimelineLaneEffects(clip).flatMap(effect => {
        const kind = dataKindForEffect(effect);
        if (!kind || !('data' in effect)) return [];
        return [{ key: `${clip.id}:${effect.id}`, kind, locator: effect.data }];
      });
    });
    if (targets.length === 0) {
      return () => {
        active = false;
      };
    }
    void Promise.all(
      targets.map(async target => ({
        key: target.key,
        result: await window.editorV2.readData({
          projectToken,
          kind: target.kind,
          locator: target.locator,
        }),
      }))
    ).then(results => {
      if (!active) return;
      setEffectData(current => {
        const next = { ...current };
        for (const { key, result } of results) {
          next[key] = result.status === 'loaded' ? result.data : null;
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [expandedClipIds, project, projectToken]);
  let nextTrackTop = sequenceLaneHeight;
  const trackLayouts = new Map<
    string,
    { top: number; height: number; effectRows: number }
  >();
  for (const trackId of orderedTrackIds) {
    const effectRows = effectRowsByTrack.get(trackId)?.length ?? 0;
    const height = TRACK_HEIGHT + effectRows * CLIP_EFFECT_LANE_HEIGHT;
    trackLayouts.set(trackId, { top: nextTrackTop, height, effectRows });
    nextTrackTop += height;
  }
  const toggleClipEffects = (clipId: string) => {
    setExpandedClipIds(current => {
      const next = new Set(current);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
  };
  const orderedClipIds = orderedTrackIds.flatMap(
    trackId => project.sequence.tracks[trackId].clipIds
  );
  const rovingClipId =
    selection.kind === 'clips' &&
    orderedClipIds.includes(selection.primaryClipId)
      ? selection.primaryClipId
      : orderedClipIds[0];
  const rovingTrackId =
    selection.kind === 'track' && orderedTrackIds.includes(selection.trackId)
      ? selection.trackId
      : orderedTrackIds[0];
  const navigateClip = (
    clipId: string,
    direction: -1 | 1 | 'first' | 'last'
  ) => {
    const currentIndex = orderedClipIds.indexOf(clipId);
    const targetIndex =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? orderedClipIds.length - 1
          : Math.min(
              orderedClipIds.length - 1,
              Math.max(0, currentIndex + direction)
            );
    const targetId = orderedClipIds[targetIndex];
    if (!targetId) return;
    onClipSelect(targetId, false);
    const targets = scrollRef.current?.querySelectorAll<HTMLElement>(
      '[data-timeline-clip-id]'
    );
    [...(targets ?? [])]
      .find(element => element.dataset.timelineClipId === targetId)
      ?.focus();
  };
  const navigateTrack = (trackId: string, direction: -1 | 1) => {
    const currentIndex = orderedTrackIds.indexOf(trackId);
    const targetId =
      orderedTrackIds[
        Math.min(
          orderedTrackIds.length - 1,
          Math.max(0, currentIndex + direction)
        )
      ];
    if (!targetId) return;
    onTrackSelect(targetId);
    [...document.querySelectorAll<HTMLElement>('[data-timeline-track-id]')]
      .find(element => element.dataset.timelineTrackId === targetId)
      ?.focus();
  };
  return (
    <div className="flex min-h-0 flex-1">
      <div className="shrink-0" style={{ width: TRACK_HEADER_WIDTH }}>
        <div className="border-border text-muted-foreground flex h-7 items-center border-r border-b px-3 text-xs">
          Tracks
        </div>
        {project.sequence.preRoll ? (
          <div className="border-border text-muted-foreground flex h-8 items-center border-r border-b px-3 text-xs">
            First Frame
          </div>
        ) : null}
        {sequenceLaneEffects.length > 0 ? (
          <div className="border-border text-muted-foreground flex h-8 items-center border-r border-b px-3 text-xs">
            Drawing Effects
          </div>
        ) : null}
        {orderedTrackIds.map(trackId => {
          const track = project.sequence.tracks[trackId];
          const order =
            track.kind === 'video'
              ? project.sequence.videoTrackIds
              : project.sequence.audioTrackIds;
          const index = order.indexOf(trackId);
          const rows = effectRowsByTrack.get(trackId) ?? [];
          return (
            <div key={trackId}>
              <TrackHeader
                track={track}
                tabIndex={trackId === rovingTrackId ? 0 : -1}
                selected={
                  selection.kind === 'track' && selection.trackId === trackId
                }
                commandBindings={commandBindings}
                canMoveUp={index > 0 && !track.locked}
                canMoveDown={index < order.length - 1 && !track.locked}
                onSelect={() => onTrackSelect(trackId)}
                onNavigate={direction => navigateTrack(trackId, direction)}
                onToggleLock={() => onTrackToggleLock(trackId)}
                onToggleOutput={() => onTrackToggleOutput(trackId)}
                onToggleSolo={() => onTrackToggleSolo(trackId)}
                onMove={direction => onTrackMove(trackId, index + direction)}
              />
              {rows.map(({ clip, effect }) => (
                <div
                  key={`${clip.id}:${effect.id}`}
                  className="border-border text-muted-foreground flex h-6 items-center gap-1 border-r border-b px-3 text-xs"
                >
                  <span className="truncate">{clip.name}</span>
                  <span className="shrink-0">{effect.kind}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-auto"
        onScroll={event =>
          onScrollTickChange(
            Math.max(
              0,
              Math.round(event.currentTarget.scrollLeft / pixelsPerTick)
            )
          )
        }
      >
        <TimelineRuler
          durationTicks={duration}
          pixelsPerTick={pixelsPerTick}
          onSeek={tick => onPlayheadChange(Math.min(duration, tick))}
        />
        <div
          className="relative"
          style={{
            width: timelineWidth,
            height: nextTrackTop,
          }}
        >
          {project.sequence.preRoll ? (
            <div
              aria-label="First Frame pre-roll lane"
              className="border-border bg-muted/30 absolute top-0 right-0 left-0 border-b"
              style={{ height: EFFECT_LANE_HEIGHT }}
            >
              <button
                type="button"
                aria-label="Select First Frame pre-roll"
                className={`bg-primary/20 border-primary absolute top-1 bottom-1 rounded border px-2 text-xs ${selection.kind === 'asset' && selection.assetId === project.sequence.preRoll.assetId ? 'ring-primary ring-2' : ''}`}
                style={{
                  left: 0,
                  width: Math.max(8, preRollTicks * pixelsPerTick),
                }}
                onClick={() =>
                  onFirstFrameSelect(project.sequence.preRoll!.assetId)
                }
              >
                First Frame
              </button>
            </div>
          ) : null}
          {sequenceLaneEffects.length > 0 ? (
            <div
              aria-label="Drawing effect lane"
              className="border-border bg-muted/30 absolute right-0 left-0 border-b"
              style={{
                top: firstFrameLaneHeight,
                height: EFFECT_LANE_HEIGHT,
              }}
            >
              {sequenceLaneEffects.map(effect => (
                <button
                  key={effect.id}
                  type="button"
                  aria-label={`Select drawing effect ${effect.id}`}
                  className={`bg-primary/20 border-primary absolute top-1 bottom-1 rounded border px-2 text-xs ${selection.kind === 'effect' && !selection.clipId && selection.effectId === effect.id ? 'ring-primary ring-2' : ''}`}
                  style={{
                    left: effect.range.start * pixelsPerTick,
                    width: Math.max(
                      8,
                      (effect.range.end - effect.range.start) * pixelsPerTick
                    ),
                  }}
                  onClick={() => onSequenceEffectSelect(effect.id)}
                >
                  Drawing
                </button>
              ))}
            </div>
          ) : null}
          {orderedTrackIds.map(trackId => {
            const track = project.sequence.tracks[trackId];
            const layout = trackLayouts.get(trackId);
            const effectRows = effectRowsByTrack.get(trackId) ?? [];
            if (!layout) return null;
            return (
              <React.Fragment key={trackId}>
                <div
                  className="border-border bg-background/60 absolute right-0 left-0 border-b"
                  style={{ top: layout.top, height: TRACK_HEIGHT }}
                  onPointerDown={event => {
                    if (event.target !== event.currentTarget) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    onPlayheadChange(
                      Math.max(
                        0,
                        Math.round(
                          (event.clientX - bounds.left) / pixelsPerTick
                        )
                      )
                    );
                  }}
                >
                  {track.clipIds.map(clipId => {
                    const clip = project.sequence.clips[clipId];
                    return (
                      <TimelineClip
                        key={clipId}
                        clip={clip}
                        status={statuses[clip.id]}
                        selected={selectedClipIds.includes(clipId)}
                        tabIndex={clipId === rovingClipId ? 0 : -1}
                        pixelsPerTick={pixelsPerTick}
                        outputOffsetTicks={preRollTicks}
                        effectsExpanded={expandedClipIds.has(clipId)}
                        onSelect={additive => onClipSelect(clipId, additive)}
                        onNavigate={direction =>
                          navigateClip(clipId, direction)
                        }
                        onEffectsToggle={() => toggleClipEffects(clipId)}
                        onGestureStart={(event, action) =>
                          onClipGestureStart(event, clip, action)
                        }
                      />
                    );
                  })}
                  {Object.values(project.sequence.transitions)
                    .filter(transition => transition.trackId === trackId)
                    .map(transition => (
                      <button
                        key={transition.id}
                        type="button"
                        aria-label={`Select ${transition.type} transition`}
                        className={`border-primary bg-primary/30 absolute top-1 bottom-1 z-10 w-2 -translate-x-1/2 border ${selection.kind === 'transition' && selection.transitionId === transition.id ? 'ring-primary ring-2' : ''}`}
                        style={{
                          left:
                            (transitionPosition(transition.id, project) +
                              preRollTicks) *
                            pixelsPerTick,
                        }}
                        onClick={event => {
                          event.stopPropagation();
                          onTransitionSelect(transition.id);
                        }}
                        onDoubleClick={() =>
                          onTransitionExtend(
                            transition.id,
                            transition.durationTicks + frameTicks
                          )
                        }
                      />
                    ))}
                </div>
                {effectRows.map(({ clip, effect }, effectIndex) => {
                  const dataKey = `${clip.id}:${effect.id}`;
                  const items =
                    effect.kind === 'zoom' || effect.kind === 'annotation'
                      ? [
                          {
                            id: effect.id,
                            start:
                              effect.range.start +
                              (effect.timeDomain === 'content-timeline'
                                ? preRollTicks
                                : 0),
                            end:
                              effect.range.end +
                              (effect.timeDomain === 'content-timeline'
                                ? preRollTicks
                                : 0),
                          },
                        ]
                      : getDataEffectItems(
                          clip,
                          effect,
                          effectData[dataKey] ?? null,
                          preRollTicks
                        );
                  return (
                    <div
                      key={dataKey}
                      aria-label={`${effect.kind} effect lane for ${clip.name}`}
                      className="border-border bg-muted/20 absolute right-0 left-0 border-b"
                      style={{
                        top:
                          layout.top +
                          TRACK_HEIGHT +
                          effectIndex * CLIP_EFFECT_LANE_HEIGHT,
                        height: CLIP_EFFECT_LANE_HEIGHT,
                      }}
                    >
                      {items.map((item, itemIndex) => (
                        <button
                          key={item.id}
                          type="button"
                          aria-label={
                            items.length === 1
                              ? `Select ${effect.kind} effect for ${clip.name}`
                              : `Select ${effect.kind} effect item ${itemIndex + 1} for ${clip.name}`
                          }
                          className={`bg-primary/20 border-primary absolute top-0.5 bottom-0.5 rounded border px-2 text-xs ${selection.kind === 'effect' && selection.clipId === clip.id && selection.effectId === effect.id ? 'ring-primary ring-2' : ''}`}
                          style={{
                            left: item.start * pixelsPerTick,
                            width: Math.max(
                              8,
                              (item.end - item.start) * pixelsPerTick
                            ),
                          }}
                          onClick={() => onEffectSelect(clip.id, effect.id)}
                        >
                          {effect.kind}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
          {snapGuide ? (
            <div
              className="bg-primary pointer-events-none absolute top-0 bottom-0 z-20 w-px"
              style={{ left: (snapGuide.tick + preRollTicks) * pixelsPerTick }}
            />
          ) : null}
          <button
            type="button"
            aria-label="Timeline playhead"
            className="bg-destructive absolute top-0 bottom-0 z-30 w-px cursor-ew-resize"
            style={{ left: playheadTick * pixelsPerTick }}
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              const bounds =
                event.currentTarget.parentElement?.getBoundingClientRect();
              if (!bounds) return;
              onPlayheadChange(
                Math.max(
                  0,
                  Math.min(
                    duration,
                    Math.round((event.clientX - bounds.left) / pixelsPerTick)
                  )
                )
              );
            }}
          >
            <span className="bg-destructive absolute top-0 left-1/2 size-2 -translate-x-1/2" />
          </button>
        </div>
      </div>
    </div>
  );
}
