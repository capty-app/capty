import { useMemo } from 'react';
import { useTimeline } from './use-timeline';
import { getMarkInterval } from './ruler-scale';
import { TIMELINE_H_PADDING } from './timeline-constants';

interface TimelineRulerProps {
  totalDuration: number;
  minDisplayDuration?: number;
}

function formatMark(seconds: number): string {
  if (seconds < 60) return `${Number(seconds.toFixed(2))}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export default function TimelineRuler({
  totalDuration,
  minDisplayDuration,
}: TimelineRulerProps) {
  const { pixelsPerSecond, rulerScrollRef, tracksScrollRef } = useTimeline();

  const marks = useMemo(() => {
    if (totalDuration === 0) return [];

    const interval = getMarkInterval(pixelsPerSecond);
    const result: { time: number; position: number }[] = [];

    for (let time = interval; time <= totalDuration; time += interval) {
      result.push({
        time,
        position: time * pixelsPerSecond,
      });
    }

    return result;
  }, [totalDuration, pixelsPerSecond]);

  const displayDuration = Math.max(totalDuration, minDisplayDuration ?? 0);
  const totalWidth = displayDuration * pixelsPerSecond;

  return (
    <div className="flex h-7 shrink-0">
      <div
        ref={rulerScrollRef}
        className="scrollbar-hide relative flex-1 overflow-x-auto overflow-y-hidden"
        onScroll={e => {
          if (tracksScrollRef.current) {
            tracksScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
      >
        <div
          className="relative h-full"
          style={{ width: `${totalWidth + TIMELINE_H_PADDING * 2}px` }}
        >
          {marks.map(mark => (
            <div
              key={mark.time}
              className="absolute top-1.5 flex -translate-x-1/2 flex-col items-center gap-1"
              style={{ left: `${TIMELINE_H_PADDING + mark.position}px` }}
            >
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatMark(mark.time)}
              </span>
              <span className="bg-muted-foreground/40 size-0.5 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
