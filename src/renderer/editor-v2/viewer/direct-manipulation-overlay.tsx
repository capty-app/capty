import React, { useEffect, useRef, useState } from 'react';

import {
  createUpdateClipEffectCommand,
  createUpdateSequenceEffectCommand,
} from '@/editor-v2/commands/operations';
import { useEditorStore } from '../store/use-editor-store';
import type { Annotation } from '@/types/editor';
import type {
  AnnotationEffect,
  CameraLayoutEffect,
  TransformEffect,
  ZoomEffect,
} from '@/types/editor-v2';

type DirectEffect =
  | {
      clipId: string;
      effect: TransformEffect | CameraLayoutEffect | ZoomEffect;
    }
  | { effect: AnnotationEffect };

interface DirectManipulationOverlayProps {
  width: number;
  height: number;
}

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  effect: DirectEffect;
  mode:
    | 'position'
    | 'crop-start'
    | 'crop-end'
    | 'scale'
    | 'rotate'
    | 'draw'
    | 'redact';
  annotationId: string;
}

const findDirectEffect = (
  store: ReturnType<typeof useEditorStore>
): DirectEffect | null => {
  const selection = store.selection;
  if (selection.kind !== 'effect') return null;
  if (selection.clipId) {
    const effect = store.document.sequence.clips[
      selection.clipId
    ]?.effects.find(current => current.id === selection.effectId);
    if (
      effect?.kind === 'transform' ||
      effect?.kind === 'camera-layout' ||
      effect?.kind === 'zoom'
    ) {
      return { clipId: selection.clipId, effect };
    }
    return null;
  }
  const effect = store.document.sequence.effects.find(
    current => current.id === selection.effectId
  );
  return effect?.kind === 'annotation' ? { effect } : null;
};

const pointInCanvas = (
  event: React.PointerEvent,
  width: number,
  height: number
): { x: number; y: number } => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const renderedWidth = Math.max(1, bounds.width);
  const renderedHeight = Math.max(1, bounds.height);
  return {
    x: Math.min(
      width,
      Math.max(0, ((event.clientX - bounds.left) / renderedWidth) * width)
    ),
    y: Math.min(
      height,
      Math.max(0, ((event.clientY - bounds.top) / renderedHeight) * height)
    ),
  };
};

const cameraPosition = (
  x: number,
  y: number,
  width: number,
  height: number
): CameraLayoutEffect['style']['position'] => {
  const horizontal =
    x < width / 3 ? 'left' : x > (width * 2) / 3 ? 'right' : 'center';
  const vertical =
    y < height / 3 ? 'top' : y > (height * 2) / 3 ? 'bottom' : 'middle';
  return `${vertical}-${horizontal}` as CameraLayoutEffect['style']['position'];
};

export default function DirectManipulationOverlay({
  width,
  height,
}: DirectManipulationOverlayProps) {
  const store = useEditorStore();
  const gestureRef = useRef<Gesture | null>(null);
  const [active, setActive] = useState(false);
  const [transformMode, setTransformMode] = useState<
    'position' | 'crop-start' | 'crop-end' | 'scale' | 'rotate'
  >('position');
  const [drawingMode, setDrawingMode] = useState<'draw' | 'redact'>('draw');
  const selected = findDirectEffect(store);
  const cancelTransaction = store.cancelTransaction;
  useEffect(
    () => () => {
      if (!gestureRef.current) return;
      gestureRef.current = null;
      cancelTransaction();
    },
    [cancelTransaction]
  );
  if (!selected) return null;

  const updateEffect = (target: DirectEffect) => {
    if ('clipId' in target) {
      return store.previewTransaction(
        createUpdateClipEffectCommand(
          target.clipId,
          target.effect.id,
          target.effect
        )
      );
    }
    return store.previewTransaction(
      createUpdateSequenceEffectCommand(target.effect.id, target.effect)
    );
  };

  const begin = (event: React.PointerEvent) => {
    if (event.button !== 0 || !store.beginTransaction()) return;
    const point = pointInCanvas(event, width, height);
    (event.currentTarget as HTMLElement).focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      effect: structuredClone(selected),
      mode:
        selected.effect.kind === 'annotation'
          ? drawingMode
          : selected.effect.kind === 'transform'
            ? event.altKey
              ? 'crop-start'
              : transformMode
            : 'position',
      annotationId: crypto.randomUUID(),
    };
    setActive(true);
  };

  const move = (event: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = pointInCanvas(event, width, height);
    const direct = gesture.effect;
    if ('clipId' in direct && direct.effect.kind === 'transform') {
      const deltaX = point.x - gesture.startX;
      const deltaY = point.y - gesture.startY;
      let value = direct.effect.value;
      switch (gesture.mode) {
        case 'crop-start':
          value = {
            ...value,
            cropLeft: Math.min(
              0.9,
              Math.max(0, value.cropLeft + deltaX / width)
            ),
            cropTop: Math.min(
              0.9,
              Math.max(0, value.cropTop + deltaY / height)
            ),
          };
          break;
        case 'crop-end':
          value = {
            ...value,
            cropRight: Math.min(
              0.9,
              Math.max(0, value.cropRight - deltaX / width)
            ),
            cropBottom: Math.min(
              0.9,
              Math.max(0, value.cropBottom - deltaY / height)
            ),
          };
          break;
        case 'scale': {
          const scale = Math.min(
            4,
            Math.max(0.1, value.scaleX + (deltaX / width) * 2)
          );
          value = { ...value, scaleX: scale, scaleY: scale };
          break;
        }
        case 'rotate':
          value = {
            ...value,
            rotationDegrees: Math.min(
              180,
              Math.max(-180, value.rotationDegrees + (deltaX / width) * 180)
            ),
          };
          break;
        default:
          value = {
            ...value,
            positionX: value.positionX + deltaX,
            positionY: value.positionY + deltaY,
          };
      }
      updateEffect({
        clipId: direct.clipId,
        effect: { ...direct.effect, value },
      });
      return;
    }
    if ('clipId' in direct && direct.effect.kind === 'camera-layout') {
      updateEffect({
        clipId: direct.clipId,
        effect: {
          ...direct.effect,
          style: {
            ...direct.effect.style,
            position: cameraPosition(point.x, point.y, width, height),
          },
        },
      });
      return;
    }
    if ('clipId' in direct && direct.effect.kind === 'zoom') {
      updateEffect({
        clipId: direct.clipId,
        effect: {
          ...direct.effect,
          target: 'manual',
          focusX: point.x / width,
          focusY: point.y / height,
        },
      });
      return;
    }
    if (!('clipId' in direct) && direct.effect.kind === 'annotation') {
      const bounds = {
        x: Math.min(gesture.startX, point.x),
        y: Math.min(gesture.startY, point.y),
        width: Math.abs(point.x - gesture.startX),
        height: Math.abs(point.y - gesture.startY),
      };
      const annotation: Annotation =
        gesture.mode === 'redact'
          ? {
              id: gesture.annotationId,
              type: 'redact',
              ...bounds,
              style: 'pixelate',
              intensity: 5,
            }
          : {
              id: gesture.annotationId,
              type: 'rectangle',
              ...bounds,
              stroke: '#ef4444',
              strokeWidth: 4,
            };
      updateEffect({
        effect: {
          ...direct.effect,
          annotations: [...direct.effect.annotations, annotation],
        },
      });
    }
  };

  const finish = (event: React.PointerEvent, cancel: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setActive(false);
    if (cancel) {
      store.cancelTransaction();
      return;
    }
    store.commitTransaction(
      'effect.direct-manipulation',
      'Directly edit effect'
    );
  };

  return (
    <div
      aria-label={`Directly edit ${selected.effect.kind}`}
      className="absolute inset-0 cursor-crosshair outline-none"
      role="application"
      tabIndex={0}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={event => finish(event, false)}
      onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => finish(event, true)}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !gestureRef.current) return;
        gestureRef.current = null;
        setActive(false);
        store.cancelTransaction();
      }}
    >
      {selected.effect.kind === 'transform' ? (
        <div className="bg-background/90 absolute top-5 right-5 z-10 flex rounded p-1 shadow">
          {(
            [
              ['position', 'Move'],
              ['crop-start', 'Crop Top/Left'],
              ['crop-end', 'Crop Bottom/Right'],
              ['scale', 'Scale'],
              ['rotate', 'Rotate'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={transformMode === mode}
              className={`rounded px-2 py-1 text-xs ${transformMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation();
                setTransformMode(mode);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {selected.effect.kind === 'annotation' ? (
        <div className="bg-background/90 absolute top-5 right-5 z-10 flex rounded p-1 shadow">
          {(
            [
              ['draw', 'Rectangle'],
              ['redact', 'Redact'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={drawingMode === mode}
              className={`rounded px-2 py-1 text-xs ${drawingMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.stopPropagation();
                setDrawingMode(mode);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={`border-primary pointer-events-none absolute inset-3 border ${
          active ? 'bg-primary/10' : 'border-dashed'
        }`}
      />
      <div className="bg-background/90 pointer-events-none absolute top-5 left-5 rounded px-2 py-1 text-xs">
        {selected.effect.kind === 'annotation'
          ? 'Drag to add a drawing region'
          : selected.effect.kind === 'transform'
            ? 'Drag to move. Option-drag to crop.'
            : 'Drag to update the selected effect'}
      </div>
    </div>
  );
}
