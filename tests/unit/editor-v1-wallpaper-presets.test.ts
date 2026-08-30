import { describe, expect, it } from 'vitest';
import { SVG_WALLPAPER_PRESET_INPUTS } from '@/types/wallpaper-presets';

describe('V1 wallpaper preset inputs', () => {
  it('preserves the complete renderer-free preset catalog', () => {
    expect(SVG_WALLPAPER_PRESET_INPUTS).toHaveLength(14);
    expect(SVG_WALLPAPER_PRESET_INPUTS.map(preset => preset.id)).toEqual([
      'crimson-wave',
      'forest-glow',
      'violet-dune',
      'ocean-depth',
      'rose-garden',
      'amber-ridge',
      'mint-frost',
      'electric-kite',
      'slate-minimal',
      'nebula-threads',
      'golden-hour',
      'lavender-mist',
      'terra-mosaic',
      'arctic-aurora',
    ]);
    expect(
      SVG_WALLPAPER_PRESET_INPUTS.every(
        preset =>
          preset.name.length > 0 &&
          preset.svg.includes('<svg') &&
          preset.svg.includes('</svg>')
      )
    ).toBe(true);
  });

  it('contains unique IDs', () => {
    const ids = SVG_WALLPAPER_PRESET_INPUTS.map(preset => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
