import { vi } from 'vitest';

export interface MockDisplay {
  id: number;
  workArea: { x: number; y: number; width: number; height: number };
}

export interface MockPoint {
  x: number;
  y: number;
}

export const DISPLAY_ONE: MockDisplay = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

export const DISPLAY_TWO: MockDisplay = {
  id: 2,
  workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
};

export const CURSOR_ON_ONE: MockPoint = { x: 10, y: 10 };
export const CURSOR_ON_TWO: MockPoint = { x: 2500, y: 10 };

export function displayNearestPoint(
  point: MockPoint,
  displays: MockDisplay[]
): MockDisplay {
  return (
    displays.find(
      display =>
        point.x >= display.workArea.x &&
        point.x < display.workArea.x + display.workArea.width
    ) ?? displays[0]
  );
}

export function createDaemonMock() {
  return {
    call: vi.fn(() => Promise.resolve(undefined)),
    onEvent: vi.fn(),
    offEvent: vi.fn(),
  };
}
