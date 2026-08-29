import { getEqualizerLayoutSettings } from './equalizer-layout';
import type { EqualizerSettings } from '@/types/equalizer';
import { EQUALIZER_MIN_HEIGHT, EQUALIZER_MIN_WIDTH } from '@/types/equalizer';

export type EqualizerGestureMode =
  | 'move'
  | 'north'
  | 'north-west'
  | 'north-east'
  | 'east'
  | 'south'
  | 'south-west'
  | 'south-east'
  | 'west';

export interface EqualizerGestureGeometry {
  mode: EqualizerGestureMode;
  startX: number;
  startY: number;
  parentWidth: number;
  parentHeight: number;
  settings: EqualizerSettings;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const MINIMUM_VISIBLE_RATIO = 0.1;

function getDominantDelta(first: number, second: number): number {
  return Math.abs(first) >= Math.abs(second) ? first : second;
}

function clampOverlayPosition(position: number, size: number): number {
  return clamp(
    position,
    -size * (1 - MINIMUM_VISIBLE_RATIO),
    1 - size * MINIMUM_VISIBLE_RATIO
  );
}

function clampOverlayGeometry(settings: EqualizerSettings): EqualizerSettings {
  return {
    ...settings,
    x: clampOverlayPosition(settings.x, settings.width),
    y: clampOverlayPosition(settings.y, settings.height),
  };
}

function getResizeMaximum(initialSize: number, ...limits: number[]): number {
  return Math.max(initialSize, Math.min(...limits));
}

function updateCircularEqualizer(
  initial: EqualizerSettings,
  mode: Exclude<EqualizerGestureMode, 'move'>,
  deltaX: number,
  deltaY: number,
  parentWidth: number,
  parentHeight: number
): EqualizerSettings {
  const left = initial.x * parentWidth;
  const top = initial.y * parentHeight;
  const initialSide = initial.width * parentWidth;
  const right = left + initialSide;
  const bottom = top + initialSide;
  const centerX = left + initialSide / 2;
  const centerY = top + initialSide / 2;
  const minimumSide = Math.min(
    EQUALIZER_MIN_WIDTH * parentWidth,
    EQUALIZER_MIN_HEIGHT * parentHeight
  );

  let nextLeft = left;
  let nextTop = top;
  let side = initialSide;

  switch (mode) {
    case 'north': {
      const maximumSide = getResizeMaximum(
        initialSide,
        bottom,
        centerX * 2,
        (parentWidth - centerX) * 2
      );
      side = clamp(initialSide - deltaY, minimumSide, maximumSide);
      nextLeft = centerX - side / 2;
      nextTop = bottom - side;
      break;
    }
    case 'north-west': {
      const maximumSide = getResizeMaximum(initialSide, right, bottom);
      side = clamp(
        initialSide + getDominantDelta(-deltaX, -deltaY),
        minimumSide,
        maximumSide
      );
      nextLeft = right - side;
      nextTop = bottom - side;
      break;
    }
    case 'north-east': {
      const maximumSide = getResizeMaximum(
        initialSide,
        parentWidth - left,
        bottom
      );
      side = clamp(
        initialSide + getDominantDelta(deltaX, -deltaY),
        minimumSide,
        maximumSide
      );
      nextTop = bottom - side;
      break;
    }
    case 'east': {
      const maximumSide = getResizeMaximum(
        initialSide,
        parentWidth - left,
        centerY * 2,
        (parentHeight - centerY) * 2
      );
      side = clamp(initialSide + deltaX, minimumSide, maximumSide);
      nextTop = centerY - side / 2;
      break;
    }
    case 'south': {
      const maximumSide = getResizeMaximum(
        initialSide,
        parentHeight - top,
        centerX * 2,
        (parentWidth - centerX) * 2
      );
      side = clamp(initialSide + deltaY, minimumSide, maximumSide);
      nextLeft = centerX - side / 2;
      break;
    }
    case 'south-west': {
      const maximumSide = getResizeMaximum(
        initialSide,
        right,
        parentHeight - top
      );
      side = clamp(
        initialSide + getDominantDelta(-deltaX, deltaY),
        minimumSide,
        maximumSide
      );
      nextLeft = right - side;
      break;
    }
    case 'south-east': {
      const maximumSide = getResizeMaximum(
        initialSide,
        parentWidth - left,
        parentHeight - top
      );
      side = clamp(
        initialSide + getDominantDelta(deltaX, deltaY),
        minimumSide,
        maximumSide
      );
      break;
    }
    case 'west': {
      const maximumSide = getResizeMaximum(
        initialSide,
        right,
        centerY * 2,
        (parentHeight - centerY) * 2
      );
      side = clamp(initialSide - deltaX, minimumSide, maximumSide);
      nextLeft = right - side;
      nextTop = centerY - side / 2;
      break;
    }
  }

  return clampOverlayGeometry({
    ...initial,
    x: nextLeft / parentWidth,
    y: nextTop / parentHeight,
    width: side / parentWidth,
    height: side / parentHeight,
  });
}

export function updateEqualizerForGesture(
  gesture: EqualizerGestureGeometry,
  clientX: number,
  clientY: number
): EqualizerSettings {
  const deltaX = (clientX - gesture.startX) / gesture.parentWidth;
  const deltaY = (clientY - gesture.startY) / gesture.parentHeight;
  const initial = getEqualizerLayoutSettings(
    gesture.settings,
    gesture.parentWidth,
    gesture.parentHeight
  );

  if (gesture.mode === 'move') {
    return clampOverlayGeometry({
      ...initial,
      x: initial.x + deltaX,
      y: initial.y + deltaY,
    });
  }

  if (initial.mode === 'circular') {
    return updateCircularEqualizer(
      initial,
      gesture.mode,
      clientX - gesture.startX,
      clientY - gesture.startY,
      gesture.parentWidth,
      gesture.parentHeight
    );
  }

  let x = initial.x;
  let y = initial.y;
  let width = initial.width;
  let height = initial.height;

  if (
    gesture.mode === 'west' ||
    gesture.mode === 'north-west' ||
    gesture.mode === 'south-west'
  ) {
    const nextX = clamp(
      initial.x + deltaX,
      Math.min(0, initial.x),
      initial.x + initial.width - EQUALIZER_MIN_WIDTH
    );
    width = initial.width + initial.x - nextX;
    x = nextX;
  }

  if (
    gesture.mode === 'east' ||
    gesture.mode === 'north-east' ||
    gesture.mode === 'south-east'
  ) {
    width = clamp(
      initial.width + deltaX,
      EQUALIZER_MIN_WIDTH,
      Math.max(initial.width, 1 - initial.x)
    );
  }

  if (
    gesture.mode === 'north' ||
    gesture.mode === 'north-west' ||
    gesture.mode === 'north-east'
  ) {
    const nextY = clamp(
      initial.y + deltaY,
      Math.min(0, initial.y),
      initial.y + initial.height - EQUALIZER_MIN_HEIGHT
    );
    height = initial.height + initial.y - nextY;
    y = nextY;
  }

  if (
    gesture.mode === 'south' ||
    gesture.mode === 'south-west' ||
    gesture.mode === 'south-east'
  ) {
    height = clamp(
      initial.height + deltaY,
      EQUALIZER_MIN_HEIGHT,
      Math.max(initial.height, 1 - initial.y)
    );
  }

  return clampOverlayGeometry({ ...initial, x, y, width, height });
}
