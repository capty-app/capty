import { renderCamera } from '@/renderer/components/video-editor/composition/camera-canvas-renderer';
import { renderCursor } from '@/renderer/components/video-editor/composition/cursor-canvas-renderer';
import { renderDeviceFrame } from '@/renderer/components/video-editor/composition/device-frame-canvas-renderer';
import { renderDrawings } from '@/renderer/components/video-editor/composition/drawing-canvas-renderer';
import { renderKeyboard } from '@/renderer/components/video-editor/composition/keyboard-canvas-renderer';
import {
  getSubtitleBounds,
  renderSubtitle,
} from '@/renderer/components/video-editor/composition/subtitle-canvas-renderer';
import { renderGradientBackground } from '@/renderer/components/video-editor/composition/wallpaper-canvas-renderer';
import {
  calculateZoomTransform,
  type ZoomTransform,
} from '@/renderer/components/video-editor/composition/zoom-canvas-renderer';
import { resolveLegacyCaptyContentLayout } from './legacy-capty-layout';
import type { CompositionSourceResult } from './source-provider';
import type { FrameLayerPlan, SequenceEvaluation } from '@/editor-v2/timeline';
import {
  EDITOR_V2_TICKS_PER_SECOND,
  type AnnotationEffect,
  type ClipEffect,
  type EditableDataLocator,
  type EditorV2DataKind,
  type EditorV2DataValue,
} from '@/types/editor-v2';

export interface LegacyCaptySequenceEffectInput {
  context: CanvasRenderingContext2D;
  evaluation: SequenceEvaluation;
}

export interface LegacyCaptyCameraLayerInput {
  context: CanvasRenderingContext2D;
  evaluation: SequenceEvaluation;
  layer: FrameLayerPlan;
  source: Extract<CompositionSourceResult, { status: 'ready' }>;
}

export interface LegacyCaptyEffectAdapter {
  renderSequenceBackground: (input: LegacyCaptySequenceEffectInput) => void;
  resolveLayerTransform?: (
    layer: FrameLayerPlan,
    evaluation: SequenceEvaluation
  ) => Promise<FrameLayerPlan['transform'] | null>;
  renderCameraLayer?: (input: LegacyCaptyCameraLayerInput) => Promise<boolean>;
  renderDeviceFramedLayer?: (
    input: LegacyCaptyCameraLayerInput
  ) => Promise<boolean>;
  renderSequenceForeground?: (
    input: LegacyCaptySequenceEffectInput
  ) => void | Promise<void>;
}

export type EditorV2EffectDataResolver = (
  kind: EditorV2DataKind,
  locator: EditableDataLocator
) => Promise<EditorV2DataValue | null>;

interface OverlayCandidate {
  layer: FrameLayerPlan;
  effect: Extract<ClipEffect, { kind: 'cursor' | 'keyboard' | 'subtitle' }>;
}

const createSegment = (layer: FrameLayerPlan, outputSeconds: number) => ({
  id: layer.layerId,
  startTime: layer.sourceTick / EDITOR_V2_TICKS_PER_SECOND,
  endTime: layer.sourceTick / EDITOR_V2_TICKS_PER_SECOND + 1,
  timelineStart: outputSeconds,
  speed: 1,
});

const dataKey = (
  kind: EditorV2DataKind,
  locator: EditableDataLocator
): string =>
  JSON.stringify([
    kind,
    locator.kind,
    locator.relativePath,
    locator.fingerprint.byteLength,
    locator.fingerprint.sha256,
    locator.kind === 'v2-data' ? locator.provenance : null,
  ]);

const overlayKey = (candidate: OverlayCandidate): string =>
  dataKey(
    candidate.effect.kind === 'subtitle' ? 'subtitles' : candidate.effect.kind,
    candidate.effect.data
  );

const collectOverlayCandidates = (
  evaluation: SequenceEvaluation
): OverlayCandidate[] => {
  const candidates = new Map<string, OverlayCandidate>();
  for (const layer of evaluation.layers) {
    if (layer.kind !== 'media') continue;
    for (const effect of layer.effects) {
      if (
        !effect.enabled ||
        (effect.kind !== 'cursor' &&
          effect.kind !== 'keyboard' &&
          effect.kind !== 'subtitle')
      ) {
        continue;
      }
      const candidate = { layer, effect };
      const key = overlayKey(candidate);
      const current = candidates.get(key);
      if (!current || current.layer.opacity < layer.opacity) {
        candidates.set(key, candidate);
      }
    }
  }
  return [...candidates.values()];
};

export const createLegacyCaptyEffectAdapter = (
  resolveData?: EditorV2EffectDataResolver
): LegacyCaptyEffectAdapter => {
  const dataCache = new Map<string, Promise<EditorV2DataValue | null>>();
  const read = (
    kind: EditorV2DataKind,
    locator: EditableDataLocator
  ): Promise<EditorV2DataValue | null> => {
    if (!resolveData) return Promise.resolve(null);
    const key = dataKey(kind, locator);
    const cached = dataCache.get(key);
    if (cached) return cached;
    const pending = resolveData(kind, locator).catch(error => {
      dataCache.delete(key);
      throw error;
    });
    dataCache.set(key, pending);
    return pending;
  };

  const resolveZoom = async (
    layer: FrameLayerPlan,
    evaluation: SequenceEvaluation
  ): Promise<{
    transform: ZoomTransform;
    cursorData: Extract<EditorV2DataValue, { kind: 'cursor' }> | null;
  }> => {
    const zoom = [...layer.effects]
      .reverse()
      .find(effect => effect.kind === 'zoom' && effect.enabled);
    const cursor = [...layer.effects]
      .reverse()
      .find(effect => effect.kind === 'cursor' && effect.enabled);
    const cursorData =
      cursor?.kind === 'cursor' ? await read('cursor', cursor.data) : null;
    if (!zoom || zoom.kind !== 'zoom') {
      return {
        transform: { scale: 1, translateX: 0, translateY: 0 },
        cursorData: cursorData?.kind === 'cursor' ? cursorData : null,
      };
    }
    const preRollOffset =
      zoom.timeDomain === 'content-timeline' ? evaluation.preRollTicks : 0;
    const layout = resolveLegacyCaptyContentLayout(evaluation);
    const transform = calculateZoomTransform(
      [
        {
          id: zoom.id,
          startTime:
            (zoom.range.start + preRollOffset) / EDITOR_V2_TICKS_PER_SECOND,
          endTime:
            (zoom.range.end + preRollOffset) / EDITOR_V2_TICKS_PER_SECOND,
          zoomLevel: zoom.scale,
          transitionInDuration:
            zoom.transitionInTicks / EDITOR_V2_TICKS_PER_SECOND,
          transitionOutDuration:
            zoom.transitionOutTicks / EDITOR_V2_TICKS_PER_SECOND,
          targetMode: zoom.target,
          focusPoint:
            zoom.target === 'manual'
              ? { x: zoom.focusX ?? 0.5, y: zoom.focusY ?? 0.5 }
              : undefined,
        },
      ],
      {
        transitionInDuration:
          zoom.transitionInTicks / EDITOR_V2_TICKS_PER_SECOND,
        transitionOutDuration:
          zoom.transitionOutTicks / EDITOR_V2_TICKS_PER_SECOND,
        easing: 'ease-in-out',
        followSmoothness: zoom.followSmoothness,
        lookAhead: zoom.lookAheadTicks / EDITOR_V2_TICKS_PER_SECOND,
      },
      cursorData?.kind === 'cursor' ? cursorData.value : null,
      [
        createSegment(
          layer,
          evaluation.outputTick / EDITOR_V2_TICKS_PER_SECOND
        ),
      ],
      evaluation.outputTick / EDITOR_V2_TICKS_PER_SECOND,
      layout.sourceWidth,
      layout.sourceHeight,
      { fps: 60 }
    );
    return {
      transform,
      cursorData: cursorData?.kind === 'cursor' ? cursorData : null,
    };
  };

  return {
    renderSequenceBackground: ({ context, evaluation }) => {
      const wallpaper = evaluation.composition.effects.find(
        effect => effect.kind === 'wallpaper' && effect.enabled
      );
      if (
        !wallpaper ||
        wallpaper.kind !== 'wallpaper' ||
        wallpaper.background.kind !== 'gradient'
      ) {
        return;
      }
      renderGradientBackground(
        context,
        wallpaper.background.gradient,
        evaluation.composition.width,
        evaluation.composition.height
      );
    },
    resolveLayerTransform: async (layer, evaluation) => {
      const zoom = await resolveZoom(layer, evaluation);
      if (zoom.transform.scale === 1) return layer.transform;
      const layout = resolveLegacyCaptyContentLayout(evaluation);
      return {
        ...layer.transform,
        scaleX: layer.transform.scaleX * zoom.transform.scale,
        scaleY: layer.transform.scaleY * zoom.transform.scale,
        positionX:
          layer.transform.positionX +
          zoom.transform.translateX +
          (layout.sourceWidth * (zoom.transform.scale - 1)) / 2,
        positionY:
          layer.transform.positionY +
          zoom.transform.translateY +
          (layout.sourceHeight * (zoom.transform.scale - 1)) / 2,
      };
    },
    renderCameraLayer: async ({ context, evaluation, layer, source }) => {
      const effect = [...layer.effects]
        .reverse()
        .find(current => current.kind === 'camera-layout' && current.enabled);
      if (!effect || effect.kind !== 'camera-layout') return false;
      const overlayLayer = evaluation.layers.find(
        (current): current is FrameLayerPlan =>
          current.kind === 'media' &&
          current.effects.some(
            currentEffect =>
              (currentEffect.kind === 'zoom' ||
                currentEffect.kind === 'cursor') &&
              currentEffect.enabled
          )
      );
      const zoom = overlayLayer
        ? await resolveZoom(overlayLayer, evaluation)
        : {
            transform: { scale: 1, translateX: 0, translateY: 0 },
            cursorData: null,
          };
      const outputSeconds = evaluation.outputTick / EDITOR_V2_TICKS_PER_SECOND;
      renderCamera(
        context,
        outputSeconds,
        source.source as Parameters<typeof renderCamera>[2],
        {
          cameraStyle: { ...effect.style, visible: true },
          cursorData: zoom.cursorData?.value,
          segments: [createSegment(layer, outputSeconds)],
          videoWidth: evaluation.composition.width,
          videoHeight: evaluation.composition.height,
          offsetX: 0,
          offsetY: 0,
          zoomInfo: {
            scale: zoom.transform.scale,
            viewport: zoom.transform.viewport,
          },
        }
      );
      return true;
    },
    renderDeviceFramedLayer: async ({ context, evaluation, layer, source }) => {
      if (layer.origin === 'pre-roll') return false;
      const layout = resolveLegacyCaptyContentLayout(
        evaluation,
        source.width,
        source.height
      );
      if (!layout.deviceFrame) return false;
      const zoom = await resolveZoom(layer, evaluation);
      const transform = layer.transform;
      const contentCenterX = layout.contentX + layout.contentWidth / 2;
      const contentCenterY = layout.contentY + layout.contentHeight / 2;
      context.save();
      context.globalAlpha = layer.opacity;
      context.translate(
        contentCenterX + transform.positionX,
        contentCenterY + transform.positionY
      );
      context.rotate((transform.rotationDegrees * Math.PI) / 180);
      context.scale(transform.scaleX, transform.scaleY);
      context.translate(-contentCenterX, -contentCenterY);
      if (zoom.transform.scale !== 1) {
        context.translate(layout.contentX, layout.contentY);
        context.scale(zoom.transform.scale, zoom.transform.scale);
        context.translate(
          zoom.transform.translateX / zoom.transform.scale,
          zoom.transform.translateY / zoom.transform.scale
        );
        context.save();
        context.beginPath();
        context.roundRect(
          layout.deviceFrame.screenX,
          layout.deviceFrame.screenY,
          layout.sourceWidth,
          layout.sourceHeight,
          layout.screenCornerRadius
        );
        context.clip();
        context.drawImage(
          source.source,
          layout.deviceFrame.screenX,
          layout.deviceFrame.screenY,
          layout.sourceWidth,
          layout.sourceHeight
        );
        context.restore();
        renderDeviceFrame(
          context,
          layout.deviceFrame,
          0,
          0,
          layout.shadowConfig
        );
        context.restore();
        return true;
      }
      context.save();
      context.beginPath();
      context.roundRect(
        layout.screenX,
        layout.screenY,
        layout.sourceWidth,
        layout.sourceHeight,
        layout.screenCornerRadius
      );
      context.clip();
      context.drawImage(
        source.source,
        layout.screenX,
        layout.screenY,
        layout.sourceWidth,
        layout.sourceHeight
      );
      context.restore();
      renderDeviceFrame(
        context,
        layout.deviceFrame,
        layout.contentX,
        layout.contentY,
        layout.shadowConfig
      );
      context.restore();
      return true;
    },
    renderSequenceForeground: async ({ context, evaluation }) => {
      const outputSeconds = evaluation.outputTick / EDITOR_V2_TICKS_PER_SECOND;
      const layout = resolveLegacyCaptyContentLayout(evaluation);
      const candidates = collectOverlayCandidates(evaluation);
      const subtitleCandidate = candidates.find(
        candidate => candidate.effect.kind === 'subtitle'
      );
      let subtitleBounds = null;
      if (subtitleCandidate?.effect.kind === 'subtitle') {
        const data = await read('subtitles', subtitleCandidate.effect.data);
        if (data?.kind === 'subtitles') {
          renderSubtitle(context, outputSeconds, {
            subtitleData: data.value,
            subtitleStyle: {
              ...subtitleCandidate.effect.style,
              visible: true,
            },
            segments: [createSegment(subtitleCandidate.layer, outputSeconds)],
            videoWidth: evaluation.composition.width,
            videoHeight: evaluation.composition.height,
          });
          subtitleBounds = getSubtitleBounds(
            { ...subtitleCandidate.effect.style, visible: true },
            evaluation.composition.height
          );
        }
      }

      const keyboardCandidate = candidates.find(
        candidate => candidate.effect.kind === 'keyboard'
      );
      if (keyboardCandidate?.effect.kind === 'keyboard') {
        const data = await read('keyboard', keyboardCandidate.effect.data);
        if (data?.kind === 'keyboard') {
          renderKeyboard(context, outputSeconds, {
            keyboardData: data.value,
            keyboardStyle: {
              ...keyboardCandidate.effect.style,
              visible: true,
            },
            segments: [createSegment(keyboardCandidate.layer, outputSeconds)],
            videoWidth: evaluation.composition.width,
            videoHeight: evaluation.composition.height,
            subtitleBounds,
          });
        }
      }

      const cursorCandidate = candidates.find(
        candidate => candidate.effect.kind === 'cursor'
      );
      if (cursorCandidate?.effect.kind === 'cursor') {
        const data = await read('cursor', cursorCandidate.effect.data);
        if (data?.kind === 'cursor') {
          const zoom = await resolveZoom(cursorCandidate.layer, evaluation);
          context.save();
          if (zoom.transform.scale !== 1) {
            context.translate(layout.screenX, layout.screenY);
            context.scale(zoom.transform.scale, zoom.transform.scale);
            context.translate(
              zoom.transform.translateX / zoom.transform.scale,
              zoom.transform.translateY / zoom.transform.scale
            );
            const radius = layout.deviceFrame
              ? layout.screenCornerRadius
              : layout.clipRadius;
            if (radius > 0) {
              context.beginPath();
              context.roundRect(
                0,
                0,
                layout.sourceWidth,
                layout.sourceHeight,
                radius
              );
              context.clip();
            }
            renderCursor(context, outputSeconds, {
              cursorData: data.value,
              cursorStyle: {
                ...cursorCandidate.effect.style,
                enabled: true,
              },
              segments: [createSegment(cursorCandidate.layer, outputSeconds)],
              videoWidth: layout.sourceWidth,
              videoHeight: layout.sourceHeight,
              offsetX: 0,
              offsetY: 0,
            });
          } else {
            const radius = layout.deviceFrame
              ? layout.screenCornerRadius
              : layout.clipRadius;
            if (radius > 0) {
              context.beginPath();
              context.roundRect(
                layout.screenX,
                layout.screenY,
                layout.sourceWidth,
                layout.sourceHeight,
                radius
              );
              context.clip();
            }
            renderCursor(context, outputSeconds, {
              cursorData: data.value,
              cursorStyle: {
                ...cursorCandidate.effect.style,
                enabled: true,
              },
              segments: [createSegment(cursorCandidate.layer, outputSeconds)],
              videoWidth: layout.sourceWidth,
              videoHeight: layout.sourceHeight,
              offsetX: layout.screenX,
              offsetY: layout.screenY,
            });
          }
          context.restore();
        }
      }

      const drawingSegments = evaluation.composition.effects
        .filter(
          (effect): effect is AnnotationEffect =>
            effect.kind === 'annotation' &&
            effect.enabled &&
            evaluation.outputTick >= effect.range.start &&
            evaluation.outputTick < effect.range.end
        )
        .map(effect => ({
          id: effect.id,
          startTime: effect.range.start / EDITOR_V2_TICKS_PER_SECOND,
          endTime: effect.range.end / EDITOR_V2_TICKS_PER_SECOND,
          canvasWidth: effect.canvasWidth,
          canvasHeight: effect.canvasHeight,
          annotations: effect.annotations,
        }));
      renderDrawings(context, {
        drawingSegments,
        timelineTime: outputSeconds,
        width: evaluation.composition.width,
        height: evaluation.composition.height,
      });
    },
  };
};
