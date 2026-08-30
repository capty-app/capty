import { calculateDeviceFrameLayout } from '@/editor-v2/timeline/device-frame-layout';
import { calculateShadowConfig } from '@/renderer/components/video-editor/composition/wallpaper-canvas-renderer';
import { calculateWallpaperDimensions } from '@/types/video-wallpaper';
import type { SequenceEvaluation } from '@/editor-v2/timeline';
import type { ShadowConfig } from '@/renderer/components/video-editor/composition/wallpaper-canvas-renderer';

export interface LegacyCaptyContentLayout {
  sourceWidth: number;
  sourceHeight: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  screenX: number;
  screenY: number;
  screenCornerRadius: number;
  clipRadius: number;
  shadowConfig: ShadowConfig | null;
  deviceFrame: ReturnType<typeof calculateDeviceFrameLayout> | null;
}

export const resolveLegacyCaptyContentLayout = (
  evaluation: SequenceEvaluation,
  fallbackWidth = evaluation.composition.width,
  fallbackHeight = evaluation.composition.height
): LegacyCaptyContentLayout => {
  const canvasSettings = [...evaluation.composition.effects]
    .reverse()
    .find(effect => effect.kind === 'canvas-settings' && effect.enabled);
  const sourceWidth =
    canvasSettings?.kind === 'canvas-settings'
      ? canvasSettings.width
      : fallbackWidth;
  const sourceHeight =
    canvasSettings?.kind === 'canvas-settings'
      ? canvasSettings.height
      : fallbackHeight;
  const wallpaper = [...evaluation.composition.effects]
    .reverse()
    .find(effect => effect.kind === 'wallpaper' && effect.enabled);
  const deviceEnabled = evaluation.composition.effects.some(
    effect => effect.kind === 'device-frame' && effect.enabled
  );
  const deviceFrame = deviceEnabled
    ? calculateDeviceFrameLayout(sourceWidth, sourceHeight)
    : null;
  const contentWidth = deviceFrame?.frameWidth ?? sourceWidth;
  const contentHeight = deviceFrame?.frameHeight ?? sourceHeight;
  const dimensions = calculateWallpaperDimensions(
    contentWidth,
    contentHeight,
    wallpaper?.kind === 'wallpaper' ? Math.max(0, wallpaper.padding) : 0,
    canvasSettings?.kind === 'canvas-settings'
      ? canvasSettings.aspectRatio
      : null
  );
  const contentX = dimensions.videoX;
  const contentY = dimensions.videoY;
  const screenX = contentX + (deviceFrame?.screenX ?? 0);
  const screenY = contentY + (deviceFrame?.screenY ?? 0);
  return {
    sourceWidth,
    sourceHeight,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    screenX,
    screenY,
    screenCornerRadius: deviceFrame?.screenCornerRadius ?? 0,
    clipRadius:
      deviceFrame || wallpaper?.kind !== 'wallpaper'
        ? 0
        : Math.max(0, wallpaper.corners),
    shadowConfig:
      wallpaper?.kind === 'wallpaper'
        ? calculateShadowConfig(Math.max(0, wallpaper.shadow))
        : null,
    deviceFrame,
  };
};
