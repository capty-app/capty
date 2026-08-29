import { describe, expect, it, vi } from 'vitest';
import {
  EQUALIZER_SPECTRUM_BANDS,
  EQUALIZER_WAVEFORM_POINTS,
  parseEqualizerVideoFrame,
} from '@/main/capture/video/equalizer-frame-parser';
import { renderEqualizer } from '@/renderer/components/video-editor/composition/equalizer-canvas-renderer';
import { sampleEqualizerFrame } from '@/renderer/components/video-editor/composition/equalizer-frame';
import { getEqualizerLayoutSettings } from '@/renderer/components/video-editor/equalizer-layout';
import {
  updateEqualizerForGesture,
  type EqualizerGestureMode,
} from '@/renderer/components/video-editor/equalizer-overlay-geometry';
import { getRequiredEqualizerTrackIds } from '@/renderer/components/video-editor/equalizer/audio-analysis';
import type {
  AudioAnalysisData,
  EqualizerSegment,
  EqualizerSettings,
  EqualizerTrackData,
} from '@/types/equalizer';
import {
  DEFAULT_EQUALIZER_SETTINGS,
  EQUALIZER_ANALYSIS_VALUE_SCALE,
  getActiveEqualizerSegment,
  isValidEqualizerSettings,
  migrateLegacyEqualizer,
} from '@/types/equalizer';
import type { MusicTrack } from '@/types/music';

const ANALYSIS_HEIGHT = 64;
const ANALYSIS_WIDTH = EQUALIZER_SPECTRUM_BANDS + EQUALIZER_WAVEFORM_POINTS;

function createAnalysis(frames: number[]): AudioAnalysisData {
  return {
    frameRate: 1,
    spectrumBandCount: 2,
    waveformPointCount: 2,
    duration: frames.length / 4,
    frames: new Int8Array(
      frames.map(value => Math.round(value * EQUALIZER_ANALYSIS_VALUE_SCALE))
    ),
  };
}

function createTrack(
  id: string,
  analysis: AudioAnalysisData,
  overrides: Partial<EqualizerTrackData> = {}
): EqualizerTrackData {
  return {
    id,
    volume: 1,
    enabled: true,
    startTime: 0,
    endTime: 10,
    trimStart: 0,
    speed: 1,
    analysis,
    ...overrides,
  };
}

function createSettings(
  overrides: Partial<EqualizerSettings> = {}
): EqualizerSettings {
  return {
    ...DEFAULT_EQUALIZER_SETTINGS,
    enabled: true,
    sensitivity: 1,
    ...overrides,
  };
}

describe('equalizer analysis frame parsing', () => {
  it('extracts spectrum bar heights and signed waveform points', () => {
    const source = new Uint8Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
    const target = new Int8Array(
      EQUALIZER_SPECTRUM_BANDS + EQUALIZER_WAVEFORM_POINTS
    );

    for (let y = 32; y < ANALYSIS_HEIGHT; y++) {
      source[y * ANALYSIS_WIDTH] = 255;
    }
    source[EQUALIZER_SPECTRUM_BANDS] = 255;
    source[
      (ANALYSIS_HEIGHT - 1) * ANALYSIS_WIDTH + EQUALIZER_SPECTRUM_BANDS + 1
    ] = 255;

    parseEqualizerVideoFrame(source, target, 0);

    expect(target[0] / EQUALIZER_ANALYSIS_VALUE_SCALE).toBeCloseTo(31 / 63);
    expect(target[1]).toBe(0);
    expect(target[EQUALIZER_SPECTRUM_BANDS]).toBe(
      EQUALIZER_ANALYSIS_VALUE_SCALE
    );
    expect(target[EQUALIZER_SPECTRUM_BANDS + 1]).toBe(
      -EQUALIZER_ANALYSIS_VALUE_SCALE
    );
  });

  it('preserves waveform amplitude when pixels span both sides of center', () => {
    const source = new Uint8Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
    const target = new Int8Array(
      EQUALIZER_SPECTRUM_BANDS + EQUALIZER_WAVEFORM_POINTS
    );
    const x = EQUALIZER_SPECTRUM_BANDS;

    for (let y = 5; y <= 58; y++) {
      source[y * ANALYSIS_WIDTH + x] = y < 32 ? 255 : 192;
    }

    parseEqualizerVideoFrame(source, target, 0);

    expect(
      target[EQUALIZER_SPECTRUM_BANDS] / EQUALIZER_ANALYSIS_VALUE_SCALE
    ).toBeGreaterThan(0.8);
  });

  it('writes parsed values at the requested target offset', () => {
    const source = new Uint8Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
    const valuesPerFrame = EQUALIZER_SPECTRUM_BANDS + EQUALIZER_WAVEFORM_POINTS;
    const target = new Int8Array(valuesPerFrame * 2).fill(95);

    parseEqualizerVideoFrame(source, target, valuesPerFrame);

    expect(target[0]).toBe(95);
    expect(target[valuesPerFrame]).toBe(0);
  });
});

describe('equalizer frame sampling', () => {
  const analysis = createAnalysis([0.2, 0.4, -0.5, 0.5, 0.6, 0.8, -1, 1]);

  it('maps timeline time through track trim and speed', () => {
    const track = createTrack('mic', analysis, {
      startTime: 2,
      endTime: 4,
      trimStart: 0.25,
      speed: 2,
    });

    const frame = sampleEqualizerFrame(
      createSettings({ source: 'mic' }),
      [track],
      2.25
    );

    expect(Array.from(frame?.spectrum ?? [])).toEqual([
      expect.closeTo(0.6),
      expect.closeTo(0.8),
    ]);
    expect(Array.from(frame?.waveform ?? [])).toEqual([-1, 1]);
  });

  it('mixes active tracks and respects a selected source', () => {
    const mic = createTrack('mic', analysis);
    const music = createTrack('music', analysis, { volume: 0.25 });

    const mixed = sampleEqualizerFrame(
      createSettings({ source: 'mix' }),
      [mic, music],
      0
    );
    const selected = sampleEqualizerFrame(
      createSettings({ source: 'music' }),
      [mic, music],
      0
    );

    expect(mixed?.spectrum[0]).toBeGreaterThan(selected?.spectrum[0] ?? 0);
    expect(selected?.spectrum[0]).toBeCloseTo(0.05);
  });

  it('returns no frame outside the selected track range', () => {
    const track = createTrack('mic', analysis, {
      startTime: 2,
      endTime: 3,
    });

    expect(sampleEqualizerFrame(createSettings(), [track], 1.5)).toBeNull();
  });
});

describe('equalizer circular layout', () => {
  it('centers a square selection on the circular visualization', () => {
    const settings = createSettings({
      mode: 'circular',
      x: 0.1,
      y: 0.2,
      width: 0.6,
      height: 0.4,
    });

    const result = getEqualizerLayoutSettings(settings, 1000, 500);

    expect(result.x).toBeCloseTo(0.3);
    expect(result.y).toBeCloseTo(0.2);
    expect(result.width).toBeCloseTo(0.2);
    expect(result.height).toBeCloseTo(0.4);
    expect(result.width * 1000).toBeCloseTo(result.height * 500);
  });
});

describe('equalizer overlay geometry', () => {
  it.each(['spectrum', 'wave', 'mirrored-wave', 'circular'] as const)(
    'allows %s mode to project beyond the frame while remaining recoverable',
    mode => {
      const settings = createSettings({
        mode,
        x: 0.25,
        y: 0.25,
        width: 0.5,
        height: 0.2,
      });
      const result = updateEqualizerForGesture(
        {
          mode: 'move',
          startX: 100,
          startY: 100,
          parentWidth: 1000,
          parentHeight: 500,
          settings,
        },
        2000,
        -1000
      );

      expect(1 - result.x).toBeCloseTo(result.width * 0.1);
      expect(result.y + result.height).toBeCloseTo(result.height * 0.1);
    }
  );

  it('keeps default circular gesture geometry valid on widescreen video', () => {
    const settings = createSettings({ mode: 'circular' });
    const result = updateEqualizerForGesture(
      {
        mode: 'move',
        startX: 0,
        startY: 0,
        parentWidth: 1920,
        parentHeight: 1080,
        settings,
      },
      0,
      0
    );

    expect(result.width).toBeCloseTo(0.09);
    expect(result.height).toBeCloseTo(0.16);
    expect(isValidEqualizerSettings(result)).toBe(true);
  });

  it('enforces minimum size while resizing from a corner', () => {
    const settings = createSettings({
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.3,
    });
    const result = updateEqualizerForGesture(
      {
        mode: 'north-west',
        startX: 0,
        startY: 0,
        parentWidth: 1000,
        parentHeight: 1000,
        settings,
      },
      1000,
      1000
    );

    expect(result.x + result.width).toBeCloseTo(0.6);
    expect(result.y + result.height).toBeCloseTo(0.5);
    expect(result.width).toBeCloseTo(0.12);
    expect(result.height).toBeCloseTo(0.08);
  });

  it('resizes one edge independently to the composition boundary', () => {
    const settings = createSettings({
      x: 0.2,
      y: 0.3,
      width: 0.4,
      height: 0.2,
    });
    const result = updateEqualizerForGesture(
      {
        mode: 'east',
        startX: 0,
        startY: 0,
        parentWidth: 1000,
        parentHeight: 500,
        settings,
      },
      1000,
      500
    );

    expect(result.x + result.width).toBe(1);
    expect(result.y).toBe(settings.y);
    expect(result.height).toBe(settings.height);
  });

  it('lands the west edge exactly on the composition boundary', () => {
    const settings = createSettings({
      x: 0.2,
      y: 0.3,
      width: 0.4,
      height: 0.2,
    });
    const result = updateEqualizerForGesture(
      {
        mode: 'west',
        startX: 0,
        startY: 0,
        parentWidth: 1000,
        parentHeight: 500,
        settings,
      },
      -1000,
      0
    );

    expect(result.x).toBe(0);
    expect(result.x + result.width).toBeCloseTo(0.6);
    expect(result.y).toBe(settings.y);
    expect(result.height).toBe(settings.height);
  });

  it.each(['spectrum', 'circular'] as const)(
    'keeps projected %s resize results recoverable for every handle',
    equalizerMode => {
      const handles: Array<{
        mode: Exclude<EqualizerGestureMode, 'move'>;
        horizontal: 'left' | 'right' | 'center';
        vertical: 'top' | 'bottom' | 'center';
        clientX: number;
        clientY: number;
      }> = [
        {
          mode: 'north',
          horizontal: 'center',
          vertical: 'bottom',
          clientX: 0,
          clientY: 2000,
        },
        {
          mode: 'north-west',
          horizontal: 'right',
          vertical: 'bottom',
          clientX: 2000,
          clientY: 2000,
        },
        {
          mode: 'north-east',
          horizontal: 'left',
          vertical: 'bottom',
          clientX: -2000,
          clientY: 2000,
        },
        {
          mode: 'east',
          horizontal: 'left',
          vertical: 'center',
          clientX: -2000,
          clientY: 0,
        },
        {
          mode: 'south',
          horizontal: 'center',
          vertical: 'top',
          clientX: 0,
          clientY: -2000,
        },
        {
          mode: 'south-west',
          horizontal: 'right',
          vertical: 'top',
          clientX: 2000,
          clientY: -2000,
        },
        {
          mode: 'south-east',
          horizontal: 'left',
          vertical: 'top',
          clientX: -2000,
          clientY: -2000,
        },
        {
          mode: 'west',
          horizontal: 'right',
          vertical: 'center',
          clientX: 2000,
          clientY: 0,
        },
      ];
      const width = 0.5;
      const height = equalizerMode === 'circular' ? 0.5 : 0.2;

      for (const handle of handles) {
        const x =
          handle.horizontal === 'left'
            ? -width * 0.9
            : handle.horizontal === 'right'
              ? 1 - width * 0.1
              : 0.25;
        const y =
          handle.vertical === 'top'
            ? -height * 0.9
            : handle.vertical === 'bottom'
              ? 1 - height * 0.1
              : 0.25;
        const settings = createSettings({
          mode: equalizerMode,
          x,
          y,
          width,
          height,
        });
        const result = updateEqualizerForGesture(
          {
            mode: handle.mode,
            startX: 0,
            startY: 0,
            parentWidth: 1000,
            parentHeight: 1000,
            settings,
          },
          handle.clientX,
          handle.clientY
        );

        expect(result.x + result.width + 0.000000001).toBeGreaterThanOrEqual(
          result.width * 0.1
        );
        expect(result.x).toBeLessThanOrEqual(
          1 - result.width * 0.1 + 0.000000001
        );
        expect(result.y + result.height + 0.000000001).toBeGreaterThanOrEqual(
          result.height * 0.1
        );
        expect(result.y).toBeLessThanOrEqual(
          1 - result.height * 0.1 + 0.000000001
        );
        expect(isValidEqualizerSettings(result)).toBe(true);
      }
    }
  );

  it.each([
    createSettings({ x: -0.2, y: 0.3, width: 0.4, height: 0.2 }),
    createSettings({
      mode: 'circular',
      x: -0.1,
      y: 0.2,
      width: 0.2,
      height: 0.4,
    }),
  ])('keeps projected bounds stable when resizing begins', settings => {
    const result = updateEqualizerForGesture(
      {
        mode: 'east',
        startX: 0,
        startY: 0,
        parentWidth: 1000,
        parentHeight: 500,
        settings,
      },
      0,
      0
    );

    expect(result.x).toBeCloseTo(settings.x);
    expect(result.y).toBeCloseTo(settings.y);
    expect(result.width).toBeCloseTo(settings.width);
    expect(result.height).toBeCloseTo(settings.height);
  });

  it('moves the circular selection exactly into a composition corner', () => {
    const settings = createSettings({
      mode: 'circular',
      x: 0.1,
      y: 0.2,
      width: 0.6,
      height: 0.4,
    });
    const result = updateEqualizerForGesture(
      {
        mode: 'move',
        startX: 500,
        startY: 250,
        parentWidth: 1000,
        parentHeight: 500,
        settings,
      },
      1000,
      450
    );

    expect(result.x + result.width).toBeCloseTo(1);
    expect(result.y + result.height).toBeCloseTo(1);
    expect(result.width * 1000).toBeCloseTo(result.height * 500);
  });

  it('keeps circular corner resizing square at the composition edges', () => {
    const settings = createSettings({
      mode: 'circular',
      x: 0.7,
      y: 0.4,
      width: 0.2,
      height: 0.4,
    });
    const result = updateEqualizerForGesture(
      {
        mode: 'south-east',
        startX: 900,
        startY: 400,
        parentWidth: 1000,
        parentHeight: 500,
        settings,
      },
      2000,
      1000
    );

    expect(result.x + result.width).toBeCloseTo(1);
    expect(result.y + result.height).toBeCloseTo(1);
    expect(result.width * 1000).toBeCloseTo(result.height * 500);
  });
});

describe('equalizer canvas bounds', () => {
  it('renders waveform content to the configured horizontal edges', () => {
    const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      globalAlpha: 1,
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      shadowColor: '',
      shadowBlur: 0,
    } as unknown as CanvasRenderingContext2D;

    renderEqualizer(context, {
      settings: createSettings({
        mode: 'wave',
        x: 0.1,
        y: 0.2,
        width: 0.4,
        height: 0.3,
        backgroundOpacity: 0,
      }),
      frame: {
        spectrum: new Float32Array([0.5]),
        waveform: new Float32Array([0.2, -0.4, 0.6]),
      },
      videoWidth: 1000,
      videoHeight: 500,
    });

    expect(context.createLinearGradient).toHaveBeenCalledWith(
      100,
      250,
      500,
      100
    );
    expect(context.moveTo).toHaveBeenCalledWith(100, expect.any(Number));
    expect(context.lineTo).toHaveBeenCalledWith(500, expect.any(Number));
  });

  it('renders circular content inside the same square as its selection', () => {
    const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      createRadialGradient: vi.fn(() => gradient),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      globalAlpha: 1,
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      shadowColor: '',
      shadowBlur: 0,
    } as unknown as CanvasRenderingContext2D;

    renderEqualizer(context, {
      settings: createSettings({
        mode: 'circular',
        x: 0.1,
        y: 0.2,
        width: 0.6,
        height: 0.4,
        backgroundOpacity: 0,
      }),
      frame: {
        spectrum: new Float32Array([0.5]),
        waveform: new Float32Array([0]),
      },
      videoWidth: 1000,
      videoHeight: 500,
    });

    expect(context.createRadialGradient).toHaveBeenCalledWith(
      expect.closeTo(400),
      200,
      0,
      expect.closeTo(400),
      200,
      100
    );
  });
});

describe('equalizer timeline segments', () => {
  const createSegment = (
    id: string,
    startTime: number,
    endTime: number,
    mode: EqualizerSettings['mode']
  ): EqualizerSegment => ({
    ...DEFAULT_EQUALIZER_SETTINGS,
    enabled: true,
    id,
    startTime,
    endTime,
    mode,
  });

  it('resolves adjacent clips with an exclusive end boundary', () => {
    const segments = [
      createSegment('first', 0, 2, 'spectrum'),
      createSegment('second', 2, 4, 'circular'),
    ];

    expect(getActiveEqualizerSegment(segments, 1.999)?.id).toBe('first');
    expect(getActiveEqualizerSegment(segments, 2)?.id).toBe('second');
    expect(getActiveEqualizerSegment(segments, 4)).toBeNull();
  });

  it('keeps each clip settings independent', () => {
    const segments = [
      createSegment('first', 0, 2, 'spectrum'),
      createSegment('second', 2, 4, 'circular'),
    ];
    const updated = segments.map(segment =>
      segment.id === 'first'
        ? { ...segment, colorStart: '#ff0000', x: -0.25 }
        : segment
    );

    expect(updated[0].colorStart).toBe('#ff0000');
    expect(updated[0].x).toBe(-0.25);
    expect(updated[1].colorStart).toBe(DEFAULT_EQUALIZER_SETTINGS.colorStart);
    expect(updated[1].x).toBe(DEFAULT_EQUALIZER_SETTINGS.x);
  });

  it('analyzes only audio tracks referenced by active clips', () => {
    const selected = {
      ...createSegment('selected-clip', 0, 2, 'spectrum'),
      source: 'mic-audio',
    };
    const mixed = {
      ...createSegment('mixed-clip', 4, 6, 'wave'),
      source: 'mix',
    };
    const createAudioTrack = (
      id: string,
      startTime: number,
      endTime: number,
      enabled = true
    ): MusicTrack => ({
      id,
      name: id,
      source: id === 'mic-audio' ? 'mic' : 'music',
      fileName: id === 'mic-audio' ? '' : `${id}.mp3`,
      volume: 1,
      enabled,
      startTime,
      endTime,
      originalDuration: endTime - startTime,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
    });
    const tracks = [
      createAudioTrack('mic-audio', 0, 6),
      createAudioTrack('music-in-mix', 4, 6),
      createAudioTrack('outside-clips', 7, 9),
      createAudioTrack('disabled', 4, 6, false),
    ];

    expect(getRequiredEqualizerTrackIds([selected, mixed], tracks)).toEqual([
      'mic-audio',
      'music-in-mix',
    ]);
  });

  it('migrates an enabled legacy equalizer into a full-duration clip', () => {
    const restored = migrateLegacyEqualizer(
      {
        enabled: true,
        mode: 'circular',
      } as EqualizerSettings,
      12,
      'legacy-equalizer'
    );

    expect(restored).toEqual([
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        enabled: true,
        mode: 'circular',
        id: 'legacy-equalizer',
        startTime: 0,
        endTime: 12,
      },
    ]);
  });
});
