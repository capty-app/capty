import { useState, useCallback } from 'react';
import type {
  WallpaperSettings,
  GradientOption,
  WindowFrameStyle,
  AspectRatioOption,
} from '@/types/editor';
import type { WallpaperImagePreset, WallpaperPreset } from '@/types/settings';
import { SVG_WALLPAPER_PRESET_INPUTS } from '@/types/wallpaper-presets';

const svgToDataUrl = (svg: string) => {
  const encoded = btoa(unescape(encodeURIComponent(svg.trim())));
  return `data:image/svg+xml;base64,${encoded}`;
};

export const SVG_WALLPAPER_PRESETS: WallpaperImagePreset[] =
  SVG_WALLPAPER_PRESET_INPUTS.map(({ id, name, svg }) => ({
    id,
    name,
    imageUrl: svgToDataUrl(svg),
  }));

const DEFAULT_WALLPAPER: WallpaperSettings = {
  gradient: null,
  backgroundImage: null,
  backgroundBlur: 0,
  noise: 0,
  padding: 0,
  inset: 0,
  corners: 0,
  shadow: 0,
  spacing: 0,
  windowFrame: { style: 'none' },
  balance: false,
  aspectRatio: 'auto',
};

interface UseWallpaperStateReturn {
  wallpaper: WallpaperSettings;
  setGradient: (gradient: GradientOption | null) => void;
  setBackgroundImage: (image: string | null) => void;
  setBackgroundBlur: (blur: number) => void;
  setNoise: (noise: number) => void;
  setPadding: (padding: number) => void;
  setInset: (inset: number) => void;
  setCorners: (corners: number) => void;
  setShadow: (shadow: number) => void;
  setSpacing: (spacing: number) => void;
  setWindowFrame: (style: WindowFrameStyle) => void;
  setBalance: (balance: boolean) => void;
  setAspectRatio: (aspectRatio: AspectRatioOption) => void;
  applyPreset: (preset: WallpaperPreset) => void;
}

export const useWallpaperState = (
  initialWallpaper?: Partial<WallpaperSettings>
): UseWallpaperStateReturn => {
  const [wallpaper, setWallpaper] = useState<WallpaperSettings>(
    initialWallpaper
      ? { ...DEFAULT_WALLPAPER, ...initialWallpaper }
      : DEFAULT_WALLPAPER
  );

  const setGradient = useCallback((gradient: GradientOption | null) => {
    setWallpaper(prev => {
      const newPadding = gradient && prev.padding === 0 ? 50 : prev.padding;
      return { ...prev, gradient, backgroundImage: null, padding: newPadding };
    });
  }, []);

  const setBackgroundImage = useCallback((backgroundImage: string | null) => {
    setWallpaper(prev => {
      const newPadding =
        backgroundImage && prev.padding === 0 ? 50 : prev.padding;
      return { ...prev, backgroundImage, gradient: null, padding: newPadding };
    });
  }, []);

  const setBackgroundBlur = useCallback((backgroundBlur: number) => {
    setWallpaper(prev => ({ ...prev, backgroundBlur }));
  }, []);

  const setNoise = useCallback((noise: number) => {
    setWallpaper(prev => ({ ...prev, noise }));
  }, []);

  const setPadding = useCallback((padding: number) => {
    setWallpaper(prev => ({ ...prev, padding }));
  }, []);

  const setInset = useCallback((inset: number) => {
    setWallpaper(prev => ({ ...prev, inset }));
  }, []);

  const setCorners = useCallback((corners: number) => {
    setWallpaper(prev => ({ ...prev, corners }));
  }, []);

  const setShadow = useCallback((shadow: number) => {
    setWallpaper(prev => ({ ...prev, shadow }));
  }, []);

  const setSpacing = useCallback((spacing: number) => {
    setWallpaper(prev => ({ ...prev, spacing }));
  }, []);

  const setWindowFrame = useCallback((style: WindowFrameStyle) => {
    setWallpaper(prev => {
      const newPadding =
        style !== 'none' && prev.padding === 0 ? 50 : prev.padding;
      return { ...prev, windowFrame: { style }, padding: newPadding };
    });
  }, []);

  const setBalance = useCallback((balance: boolean) => {
    setWallpaper(prev => ({ ...prev, balance }));
  }, []);

  const setAspectRatio = useCallback((aspectRatio: AspectRatioOption) => {
    setWallpaper(prev => ({ ...prev, aspectRatio }));
  }, []);

  const applyPreset = useCallback((preset: WallpaperPreset) => {
    setWallpaper(prev => ({
      gradient: preset.gradient,
      backgroundImage: preset.backgroundImage ?? null,
      backgroundBlur: preset.backgroundBlur ?? 0,
      noise: preset.noise ?? 0,
      padding: preset.padding,
      inset: prev.inset,
      corners: preset.corners,
      shadow: preset.shadow,
      spacing: preset.spacing ?? prev.spacing,
      windowFrame: preset.windowFrame ?? { style: 'none' },
      balance: prev.balance,
      aspectRatio: prev.aspectRatio,
    }));
  }, []);

  return {
    wallpaper,
    setGradient,
    setBackgroundImage,
    setBackgroundBlur,
    setNoise,
    setPadding,
    setInset,
    setCorners,
    setShadow,
    setSpacing,
    setWindowFrame,
    setBalance,
    setAspectRatio,
    applyPreset,
  };
};
