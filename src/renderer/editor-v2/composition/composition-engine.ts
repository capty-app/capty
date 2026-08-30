import {
  createLegacyCaptyEffectAdapter,
  type LegacyCaptyEffectAdapter,
} from './legacy-capty-effect-adapter';
import type {
  CompositionSourceProvider,
  CompositionSourceResult,
} from './source-provider';
import type {
  FrameLayerPlan,
  SequenceEvaluation,
  VisualLayerPlan,
} from '@/editor-v2/timeline';
import type { MediaSourceRole } from '@/types/editor-v2';

export interface CompositionRenderIssue {
  kind: 'missing-source' | 'decode-error';
  assetId: string;
  sourceStreamId?: string;
  sourceRole?: MediaSourceRole;
  error?: string;
}

export interface CompositionRenderResult {
  evaluation: SequenceEvaluation;
  issues: readonly CompositionRenderIssue[];
}

interface DrawRect {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}

const clampCrop = (value: number): number => Math.min(0.99, Math.max(0, value));

const getDrawRect = (
  layer: FrameLayerPlan,
  source: Extract<CompositionSourceResult, { status: 'ready' }>,
  canvas: HTMLCanvasElement
): DrawRect => {
  const cropLeft = clampCrop(layer.transform.cropLeft);
  const cropRight = clampCrop(layer.transform.cropRight);
  const cropTop = clampCrop(layer.transform.cropTop);
  const cropBottom = clampCrop(layer.transform.cropBottom);
  const sourceX = source.width * cropLeft;
  const sourceY = source.height * cropTop;
  const sourceWidth = Math.max(1, source.width * (1 - cropLeft - cropRight));
  const sourceHeight = Math.max(1, source.height * (1 - cropTop - cropBottom));
  const fit = layer.origin === 'pre-roll' ? layer.fit : 'contain';
  if (fit === 'stretch') {
    return {
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      targetWidth: canvas.width,
      targetHeight: canvas.height,
    };
  }
  const fitScale =
    fit === 'cover'
      ? Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
      : Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    targetWidth: sourceWidth * fitScale,
    targetHeight: sourceHeight * fitScale,
  };
};

const drawMediaLayer = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layer: FrameLayerPlan,
  source: Extract<CompositionSourceResult, { status: 'ready' }>
): void => {
  const rect = getDrawRect(layer, source, canvas);
  const transform = layer.transform;
  context.save();
  context.globalAlpha = layer.opacity;
  context.translate(
    canvas.width / 2 + transform.positionX,
    canvas.height / 2 + transform.positionY
  );
  context.rotate((transform.rotationDegrees * Math.PI) / 180);
  context.scale(transform.scaleX, transform.scaleY);
  context.drawImage(
    source.source,
    rect.sourceX,
    rect.sourceY,
    rect.sourceWidth,
    rect.sourceHeight,
    -rect.targetWidth * transform.anchorX,
    -rect.targetHeight * transform.anchorY,
    rect.targetWidth,
    rect.targetHeight
  );
  context.restore();
};

const drawBlackLayer = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layer: Extract<VisualLayerPlan, { kind: 'black' }>
): void => {
  context.save();
  context.globalAlpha = layer.opacity;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
};

export class EditorV2CompositionEngine {
  constructor(
    private readonly sources: CompositionSourceProvider,
    private readonly effects: LegacyCaptyEffectAdapter = createLegacyCaptyEffectAdapter()
  ) {}

  async render(
    canvas: HTMLCanvasElement,
    evaluation: SequenceEvaluation
  ): Promise<CompositionRenderResult> {
    canvas.width = evaluation.composition.width;
    canvas.height = evaluation.composition.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D rendering is unavailable');
    context.save();
    context.globalAlpha = 1;
    context.fillStyle = evaluation.composition.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    this.effects.renderSequenceBackground({ context, evaluation });

    const issues: CompositionRenderIssue[] = [];
    for (const layer of evaluation.layers) {
      if (layer.kind === 'black') {
        drawBlackLayer(context, canvas, layer);
        continue;
      }
      const source = await this.sources.getSource(layer);
      if (source.status === 'missing') {
        issues.push({
          kind: 'missing-source',
          assetId: source.assetId,
          sourceStreamId: source.sourceStreamId,
          sourceRole: source.sourceRole,
        });
        continue;
      }
      if (source.status === 'decode-error') {
        issues.push({
          kind: 'decode-error',
          assetId: source.assetId,
          sourceStreamId: source.sourceStreamId,
          sourceRole: source.sourceRole,
          error: source.error,
        });
        continue;
      }
      drawMediaLayer(context, canvas, layer, source);
    }

    return { evaluation, issues };
  }

  dispose(): void {
    this.sources.dispose();
  }
}
