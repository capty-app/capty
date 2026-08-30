import React from 'react';

import TimelineClip from './timeline-clip';
import TimelineRuler from './timeline-ruler';
import TrackHeader from './track-header';
import type { SnapGuide } from '@/editor-v2/commands/snapping';
import type {
  EditorClip,
  EditorProjectV2,
  EditorSelection,
  MediaAssetStatus,
} from '@/types/editor-v2';

interface TimelineTrackAreaProps {
  project: EditorProjectV2;
  selection: EditorSelection;
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
  project,
  selection,
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
  onClipGestureStart,
  onTransitionSelect,
  onTransitionExtend,
}: TimelineTrackAreaProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="shrink-0" style={{ width: TRACK_HEADER_WIDTH }}>
        <div className="border-border text-muted-foreground flex h-7 items-center border-r border-b px-3 text-xs">
          Tracks
        </div>
        {orderedTrackIds.map(trackId => {
          const track = project.sequence.tracks[trackId];
          const order =
            track.kind === 'video'
              ? project.sequence.videoTrackIds
              : project.sequence.audioTrackIds;
          const index = order.indexOf(trackId);
          return (
            <TrackHeader
              key={trackId}
              track={track}
              canMoveUp={index > 0 && !track.locked}
              canMoveDown={index < order.length - 1 && !track.locked}
              onSelect={() => onTrackSelect(trackId)}
              onToggleLock={() => onTrackToggleLock(trackId)}
              onToggleOutput={() => onTrackToggleOutput(trackId)}
              onToggleSolo={() => onTrackToggleSolo(trackId)}
              onMove={direction => onTrackMove(trackId, index + direction)}
            />
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
            height: orderedTrackIds.length * TRACK_HEIGHT,
          }}
        >
          {orderedTrackIds.map((trackId, rowIndex) => {
            const track = project.sequence.tracks[trackId];
            return (
              <div
                key={trackId}
                className="border-border bg-background/60 absolute right-0 left-0 border-b"
                style={{ top: rowIndex * TRACK_HEIGHT, height: TRACK_HEIGHT }}
                onPointerDown={event => {
                  if (event.target !== event.currentTarget) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onPlayheadChange(
                    Math.max(
                      0,
                      Math.round((event.clientX - bounds.left) / pixelsPerTick)
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
                      pixelsPerTick={pixelsPerTick}
                      onSelect={additive => onClipSelect(clipId, additive)}
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
                          transitionPosition(transition.id, project) *
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
            );
          })}
          {snapGuide ? (
            <div
              className="bg-primary pointer-events-none absolute top-0 bottom-0 z-20 w-px"
              style={{ left: snapGuide.tick * pixelsPerTick }}
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
