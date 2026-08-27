import { useMemo } from 'react';
import { formatTime } from '../utils';
import { useTimeline } from './use-timeline';
import { getMarkInterval } from './ruler-scale';

interface TimelineRulerProps {
  totalDuration: number;
  minDisplayDuration?: number;
}

export default function TimelineRuler({
  totalDuration,
  minDisplayDuration,
}: TimelineRulerProps) {
  const { pixelsPerSecond, scrollContainerRef } = useTimeline();

  const marks = useMemo(() => {
    if (totalDuration === 0) return [];

    const interval = getMarkInterval(pixelsPerSecond);
    const result: { time: number; position: number }[] = [];

    for (let time = 0; time <= totalDuration; time += interval) {
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
    <div className="flex h-7 shrink-0 border-b pt-1">
      <div className="w-10 shrink-0" />
      <div
        ref={scrollContainerRef}
        className="scrollbar-hide relative flex-1 overflow-x-auto overflow-y-hidden"
        onScroll={e => {
          const scrollLeft = e.currentTarget.scrollLeft;
          const tracksContainer = document.querySelector(
            '[data-timeline-tracks]'
          );
          if (tracksContainer) {
            tracksContainer.scrollLeft = scrollLeft;
          }
        }}
      >
        <div className="relative h-full" style={{ width: `${totalWidth}px` }}>
          {marks.map(mark => {
            const isFirst = mark.time === 0;
            return (
              <div
                key={mark.time}
                className={`absolute top-0 flex h-full flex-col ${isFirst ? 'items-start' : 'items-center'}`}
                style={{
                  left: `${mark.position}px`,
                  transform: isFirst ? 'none' : 'translateX(-50%)',
                }}
              >
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatTime(mark.time)}
                </span>
                <div className="bg-muted-foreground/40 mt-0.5 h-1.5 w-px" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
