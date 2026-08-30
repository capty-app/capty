import type {
  EditorExportQuality,
  EditorExportResolution,
} from '@/types/editor-v2';

const TARGET_HEIGHT: Record<Exclude<EditorExportResolution, 'original'>, number> = {
  '4k': 2160,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
};

const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2);

export const resolveExportDimensions = (
  width: number,
  height: number,
  resolution: EditorExportResolution
): { width: number; height: number } => {
  if (resolution === 'original') return { width: even(width), height: even(height) };
  const targetHeight = TARGET_HEIGHT[resolution];
  const scale = targetHeight / height;
  return { width: even(width * scale), height: even(targetHeight) };
};

const QUALITY_BITS_PER_PIXEL: Record<EditorExportQuality, number> = {
  studio: 0.22,
  social: 0.12,
  web: 0.075,
  'web-low': 0.045,
};

export const resolveExportBitrate = (
  width: number,
  height: number,
  framesPerSecond: number,
  quality: EditorExportQuality
): number =>
  Math.max(
    1_000_000,
    Math.round(
      width * height * framesPerSecond * QUALITY_BITS_PER_PIXEL[quality]
    )
  );
