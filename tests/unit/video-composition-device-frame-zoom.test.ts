import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderDeviceFrameMock = vi.hoisted(() =>
  vi.fn((ctx: { currentScale: number }) => ctx.currentScale)
);

vi.mock(
  '../../src/renderer/components/video-editor/composition/device-frame-canvas-renderer',
  () => ({
    calculateDeviceFrameLayout: () => ({
      frameWidth: 1040,
      frameHeight: 2040,
      screenX: 20,
      screenY: 20,
      screenWidth: 1000,
      screenHeight: 2000,
      screenCornerRadius: 56,
    }),
    renderDeviceFrame: renderDeviceFrameMock,
  })
);

import { VideoCompositionEngine } from '../../src/renderer/components/video-editor/composition/video-composition-engine';
import type { Segment } from '../../src/renderer/components/video-editor/types';
import type { VideoWallpaperSettings } from '../../src/types/video-wallpaper';

interface MockContext {
  translateCalls: Array<[number, number]>;
  currentScale: number;
  scaleStack: number[];
  save: () => void;
  restore: () => void;
  clearRect: (...args: number[]) => void;
  beginPath: () => void;
  roundRect: (...args: number[]) => void;
  clip: () => void;
  drawImage: (...args: unknown[]) => void;
  scale: (x: number, y: number) => void;
  createLinearGradient: () => { addColorStop: () => void };
  fillRect: (...args: number[]) => void;
  translate: (x: number, y: number) => void;
}

function createMockContext(): MockContext {
  return {
    translateCalls: [],
    currentScale: 1,
    scaleStack: [],
    save: function () {
      this.scaleStack.push(this.currentScale);
    },
    restore: function () {
      this.currentScale = this.scaleStack.pop() ?? 1;
    },
    clearRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    clip: () => {},
    drawImage: () => {},
    scale: function (x: number) {
      this.currentScale *= x;
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    translate: function (x: number, y: number) {
      this.translateCalls.push([x, y]);
    },
  };
}

describe('VideoCompositionEngine device frame zoom', () => {
  beforeEach(() => {
    renderDeviceFrameMock.mockClear();
  });

  it('applies the video zoom transform to the device frame', () => {
    const wallpaper: VideoWallpaperSettings = {
      enabled: true,
      gradient: null,
      backgroundImage: null,
      padding: 50,
      corners: 0,
      shadow: 0,
      aspectRatio: null,
      deviceFrame: true,
    };

    const segments: Segment[] = [
      {
        id: 'segment-1',
        originalStart: 0,
        originalEnd: 10,
        trimMinStart: 0,
        trimMaxEnd: 10,
      },
    ];

    const engine = new VideoCompositionEngine({
      videoWidth: 1000,
      videoHeight: 2000,
      segments,
      wallpaper,
      zoomSegments: [
        {
          id: 'zoom-1',
          startTime: 0,
          endTime: 4,
          zoomLevel: 2,
        },
      ],
      zoomSettings: {
        transitionInDuration: 1,
        transitionOutDuration: 1,
        easing: 'ease-in-out',
      },
    });

    const ctx = createMockContext();

    engine.renderFrame(
      ctx as unknown as CanvasRenderingContext2D,
      1,
      { video: {} as HTMLCanvasElement },
      { fps: 60 }
    );

    expect(ctx.translateCalls[0]).toEqual([50, 50]);
    expect(renderDeviceFrameMock).toHaveBeenCalledOnce();
    expect(renderDeviceFrameMock.mock.calls[0]?.slice(2, 4)).toEqual([0, 0]);
    expect(renderDeviceFrameMock.mock.results[0]?.value).toBe(2);
  });
});
