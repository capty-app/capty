import type { EqualizerSettings } from '@/types/equalizer';

export function getEqualizerLayoutSettings(
  settings: EqualizerSettings,
  compositionWidth: number,
  compositionHeight: number
): EqualizerSettings {
  if (
    settings.mode !== 'circular' ||
    compositionWidth <= 0 ||
    compositionHeight <= 0
  ) {
    return settings;
  }

  const pixelWidth = settings.width * compositionWidth;
  const pixelHeight = settings.height * compositionHeight;
  const side = Math.min(pixelWidth, pixelHeight);

  return {
    ...settings,
    x: settings.x + (pixelWidth - side) / (compositionWidth * 2),
    y: settings.y + (pixelHeight - side) / (compositionHeight * 2),
    width: side / compositionWidth,
    height: side / compositionHeight,
  };
}
