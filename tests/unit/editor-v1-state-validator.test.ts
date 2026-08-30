import { describe, expect, it } from 'vitest';
import { isValidV1EditorState } from '@/editor-v1/state-validator';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_ZOOM_SETTINGS } from '@/types/zoom';

const createState = (): Record<string, unknown> => ({
  version: 1,
  savedAt: '2026-08-30T00:00:00.000Z',
  segments: [
    {
      id: 'segment-1',
      originalStart: 0,
      originalEnd: 10,
    },
  ],
  cursorStyle: DEFAULT_CURSOR_STYLE,
  cameraStyle: DEFAULT_CAMERA_STYLE,
  keyboardStyle: DEFAULT_KEYBOARD_STYLE,
  zoomSegments: [],
  zoomSettings: DEFAULT_ZOOM_SETTINGS,
  ui: {
    sidebarOpen: true,
    sidebarTab: 'cursor',
  },
});

describe('V1 editor state validator characterization', () => {
  it.each([
    null,
    {},
    { ...createState(), version: 2 },
    { ...createState(), savedAt: 5 },
    { ...createState(), segments: null },
    { ...createState(), cursorStyle: null },
    { ...createState(), cameraStyle: null },
    { ...createState(), keyboardStyle: null },
    { ...createState(), zoomSegments: null },
    { ...createState(), zoomSettings: null },
    { ...createState(), ui: null },
  ])('rejects the current invalid envelope %#', value => {
    expect(isValidV1EditorState(value)).toBe(false);
  });

  it('accepts currently optional styles and persistence fields when absent', () => {
    expect(isValidV1EditorState(createState())).toBe(true);
  });

  it('accepts every current drawing annotation shape', () => {
    const state = createState();
    state.drawingSegments = [
      {
        id: 'drawing-1',
        startTime: 0,
        endTime: 3,
        canvasWidth: 1920,
        canvasHeight: 1080,
        annotations: [
          {
            id: 'pen',
            type: 'pen',
            points: [0, 0, 1, 1],
            stroke: '#fff',
            strokeWidth: 2,
          },
          {
            id: 'highlight',
            type: 'highlight',
            points: [0, 0, 1, 1],
            fill: '#ff0',
            opacity: 0.4,
            strokeWidth: 4,
          },
          {
            id: 'rectangle',
            type: 'rectangle',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            stroke: '#fff',
            strokeWidth: 2,
            fill: '#000',
          },
          {
            id: 'circle',
            type: 'circle',
            x: 5,
            y: 5,
            radius: 5,
            stroke: '#fff',
            strokeWidth: 2,
          },
          {
            id: 'line',
            type: 'line',
            points: [0, 0, 10, 10],
            stroke: '#fff',
            strokeWidth: 2,
          },
          {
            id: 'arrow',
            type: 'arrow',
            points: [0, 0, 10, 10],
            stroke: '#fff',
            strokeWidth: 2,
            arrowStyle: 'standard',
            bendOffset: { x: 1, y: 2 },
          },
          {
            id: 'text',
            type: 'text',
            x: 0,
            y: 0,
            text: 'Capty',
            fontSize: 24,
            fill: '#fff',
            fontFamily: 'sans',
            backgroundColor: '#000',
            backgroundOpacity: 0.5,
            backgroundPadding: { x: 4, y: 2 },
            backgroundRadius: 4,
            rotation: 0,
          },
          {
            id: 'number',
            type: 'number',
            x: 0,
            y: 0,
            value: 1,
            displayValue: '1',
            fill: '#fff',
            size: 'medium',
          },
          {
            id: 'redact',
            type: 'redact',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            style: 'pixelate',
            intensity: 5,
          },
        ],
      },
    ];

    expect(isValidV1EditorState(state)).toBe(true);
  });

  it('rejects the whole state when one drawing annotation is malformed', () => {
    const state = createState();
    state.drawingSegments = [
      {
        id: 'drawing-1',
        startTime: 0,
        endTime: 3,
        canvasWidth: 1920,
        canvasHeight: 1080,
        annotations: [{ id: 'line', type: 'line', points: [0, 1] }],
      },
    ];

    expect(isValidV1EditorState(state)).toBe(false);
  });

  it('preserves the current optional zoom fields', () => {
    const state = createState();
    state.zoomSettings = {
      ...DEFAULT_ZOOM_SETTINGS,
      followSmoothness: 0.2,
      lookAhead: 0.1,
    };
    state.zoomSegments = [
      {
        id: 'zoom-1',
        startTime: 0,
        endTime: 3,
        zoomLevel: 2,
        transitionInDuration: 0.5,
        transitionOutDuration: 0.75,
      },
    ];

    expect(isValidV1EditorState(state)).toBe(true);
  });
});
