import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calculateDeviceFrameLayout } from '@/editor-v2/timeline/device-frame-layout';
import { createLegacyCaptyEffectAdapter } from '@/renderer/editor-v2/composition/legacy-capty-effect-adapter';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
import type {
  ClipEffect,
  EditableDataLocator,
  EditorV2DataKind,
  EditorV2DataValue,
} from '@/types/editor-v2';
import type { FrameLayerPlan, SequenceEvaluation } from '@/editor-v2/timeline';

const {
  renderCamera,
  renderCursor,
  renderDeviceFrame,
  renderDrawings,
  renderKeyboard,
  renderSubtitle,
  getSubtitleBounds,
  calculateZoomTransform,
} = vi.hoisted(() => ({
  renderCamera: vi.fn(),
  renderCursor: vi.fn(),
  renderDeviceFrame: vi.fn(),
  renderDrawings: vi.fn(),
  renderKeyboard: vi.fn(),
  renderSubtitle: vi.fn(),
  getSubtitleBounds: vi.fn(() => ({ top: 900, bottom: 1000 })),
  calculateZoomTransform: vi.fn(() => ({
    scale: 2,
    translateX: -100,
    translateY: -50,
    viewport: { x: 0.2, y: 0.1, width: 0.5, height: 0.5 },
  })),
}));

vi.mock(
  '@/renderer/components/video-editor/composition/camera-canvas-renderer',
  () => ({ renderCamera })
);
vi.mock(
  '@/renderer/components/video-editor/composition/cursor-canvas-renderer',
  () => ({ renderCursor })
);
vi.mock(
  '@/renderer/components/video-editor/composition/device-frame-canvas-renderer',
  () => ({ renderDeviceFrame })
);
vi.mock(
  '@/renderer/components/video-editor/composition/drawing-canvas-renderer',
  () => ({ renderDrawings })
);
vi.mock(
  '@/renderer/components/video-editor/composition/keyboard-canvas-renderer',
  () => ({ renderKeyboard })
);
vi.mock(
  '@/renderer/components/video-editor/composition/subtitle-canvas-renderer',
  () => ({ getSubtitleBounds, renderSubtitle })
);
vi.mock(
  '@/renderer/components/video-editor/composition/zoom-canvas-renderer',
  () => ({ calculateZoomTransform })
);

const locator = (name: string): EditableDataLocator => ({
  kind: 'v1-read-only',
  relativePath: `${name}.json`,
  fingerprint: { byteLength: 100, sha256: name },
});

const cursorLocator = locator('cursor');
const keyboardLocator = locator('keyboard');
const subtitleLocator = locator('subtitles');
const { enabled: _cursorEnabled, ...cursorStyle } = DEFAULT_CURSOR_STYLE;
const { visible: _keyboardVisible, ...keyboardStyle } = DEFAULT_KEYBOARD_STYLE;
const { visible: _subtitleVisible, ...subtitleStyle } = DEFAULT_SUBTITLE_STYLE;
const { visible: _cameraVisible, ...cameraStyle } = DEFAULT_CAMERA_STYLE;

const overlayEffects: ClipEffect[] = [
  {
    id: 'zoom',
    kind: 'zoom',
    enabled: true,
    timeDomain: 'content-timeline',
    range: { start: 0, end: 180_000 },
    scale: 2,
    target: 'cursor',
    transitionInTicks: 0,
    transitionOutTicks: 0,
    followSmoothness: 0.1,
    lookAheadTicks: 0,
  },
  {
    id: 'cursor-effect',
    kind: 'cursor',
    enabled: true,
    timeDomain: 'asset-source',
    data: cursorLocator,
    style: cursorStyle,
  },
  {
    id: 'keyboard-effect',
    kind: 'keyboard',
    enabled: true,
    timeDomain: 'asset-source',
    data: keyboardLocator,
    style: keyboardStyle,
    sound: { enabled: true, volume: 0.7, type: 'cherry-blue' },
  },
  {
    id: 'subtitle-effect',
    kind: 'subtitle',
    enabled: true,
    timeDomain: 'asset-source',
    data: subtitleLocator,
    style: subtitleStyle,
  },
];

const transform = {
  positionX: 0,
  positionY: 0,
  scaleX: 1,
  scaleY: 1,
  rotationDegrees: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
};

const layer = (
  id: string,
  effects: readonly ClipEffect[],
  opacity = 1
): FrameLayerPlan => ({
  kind: 'media',
  origin: 'clip',
  layerId: id,
  clipId: id,
  assetId: 'recording',
  assetKind: 'capty-recording',
  sourceStreamId: 'screen',
  sourceTick: 45_000,
  trackId: 'video',
  trackOrder: 0,
  transform,
  opacity,
  effects,
});

const evaluation = (
  layers: SequenceEvaluation['layers'],
  deviceFrame = false
): SequenceEvaluation => ({
  outputTick: 45_000,
  contentTick: 45_000,
  preRollTicks: 0,
  layers,
  audio: { tick: 45_000, regions: [] },
  composition: {
    width: deviceFrame ? 2108 : 1960,
    height: deviceFrame ? 1267 : 1120,
    backgroundColor: '#000000',
    effects: [
      {
        id: 'canvas',
        kind: 'canvas-settings',
        enabled: true,
        width: 1920,
        height: 1080,
        backgroundColor: '#000000',
        aspectRatio: null,
      },
      {
        id: 'wallpaper',
        kind: 'wallpaper',
        enabled: true,
        background: { kind: 'none' },
        padding: 20,
        corners: 12,
        shadow: 100,
      },
      ...(deviceFrame
        ? ([
            {
              id: 'device',
              kind: 'device-frame',
              enabled: true,
              frame: 'ios-device',
            },
          ] as const)
        : []),
    ],
  },
});

const cursorData: Extract<EditorV2DataValue, { kind: 'cursor' }> = {
  kind: 'cursor',
  value: {
    recordingArea: { width: 1920, height: 1080 },
    events: [{ timestamp: 0.5, x: 0.1, y: 0.2, type: 'move' }],
    meta: {
      startTime: '2026-09-01T00:00:00.000Z',
      duration: 1,
      sampleRate: 60,
    },
  },
};

const data = async (
  kind: EditorV2DataKind
): Promise<EditorV2DataValue | null> => {
  if (kind === 'cursor') return cursorData;
  if (kind === 'keyboard') {
    return {
      kind: 'keyboard',
      value: {
        events: [
          {
            timestamp: 0.5,
            key: 'a',
            keyCode: 0,
            modifiers: [],
            type: 'down',
          },
        ],
        meta: {
          startTime: '2026-09-01T00:00:00.000Z',
          duration: 1,
          sampleRate: 60,
        },
      },
    };
  }
  return {
    kind: 'subtitles',
    value: {
      segments: [{ start: 0, end: 1, text: 'Hello' }],
      meta: {
        generatedAt: '2026-09-01T00:00:00.000Z',
        language: 'en',
        model: 'imported',
      },
    },
  };
};

const context = () =>
  ({
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
  }) as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('legacy Capty effect adapter', () => {
  it('uses source content bounds for V1-equivalent zoom transforms', async () => {
    const adapter = createLegacyCaptyEffectAdapter(data);
    const resolved = await adapter.resolveLayerTransform?.(
      layer('screen', overlayEffects),
      evaluation([layer('screen', overlayEffects)])
    );

    expect(calculateZoomTransform).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      cursorData.value,
      expect.any(Array),
      0.125,
      1920,
      1080,
      { fps: 60 }
    );
    expect(resolved).toMatchObject({
      scaleX: 2,
      scaleY: 2,
      positionX: 860,
      positionY: 490,
    });
  });

  it('deduplicates transition overlays and applies content zoom to cursor drawing', async () => {
    const adapter = createLegacyCaptyEffectAdapter(data);
    const currentEvaluation = evaluation([
      layer('outgoing', overlayEffects, 0.4),
      layer('incoming', overlayEffects, 0.6),
    ]);
    const canvasContext = context();

    await adapter.renderSequenceForeground?.({
      context: canvasContext,
      evaluation: currentEvaluation,
    });

    expect(renderSubtitle).toHaveBeenCalledTimes(1);
    expect(renderKeyboard).toHaveBeenCalledTimes(1);
    expect(renderCursor).toHaveBeenCalledTimes(1);
    expect(canvasContext.translate).toHaveBeenNthCalledWith(1, 20, 20);
    expect(canvasContext.scale).toHaveBeenCalledWith(2, 2);
    expect(renderCursor).toHaveBeenCalledWith(
      canvasContext,
      0.125,
      expect.objectContaining({
        videoWidth: 1920,
        videoHeight: 1080,
        offsetX: 0,
        offsetY: 0,
      })
    );
  });

  it('passes cursor and zoom context to camera rendering', async () => {
    const cameraEffect: ClipEffect = {
      id: 'camera',
      kind: 'camera-layout',
      enabled: true,
      style: cameraStyle,
    };
    const screen = layer('screen', overlayEffects);
    const camera = layer('camera', [cameraEffect]);
    const currentEvaluation = evaluation([screen, camera]);
    const adapter = createLegacyCaptyEffectAdapter(data);

    await expect(
      adapter.renderCameraLayer?.({
        context: context(),
        evaluation: currentEvaluation,
        layer: camera,
        source: {
          status: 'ready',
          source: {} as CanvasImageSource,
          width: 1280,
          height: 720,
        },
      })
    ).resolves.toBe(true);
    expect(renderCamera).toHaveBeenCalledWith(
      expect.anything(),
      0.125,
      expect.anything(),
      expect.objectContaining({
        cursorData: cursorData.value,
        videoWidth: 1960,
        videoHeight: 1120,
        zoomInfo: expect.objectContaining({ scale: 2 }),
      })
    );
  });

  it('omits device framing for semantic First Frame pre-roll', async () => {
    const preRoll: FrameLayerPlan = {
      kind: 'media',
      origin: 'pre-roll',
      layerId: 'pre-roll',
      preRollAssetId: 'first-frame',
      assetId: 'first-frame',
      assetKind: 'image',
      sourceTick: 0,
      fit: 'cover',
      trackId: 'pre-roll',
      trackOrder: -1,
      transform,
      opacity: 1,
      effects: [],
    };
    const adapter = createLegacyCaptyEffectAdapter(data);

    await expect(
      adapter.renderDeviceFramedLayer?.({
        context: context(),
        evaluation: evaluation([preRoll], true),
        layer: preRoll,
        source: {
          status: 'ready',
          source: {} as CanvasImageSource,
          width: 1920,
          height: 1080,
        },
      })
    ).resolves.toBe(false);
    expect(renderDeviceFrame).not.toHaveBeenCalled();
  });

  it('renders zoomed device framing in the same V1 transform context', async () => {
    const screen = layer('screen', overlayEffects);
    const currentEvaluation = evaluation([screen], true);
    const adapter = createLegacyCaptyEffectAdapter(data);
    const canvasContext = context();
    await expect(
      adapter.renderDeviceFramedLayer?.({
        context: canvasContext,
        evaluation: currentEvaluation,
        layer: screen,
        source: {
          status: 'ready',
          source: {} as CanvasImageSource,
          width: 1920,
          height: 1080,
        },
      })
    ).resolves.toBe(true);

    const frame = calculateDeviceFrameLayout(1920, 1080);
    expect(canvasContext.translate).toHaveBeenCalledWith(20, 20);
    expect(canvasContext.scale).toHaveBeenCalledWith(2, 2);
    expect(renderDeviceFrame).toHaveBeenCalledWith(canvasContext, frame, 0, 0, {
      blur: 25,
      opacity: 1 / 3,
      offsetY: 8,
    });
    expect({
      translations: vi.mocked(canvasContext.translate).mock.calls,
      scales: vi.mocked(canvasContext.scale).mock.calls,
      clips: vi.mocked(canvasContext.roundRect).mock.calls,
      draws: vi.mocked(canvasContext.drawImage).mock.calls,
      frameOffsets: renderDeviceFrame.mock.calls.map(
        ([, , offsetX, offsetY, shadow]) => ({ offsetX, offsetY, shadow })
      ),
    }).toMatchInlineSnapshot(`
      {
        "clips": [
          [
            15,
            15,
            1920,
            1080,
            49,
          ],
        ],
        "draws": [
          [
            {},
            15,
            15,
            1920,
            1080,
          ],
        ],
        "frameOffsets": [
          {
            "offsetX": 0,
            "offsetY": 0,
            "shadow": {
              "blur": 25,
              "offsetY": 8,
              "opacity": 0.3333333333333333,
            },
          },
        ],
        "scales": [
          [
            1,
            1,
          ],
          [
            2,
            2,
          ],
        ],
        "translations": [
          [
            995,
            575,
          ],
          [
            -995,
            -575,
          ],
          [
            20,
            20,
          ],
          [
            -50,
            -25,
          ],
        ],
      }
    `);
  });
});
