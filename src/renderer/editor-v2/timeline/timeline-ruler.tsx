import React, { useMemo } from 'react';

import { EDITOR_V2_TICKS_PER_SECOND } from '@/types/editor-v2';

interface TimelineRulerProps {
  durationTicks: number;
  pixelsPerTick: number;
  onSeek: (tick: number) => void;
}

const formatRulerTime = (tick: number): string => {
  const seconds = Math.floor(tick / EDITOR_V2_TICKS_PER_SECOND);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

export default function TimelineRuler({
  durationTicks,
  pixelsPerTick,
  onSeek,
}: TimelineRulerProps) {
  const width = Math.max(1, durationTicks * pixelsPerTick);
  const marks = useMemo(() => {
    const pixelsPerSecond = pixelsPerTick * EDITOR_V2_TICKS_PER_SECOND;
    const intervalSeconds =
      pixelsPerSecond >= 100 ? 1 : pixelsPerSecond >= 30 ? 5 : 10;
    const intervalTicks = intervalSeconds * EDITOR_V2_TICKS_PER_SECOND;
    const result: number[] = [];
    for (let tick = 0; tick <= durationTicks; tick += intervalTicks)
      result.push(tick);
    return result;
  }, [durationTicks, pixelsPerTick]);

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Timeline ruler"
      aria-valuemin={0}
      aria-valuemax={durationTicks}
      className="border-border bg-card relative h-7 border-b"
      style={{ width }}
      onPointerDown={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        onSeek(
          Math.max(0, Math.round((event.clientX - bounds.left) / pixelsPerTick))
        );
      }}
      onKeyDown={event => {
        if (event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        onSeek(event.key === 'Home' ? 0 : durationTicks);
      }}
    >
      {marks.map(tick => (
        <span
          key={tick}
          className="text-muted-foreground absolute top-0 h-full border-l px-1 font-mono text-xs"
          style={{ left: tick * pixelsPerTick }}
        >
          {formatRulerTime(tick)}
        </span>
      ))}
    </div>
  );
}
