import { calculateDeviceFrameLayout } from './device-frame-layout';
import { cloneImmutable, freezeImmutable } from './immutable';
import type { CompositionSpec, EvaluatedProject } from './types';
import { calculateWallpaperDimensions } from '@/types/video-wallpaper';
import type { MediaAsset } from '@/types/editor-v2';

const DEFAULT_CANVAS_WIDTH = 1920;
const DEFAULT_CANVAS_HEIGHT = 1080;
const DEFAULT_BACKGROUND_COLOR = '#000000';

const getAssetDimensions = (
  asset: MediaAsset | undefined
): { width: number; height: number } | null => {
  if (!asset || asset.kind === 'audio') return null;
  return { width: asset.width, height: asset.height };
};

const getFallbackDimensions = (
  project: EvaluatedProject
): { width: number; height: number } => {
  const preRollAsset = project.sequence.preRoll
    ? project.assets[project.sequence.preRoll.assetId]
    : undefined;
  const preRollDimensions = getAssetDimensions(preRollAsset);
  if (preRollDimensions) return preRollDimensions;

  for (const trackId of project.sequence.videoTrackIds) {
    const track = project.sequence.tracks[trackId];
    if (!track || track.kind !== 'video') continue;
    for (const clipId of track.clipIds) {
      const dimensions = getAssetDimensions(
        project.assets[project.sequence.clips[clipId]?.assetId]
      );
      if (dimensions) return dimensions;
    }
  }

  return { width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT };
};

export const createCompositionSpec = (
  project: EvaluatedProject
): CompositionSpec => {
  const canvasSettings = [...project.sequence.effects]
    .reverse()
    .find(
      (
        effect
      ): effect is Extract<
        (typeof project.sequence.effects)[number],
        { kind: 'canvas-settings' }
      > => effect.kind === 'canvas-settings' && effect.enabled
    );
  const sourceDimensions = canvasSettings ?? getFallbackDimensions(project);
  const wallpaper = [...project.sequence.effects]
    .reverse()
    .find(effect => effect.kind === 'wallpaper' && effect.enabled);
  const deviceFrame = project.sequence.effects.some(
    effect => effect.kind === 'device-frame' && effect.enabled
  );
  const deviceLayout = deviceFrame
    ? calculateDeviceFrameLayout(
        sourceDimensions.width,
        sourceDimensions.height
      )
    : null;
  const framedDimensions = {
    width: deviceLayout?.frameWidth ?? sourceDimensions.width,
    height: deviceLayout?.frameHeight ?? sourceDimensions.height,
  };
  const dimensions =
    wallpaper?.kind === 'wallpaper'
      ? calculateWallpaperDimensions(
          framedDimensions.width,
          framedDimensions.height,
          Math.max(0, wallpaper.padding),
          canvasSettings?.aspectRatio
        )
      : framedDimensions;

  return freezeImmutable({
    width: dimensions.width,
    height: dimensions.height,
    backgroundColor:
      canvasSettings?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    effects: cloneImmutable(project.sequence.effects),
  });
};
