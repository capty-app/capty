import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { evaluateSequence } from '@/editor-v2/timeline';
import { EditorV2CompositionEngine } from '@/renderer/editor-v2/composition/composition-engine';
import { createLegacyCaptyEffectAdapter } from '@/renderer/editor-v2/composition/legacy-capty-effect-adapter';
import type { CompositionSourceProvider } from '@/renderer/editor-v2/composition/source-provider';
import type { EditorProjectV2 } from '@/types/editor-v2';

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Composition',
    createdAt: '2026-09-01T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.image = {
    id: 'image',
    kind: 'image',
    name: 'Image',
    locator: { kind: 'managed', relativePath: 'media/image/image.png' },
    importedAt: '2026-09-01T00:00:00.000Z',
    width: 800,
    height: 600,
    orientation: 1,
    defaultStillDurationTicks: 1_000,
  };
  project.sequence.clips.clip = {
    id: 'clip',
    kind: 'image',
    trackId: 'video',
    assetId: 'image',
    name: 'Image',
    timelineStart: 0,
    timelineDuration: 1_000,
    sourceStart: 0,
    sourceDuration: 1_000,
    playbackRate: { numerator: 1, denominator: 1 },
    effects: [
      {
        id: 'transform',
        kind: 'transform',
        enabled: true,
        value: {
          positionX: 10,
          positionY: -20,
          scaleX: 2,
          scaleY: 0.5,
          rotationDegrees: 90,
          anchorX: 0.5,
          anchorY: 0.5,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
          cropLeft: 0,
        },
      },
      {
        id: 'opacity',
        kind: 'opacity',
        enabled: true,
        opacity: 0.5,
      },
    ],
  };
  project.sequence.tracks.video.clipIds.push('clip');
  project.sequence.effects.push({
    id: 'canvas',
    kind: 'canvas-settings',
    enabled: true,
    width: 1920,
    height: 1080,
    backgroundColor: '#112233',
    aspectRatio: { name: '16:9', width: 16, height: 9 },
  });
  project.sequence.transitions.fade = {
    id: 'fade',
    type: 'video-fade-black',
    trackId: 'video',
    clipId: 'clip',
    edge: 'out',
    durationTicks: 200,
  };
  return project;
};

const createCanvas = () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
};

describe('EditorV2CompositionEngine', () => {
  it('consumes the canonical evaluation unchanged and draws ordered layers', async () => {
    const evaluation = evaluateSequence(createProject(), 900);
    const drawable = {} as CanvasImageSource;
    const sources: CompositionSourceProvider = {
      getSource: vi.fn().mockResolvedValue({
        status: 'ready',
        source: drawable,
        width: 800,
        height: 600,
      }),
      dispose: vi.fn(),
    };
    const effects = { renderSequenceBackground: vi.fn() };
    const engine = new EditorV2CompositionEngine(sources, effects);
    const { canvas, context } = createCanvas();

    const result = await engine.render(canvas, evaluation);

    expect(result.evaluation).toBe(evaluation);
    expect(result.issues).toEqual([]);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(sources.getSource).toHaveBeenCalledWith(evaluation.layers[0]);
    expect(evaluation.layers[0]).toMatchObject({ opacity: 0.5 });
    expect(context.translate).toHaveBeenCalledWith(970, 520);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(context.scale).toHaveBeenCalledWith(2, 0.5);
    expect(context.drawImage).toHaveBeenCalledWith(
      drawable,
      0,
      0,
      800,
      600,
      -720,
      -540,
      1440,
      1080
    );
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 1920, 1080);
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 0, 0, 1920, 1080);
    expect(effects.renderSequenceBackground).toHaveBeenCalledWith({
      context,
      evaluation,
    });
  });

  it('renders supported sequence effects through the V1 adapter', () => {
    const project = createProject();
    project.sequence.effects.push({
      id: 'wallpaper',
      kind: 'wallpaper',
      enabled: true,
      background: {
        kind: 'gradient',
        gradient: {
          id: 'gradient',
          colors: ['#000000', '#ffffff'],
          angle: 90,
        },
      },
      padding: 20,
      corners: 10,
      shadow: 10,
    });
    const evaluation = evaluateSequence(project, 100);
    const gradient = { addColorStop: vi.fn() };
    const context = {
      createLinearGradient: vi.fn(() => gradient),
      fillRect: vi.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    createLegacyCaptyEffectAdapter().renderSequenceBackground({
      context,
      evaluation,
    });

    expect(context.createLinearGradient).toHaveBeenCalled();
    expect(gradient.addColorStop).toHaveBeenCalledTimes(2);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
  });

  it('reports missing and decode-error sources without remapping plans', async () => {
    const evaluation = evaluateSequence(createProject(), 100);
    const sources: CompositionSourceProvider = {
      getSource: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'missing',
          assetId: 'image',
        })
        .mockResolvedValueOnce({
          status: 'decode-error',
          assetId: 'image',
          error: 'decode failed',
        }),
      dispose: vi.fn(),
    };
    const engine = new EditorV2CompositionEngine(sources);
    const first = await engine.render(createCanvas().canvas, evaluation);
    const second = await engine.render(createCanvas().canvas, evaluation);

    expect(first.evaluation).toBe(evaluation);
    expect(first.issues).toEqual([
      {
        kind: 'missing-source',
        assetId: 'image',
        sourceStreamId: undefined,
        sourceRole: undefined,
      },
    ]);
    expect(second.issues).toEqual([
      {
        kind: 'decode-error',
        assetId: 'image',
        sourceStreamId: undefined,
        sourceRole: undefined,
        error: 'decode failed',
      },
    ]);
  });
});
