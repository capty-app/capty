import { cloneImmutable, freezeImmutable } from './immutable';
import type { CompositionSpec, EvaluatedProject } from './types';
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
  const dimensions = canvasSettings ?? getFallbackDimensions(project);

  return freezeImmutable({
    width: dimensions.width,
    height: dimensions.height,
    backgroundColor:
      canvasSettings?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    effects: cloneImmutable(project.sequence.effects),
  });
};
