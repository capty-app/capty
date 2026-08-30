import React, { useCallback } from 'react';

interface DockResizerProps {
  orientation: 'horizontal' | 'vertical';
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onResize: (delta: number) => void;
  onResizeEnd: () => void;
}

export default function DockResizer({
  orientation,
  label,
  value,
  minimum,
  maximum,
  onResize,
  onResizeEnd,
}: DockResizerProps) {
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      let previous =
        orientation === 'horizontal' ? event.clientX : event.clientY;
      const handlePointerMove = (moveEvent: PointerEvent) => {
        const current =
          orientation === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        onResize(current - previous);
        previous = current;
      };
      const handlePointerUp = () => {
        target.removeEventListener('pointermove', handlePointerMove);
        target.removeEventListener('pointerup', handlePointerUp);
        target.removeEventListener('pointercancel', handlePointerUp);
        onResizeEnd();
      };
      target.addEventListener('pointermove', handlePointerMove);
      target.addEventListener('pointerup', handlePointerUp);
      target.addEventListener('pointercancel', handlePointerUp);
    },
    [onResize, onResizeEnd, orientation]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const isDecrease = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
      const isIncrease =
        event.key === 'ArrowRight' || event.key === 'ArrowDown';
      const isMinimum = event.key === 'Home';
      const isMaximum = event.key === 'End';
      if (!isDecrease && !isIncrease && !isMinimum && !isMaximum) return;
      event.preventDefault();
      const delta = isMinimum
        ? minimum - value
        : isMaximum
          ? maximum - value
          : isDecrease
            ? -16
            : 16;
      onResize(delta);
      onResizeEnd();
    },
    [maximum, minimum, onResize, onResizeEnd, value]
  );

  const className =
    orientation === 'horizontal'
      ? 'group bg-border hover:bg-primary focus-visible:bg-primary focus-visible:ring-primary relative w-px shrink-0 cursor-col-resize outline-none focus-visible:ring-2'
      : 'group bg-border hover:bg-primary focus-visible:bg-primary focus-visible:ring-primary relative h-px shrink-0 cursor-row-resize outline-none focus-visible:ring-2';

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={
        orientation === 'horizontal' ? 'vertical' : 'horizontal'
      }
      aria-valuenow={value}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuetext={`${value} pixels`}
      tabIndex={0}
      className={className}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    />
  );
}
