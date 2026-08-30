import type { ShadowConfig } from '@/renderer/components/video-editor/composition/wallpaper-canvas-renderer';
import {
  createLegacyCaptyEffectAdapter,
  type LegacyCaptyEffectAdapter,
} from './legacy-capty-effect-adapter';
import { resolveLegacyCaptyContentLayout } from './legacy-capty-layout';
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

interface ContentBounds {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  cornerRadius: number;
  shadowConfig: ShadowConfig | null;
}

const clampCrop = (value: number): number => Math.min(0.99, Math.max(0, value));

const getDrawRect = (
  layer: FrameLayerPlan,
  source: Extract<CompositionSourceResult, { status: 'ready' }>,
  bounds: ContentBounds
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
      targetWidth: bounds.width,
      targetHeight: bounds.height,
    };
  }
  const fitScale =
    fit === 'cover'
      ? Math.max(bounds.width / sourceWidth, bounds.height / sourceHeight)
      : Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    targetWidth: sourceWidth * fitScale,
    targetHeight: sourceHeight * fitScale,
  };
};

const getContentBounds = (
  evaluation: SequenceEvaluation,
  layer: FrameLayerPlan,
  source: Extract<CompositionSourceResult, { status: 'ready' }>
): ContentBounds => {
  if (layer.origin === 'pre-roll') {
    return {
      centerX: evaluation.composition.width / 2,
      centerY: evaluation.composition.height / 2,
      width: evaluation.composition.width,
      height: evaluation.composition.height,
      cornerRadius: 0,
      shadowConfig: null,
    };
  }
  const layout = resolveLegacyCaptyContentLayout(
    evaluation,
    source.width,
    source.height
  );
  if (layout.deviceFrame) {
    return {
      centerX: layout.screenX + layout.sourceWidth / 2,
      centerY: layout.screenY + layout.sourceHeight / 2,
      width: layout.sourceWidth,
      height: layout.sourceHeight,
      cornerRadius: layout.screenCornerRadius,
      shadowConfig: null,
    };
  }
  return {
    centerX: layout.screenX + layout.sourceWidth / 2,
    centerY: layout.screenY + layout.sourceHeight / 2,
    width: layout.sourceWidth,
    height: layout.sourceHeight,
    cornerRadius: layout.clipRadius,
    shadowConfig: layout.shadowConfig,
  };
};

const getLayerTransform = (
  layer: FrameLayerPlan,
  outputTick: number,
  width: number,
  height: number
): FrameLayerPlan['transform'] => {
  const zoom = [...layer.effects]
    .reverse()
    .find(
      effect =>
        effect.kind === 'zoom' &&
        effect.enabled &&
        outputTick >= effect.range.start &&
        outputTick < effect.range.end
    );
  if (!zoom || zoom.kind !== 'zoom' || zoom.scale <= 1) return layer.transform;
  const focusX = zoom.target === 'manual' ? (zoom.focusX ?? 0.5) : 0.5;
  const focusY = zoom.target === 'manual' ? (zoom.focusY ?? 0.5) : 0.5;
  const elapsed = outputTick - zoom.range.start;
  const remaining = zoom.range.end - outputTick;
  const inProgress =
    zoom.transitionInTicks > 0
      ? Math.min(1, elapsed / zoom.transitionInTicks)
      : 1;
  const outProgress =
    zoom.transitionOutTicks > 0
      ? Math.min(1, remaining / zoom.transitionOutTicks)
      : 1;
  const scale = 1 + (zoom.scale - 1) * Math.min(inProgress, outProgress);
  return {
    ...layer.transform,
    scaleX: layer.transform.scaleX * scale,
    scaleY: layer.transform.scaleY * scale,
    positionX: layer.transform.positionX + (0.5 - focusX) * width * (scale - 1),
    positionY:
      layer.transform.positionY + (0.5 - focusY) * height * (scale - 1),
  };
};

const createClippedShadowSource = (
  source: Extract<CompositionSourceResult, { status: 'ready' }>,
  rect: DrawRect,
  cornerRadius: number
): OffscreenCanvas | null => {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const width = Math.max(1, Math.round(rect.targetWidth));
  const height = Math.max(1, Math.round(rect.targetHeight));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.save();
  if (cornerRadius > 0) {
    context.beginPath();
    context.roundRect(0, 0, width, height, cornerRadius);
    context.clip();
  }
  context.drawImage(
    source.source,
    rect.sourceX,
    rect.sourceY,
    rect.sourceWidth,
    rect.sourceHeight,
    0,
    0,
    width,
    height
  );
  context.restore();
  return canvas;
};

const drawMediaLayer = (
  context: CanvasRenderingContext2D,
  evaluation: SequenceEvaluation,
  layer: FrameLayerPlan,
  source: Extract<CompositionSourceResult, { status: 'ready' }>,
  resolvedTransform?: FrameLayerPlan['transform'] | null
): void => {
  const bounds = getContentBounds(evaluation, layer, source);
  const rect = getDrawRect(layer, source, bounds);
  const transform =
    resolvedTransform ??
    getLayerTransform(
      layer,
      evaluation.outputTick,
      bounds.width,
      bounds.height
    );
  const targetX = -rect.targetWidth * transform.anchorX;
  const targetY = -rect.targetHeight * transform.anchorY;
  const shadowSource = bounds.shadowConfig
    ? createClippedShadowSource(source, rect, bounds.cornerRadius)
    : null;
  context.save();
  context.globalAlpha = layer.opacity;
  context.translate(
    bounds.centerX + transform.positionX,
    bounds.centerY + transform.positionY
  );
  context.rotate((transform.rotationDegrees * Math.PI) / 180);
  context.scale(transform.scaleX, transform.scaleY);
  if (bounds.shadowConfig && shadowSource) {
    context.shadowColor = `rgba(0, 0, 0, ${bounds.shadowConfig.opacity})`;
    context.shadowBlur = bounds.shadowConfig.blur;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = bounds.shadowConfig.offsetY;
    context.drawImage(
      shadowSource,
      targetX,
      targetY,
      rect.targetWidth,
      rect.targetHeight
    );
    context.restore();
    return;
  }
  if (bounds.cornerRadius > 0) {
    context.beginPath();
    context.roundRect(
      targetX,
      targetY,
      rect.targetWidth,
      rect.targetHeight,
      bounds.cornerRadius
    );
    context.clip();
  }
  if (bounds.shadowConfig) {
    context.shadowColor = `rgba(0, 0, 0, ${bounds.shadowConfig.opacity})`;
    context.shadowBlur = bounds.shadowConfig.blur;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = bounds.shadowConfig.offsetY;
  }
  context.drawImage(
    source.source,
    rect.sourceX,
    rect.sourceY,
    rect.sourceWidth,
    rect.sourceHeight,
    targetX,
    targetY,
    rect.targetWidth,
    rect.targetHeight
  );
  context.restore();
};

const createWallpaperLayer = (assetId: string): FrameLayerPlan => ({
  kind: 'media',
  origin: 'pre-roll',
  layerId: `wallpaper:${assetId}`,
  preRollAssetId: assetId,
  assetId,
  assetKind: 'image',
  sourceTick: 0,
  fit: 'cover',
  trackId: 'pre-roll',
  trackOrder: -1,
  transform: {
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
  },
  opacity: 1,
  effects: [],
});

const drawWallpaperImage = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  source: Extract<CompositionSourceResult, { status: 'ready' }>
): void => {
  const scale = Math.max(
    canvas.width / source.width,
    canvas.height / source.height
  );
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(
    source.source,
    0,
    0,
    source.width,
    source.height,
    (canvas.width - width) / 2,
    (canvas.height - height) / 2,
    width,
    height
  );
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
    const issues: CompositionRenderIssue[] = [];
    const isPreRoll = evaluation.layers.some(
      layer => layer.kind === 'media' && layer.origin === 'pre-roll'
    );
    const wallpaper = evaluation.composition.effects.find(
      effect => effect.kind === 'wallpaper' && effect.enabled
    );
    if (
      !isPreRoll &&
      wallpaper?.kind === 'wallpaper' &&
      wallpaper.background.kind === 'image'
    ) {
      const source = await this.sources.getSource(
        createWallpaperLayer(wallpaper.background.assetId)
      );
      if (source.status === 'ready') {
        drawWallpaperImage(context, canvas, source);
      } else {
        issues.push({
          kind: source.status === 'missing' ? 'missing-source' : 'decode-error',
          assetId: source.assetId,
          sourceStreamId: source.sourceStreamId,
          sourceRole: source.sourceRole,
          error: source.status === 'decode-error' ? source.error : undefined,
        });
      }
    }
    if (!isPreRoll) {
      this.effects.renderSequenceBackground({ context, evaluation });
    }

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
      const cameraRendered =
        (await this.effects.renderCameraLayer?.({
          context,
          evaluation,
          layer,
          source,
        })) ?? false;
      if (cameraRendered) continue;
      const deviceFramed =
        (await this.effects.renderDeviceFramedLayer?.({
          context,
          evaluation,
          layer,
          source,
        })) ?? false;
      if (deviceFramed) continue;
      const transform = await this.effects.resolveLayerTransform?.(
        layer,
        evaluation
      );
      drawMediaLayer(context, evaluation, layer, source, transform);
    }
    await this.effects.renderSequenceForeground?.({ context, evaluation });

    return { evaluation, issues };
  }

  dispose(): void {
    this.sources.dispose();
  }
}
