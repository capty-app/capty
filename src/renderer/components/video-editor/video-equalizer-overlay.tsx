import { useCallback, useEffect, useRef } from 'react';
import { Grip } from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import { getEqualizerLayoutSettings } from './equalizer-layout';
import {
  updateEqualizerForGesture,
  type EqualizerGestureGeometry,
  type EqualizerGestureMode,
} from './equalizer-overlay-geometry';
import type { EqualizerSettings } from '@/types/equalizer';

interface VideoEqualizerOverlayProps {
  settings: EqualizerSettings;
  compositionWidth: number;
  compositionHeight: number;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onChange: (settings: EqualizerSettings) => void;
  onCommit: () => void;
}

interface GestureState extends EqualizerGestureGeometry {
  pointerId: number;
}

const HANDLE_POSITIONS: Array<{
  mode: Exclude<EqualizerGestureMode, 'move'>;
  className: string;
  cursor: string;
}> = [
  {
    mode: 'north',
    className: '-top-1 left-1/2 h-2 w-6 -translate-x-1/2 rounded-full',
    cursor: 'ns-resize',
  },
  {
    mode: 'east',
    className: 'top-1/2 -right-1 h-6 w-2 -translate-y-1/2 rounded-full',
    cursor: 'ew-resize',
  },
  {
    mode: 'south',
    className: '-bottom-1 left-1/2 h-2 w-6 -translate-x-1/2 rounded-full',
    cursor: 'ns-resize',
  },
  {
    mode: 'west',
    className: 'top-1/2 -left-1 h-6 w-2 -translate-y-1/2 rounded-full',
    cursor: 'ew-resize',
  },
  {
    mode: 'north-west',
    className: '-top-1.5 -left-1.5 size-3 rounded-full',
    cursor: 'nwse-resize',
  },
  {
    mode: 'north-east',
    className: '-top-1.5 -right-1.5 size-3 rounded-full',
    cursor: 'nesw-resize',
  },
  {
    mode: 'south-west',
    className: '-bottom-1.5 -left-1.5 size-3 rounded-full',
    cursor: 'nesw-resize',
  },
  {
    mode: 'south-east',
    className: '-right-1.5 -bottom-1.5 size-3 rounded-full',
    cursor: 'nwse-resize',
  },
];

export default function VideoEqualizerOverlay({
  settings,
  compositionWidth,
  compositionHeight,
  isSelected,
  onSelect,
  onDeselect,
  onChange,
  onCommit,
}: VideoEqualizerOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const layoutSettings = getEqualizerLayoutSettings(
    settings,
    compositionWidth,
    compositionHeight
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) onDeselect();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onDeselect]);

  const startGesture = useCallback(
    (event: React.PointerEvent<HTMLElement>, mode: EqualizerGestureMode) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect();

      const parent = rootRef.current?.parentElement;
      if (!parent) return;

      const bounds = parent.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;

      const gestureSettings = getEqualizerLayoutSettings(
        settings,
        bounds.width,
        bounds.height
      );
      event.currentTarget.setPointerCapture(event.pointerId);
      gestureRef.current = {
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        parentWidth: bounds.width,
        parentHeight: bounds.height,
        settings: gestureSettings,
      };
    },
    [onSelect, settings]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      onChange(
        updateEqualizerForGesture(gesture, event.clientX, event.clientY)
      );
    },
    [onChange]
  );

  const finishGesture = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      gestureRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onCommit();
    },
    [onCommit]
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute z-20 touch-none rounded-lg border',
        isSelected
          ? 'group border-white/80 bg-white/5 shadow-lg'
          : 'border-transparent'
      )}
      style={{
        left: `${layoutSettings.x * 100}%`,
        top: `${layoutSettings.y * 100}%`,
        width: `${layoutSettings.width * 100}%`,
        height: `${layoutSettings.height * 100}%`,
        cursor: 'move',
      }}
      onPointerDown={event => startGesture(event, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
    >
      {isSelected ? (
        <>
          <div className="absolute top-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Grip className="size-2.5" />
            Equalizer
          </div>
          {HANDLE_POSITIONS.map(handle => (
            <button
              key={handle.mode}
              type="button"
              aria-label={`Resize equalizer ${handle.mode}`}
              className={cn(
                'absolute border border-black/40 bg-white shadow-sm',
                handle.className
              )}
              style={{ cursor: handle.cursor }}
              onPointerDown={event => startGesture(event, handle.mode)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishGesture}
              onPointerCancel={finishGesture}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
