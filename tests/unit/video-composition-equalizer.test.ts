import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderEqualizer = vi.hoisted(() => vi.fn());

vi.mock(
  '@/renderer/components/video-editor/composition/equalizer-canvas-renderer',
  () => ({ renderEqualizer })
);

import { VideoCompositionEngine } from '@/renderer/components/video-editor/composition/video-composition-engine';
import type { CompositionConfig } from '@/renderer/components/video-editor/composition/types';
import type { EqualizerTrackData } from '@/types/equalizer';
import {
  DEFAULT_EQUALIZER_SETTINGS,
  EQUALIZER_ANALYSIS_VALUE_SCALE,
} from '@/types/equalizer';

const segments = [
  {
    id: 'segment-1',
    originalStart: 0,
    originalEnd: 10,
    trimMinStart: 0,
    trimMaxEnd: 10,
  },
];

const equalizerTracks: EqualizerTrackData[] = [
  {
    id: 'system-audio',
    volume: 1,
    enabled: true,
    startTime: 0,
    endTime: 10,
    trimStart: 0,
    speed: 1,
    analysis: {
      frameRate: 1,
      spectrumBandCount: 1,
      waveformPointCount: 1,
      duration: 2,
      frames: new Int8Array(
        [0.2, -0.3, 0.8, 0.7].map(value =>
          Math.round(value * EQUALIZER_ANALYSIS_VALUE_SCALE)
        )
      ),
    },
  },
];

function createConfig(): CompositionConfig {
  return {
    videoWidth: 1920,
    videoHeight: 1080,
    segments,
    wallpaper: null,
    equalizerSegments: [
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        id: 'equalizer-1',
        startTime: 0,
        endTime: 10,
        source: 'mix',
        sensitivity: 1,
      },
    ],
    equalizerTracks,
    fps: 10,
  };
}

function createContext(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: '#000000',
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => renderEqualizer.mockClear());

describe('VideoCompositionEngine equalizer', () => {
  it('produces identical equalizer frames for preview and export configs', () => {
    const source = {} as HTMLCanvasElement;
    const context = createContext();
    const previewEngine = new VideoCompositionEngine(createConfig());
    const exportEngine = new VideoCompositionEngine(createConfig());

    previewEngine.renderFrame(context, 1, { video: source }, { fps: 30 });
    const previewFrame = Array.from(
      renderEqualizer.mock.calls[0][1].frame.spectrum as Float32Array
    );
    renderEqualizer.mockClear();
    exportEngine.renderFrame(context, 1, { video: source }, { fps: 30 });
    const exportFrame = Array.from(
      renderEqualizer.mock.calls[0][1].frame.spectrum as Float32Array
    );

    expect(exportFrame).toEqual(previewFrame);
    expect(exportFrame[0]).toBeCloseTo(0.8);
  });

  it('renders the active clip settings at adjacent boundaries', () => {
    const config = createConfig();
    const first = config.equalizerSegments![0];
    config.equalizerSegments = [
      { ...first, id: 'bars', startTime: 0, endTime: 0.5, mode: 'spectrum' },
      {
        ...first,
        id: 'circle',
        startTime: 0.5,
        endTime: 2,
        mode: 'circular',
        colorStart: '#ff0000',
      },
    ];
    const engine = new VideoCompositionEngine(config);
    const context = createContext();
    const source = {} as HTMLCanvasElement;

    engine.renderFrame(context, 0.49, { video: source }, { fps: 30 });
    expect(renderEqualizer.mock.calls[0][1].settings.id).toBe('bars');

    renderEqualizer.mockClear();
    engine.renderFrame(context, 0.5, { video: source }, { fps: 30 });
    expect(renderEqualizer.mock.calls[0][1].settings).toMatchObject({
      id: 'circle',
      mode: 'circular',
      colorStart: '#ff0000',
    });
  });

  it('does not render outside equalizer clips', () => {
    const config = createConfig();
    config.equalizerSegments = [
      { ...config.equalizerSegments![0], startTime: 2, endTime: 4 },
    ];
    const engine = new VideoCompositionEngine(config);

    engine.renderFrame(createContext(), 1, { video: {} as HTMLCanvasElement });

    expect(renderEqualizer).not.toHaveBeenCalled();
  });

  it('starts equalizer timing after the configured first frame', () => {
    const config = createConfig();
    config.firstFrame = {
      enabled: true,
      imageData: 'data:image/png;base64,test',
      fit: 'cover',
    };
    const engine = new VideoCompositionEngine(config);
    const context = createContext();
    const source = {} as HTMLCanvasElement;

    engine.renderFrame(context, 0, { video: source }, { fps: 10 });
    expect(renderEqualizer).not.toHaveBeenCalled();

    engine.renderFrame(context, 1.1, { video: source }, { fps: 10 });
    expect(renderEqualizer).toHaveBeenCalledOnce();
    expect(renderEqualizer.mock.calls[0][1].frame.spectrum[0]).toBeCloseTo(0.8);
  });
});
