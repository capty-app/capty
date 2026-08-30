import React from 'react';
import { ChevronRight } from 'lucide-react';

import TimelineWaveform from './timeline-waveform';
import type { EditorClip, MediaAssetStatus } from '@/types/editor-v2';

interface TimelineClipProps {
  clip: EditorClip;
  status?: MediaAssetStatus;
  selected: boolean;
  tabIndex: number;
  pixelsPerTick: number;
  outputOffsetTicks: number;
  onSelect: (additive: boolean) => void;
  onNavigate: (direction: -1 | 1 | 'first' | 'last') => void;
  effectsExpanded: boolean;
  onEffectsToggle: () => void;
  onGestureStart: (
    event: React.PointerEvent,
    action: 'move' | 'trim-start' | 'trim-end'
  ) => void;
}

export default function TimelineClip({
  clip,
  status,
  selected,
  tabIndex,
  pixelsPerTick,
  outputOffsetTicks,
  onSelect,
  onNavigate,
  effectsExpanded,
  onEffectsToggle,
  onGestureStart,
}: TimelineClipProps) {
  const laneEffects = clip.effects.filter(effect =>
    ['zoom', 'annotation', 'subtitle', 'cursor', 'keyboard'].includes(
      effect.kind
    )
  );
  const left = (clip.timelineStart + outputOffsetTicks) * pixelsPerTick;
  const width = Math.max(8, clip.timelineDuration * pixelsPerTick);
  return (
    <div
      className={`absolute top-1 bottom-1 overflow-hidden rounded border text-left text-xs ${
        selected
          ? 'border-primary bg-primary/25 ring-primary ring-1'
          : 'border-border bg-secondary'
      }`}
      style={{ left, width }}
    >
      {status?.thumbnailUrl ? (
        <img
          src={status.thumbnailUrl}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-40"
        />
      ) : null}
      {status?.waveformUrl ? (
        <TimelineWaveform url={status.waveformUrl} />
      ) : null}
      <span className="relative block truncate px-2 py-1 font-medium">
        {clip.name}
      </span>
      <button
        type="button"
        tabIndex={tabIndex}
        aria-label={`${clip.name} clip`}
        data-timeline-clip-id={clip.id}
        aria-pressed={selected}
        className="focus-visible:ring-primary absolute inset-0 z-10 rounded outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onClick={event => onSelect(event.metaKey || event.shiftKey)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(event.metaKey || event.shiftKey);
            return;
          }
          const direction =
            event.key === 'ArrowLeft'
              ? -1
              : event.key === 'ArrowRight'
                ? 1
                : event.key === 'Home'
                  ? 'first'
                  : event.key === 'End'
                    ? 'last'
                    : null;
          if (direction === null) return;
          event.preventDefault();
          event.stopPropagation();
          onNavigate(direction);
        }}
        onPointerDown={event => onGestureStart(event, 'move')}
      />
      {laneEffects.length > 0 ? (
        <div className="absolute inset-x-1 bottom-0 z-20">
          <button
            type="button"
            aria-label={`${effectsExpanded ? 'Collapse' : 'Expand'} ${clip.name} effect lane`}
            aria-expanded={effectsExpanded}
            className="bg-background/80 flex h-4 max-w-full items-center gap-1 rounded px-1 text-xs"
            onClick={event => {
              event.stopPropagation();
              onEffectsToggle();
            }}
            onPointerDown={event => event.stopPropagation()}
          >
            <ChevronRight
              className={`size-3 transition-transform motion-reduce:transition-none ${effectsExpanded ? 'rotate-90' : ''}`}
            />
            {laneEffects.length}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label={`Trim start of ${clip.name}`}
        tabIndex={-1}
        className="bg-primary/70 absolute inset-y-0 left-0 z-20 w-1 cursor-ew-resize"
        onPointerDown={event => {
          event.stopPropagation();
          onGestureStart(event, 'trim-start');
        }}
      />
      <button
        type="button"
        aria-label={`Trim end of ${clip.name}`}
        tabIndex={-1}
        className="bg-primary/70 absolute inset-y-0 right-0 z-20 w-1 cursor-ew-resize"
        onPointerDown={event => {
          event.stopPropagation();
          onGestureStart(event, 'trim-end');
        }}
      />
    </div>
  );
}
