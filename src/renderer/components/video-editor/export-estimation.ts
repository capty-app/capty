import type { ExportSettings } from '@/types/video-editor-state';
import type {
  VideoResolution,
  VideoFrameRate,
  VideoQualityPreset,
} from '@/types/video';
import { parseVideoFrameRate } from '@/types/video';

export interface ExportEstimate {
  estimatedTimeSeconds: number;
  estimatedFileSizeBytes: number;
}

interface BenchmarkEntry {
  resolution: VideoResolution;
  qualityPreset: VideoQualityPreset;
  frameRate: VideoFrameRate;
  hasCamera: boolean;
  hasWallpaper: boolean;
  timeMultiplier: number;
  bytesPerSecond: number;
}

const BENCHMARK_DATA: BenchmarkEntry[] = [
  {
    resolution: '1080p',
    qualityPreset: 'social',
    frameRate: '30',
    hasCamera: false,
    hasWallpaper: false,
    timeMultiplier: 0.3,
    bytesPerSecond: 1693000,
  },
  {
    resolution: '1080p',
    qualityPreset: 'studio',
    frameRate: '30',
    hasCamera: true,
    hasWallpaper: true,
    timeMultiplier: 0.5,
    bytesPerSecond: 3827000,
  },
  {
    resolution: '1080p',
    qualityPreset: 'studio',
    frameRate: '30',
    hasCamera: false,
    hasWallpaper: true,
    timeMultiplier: 0.4,
    bytesPerSecond: 3316000,
  },
  {
    resolution: '1080p',
    qualityPreset: 'studio',
    frameRate: '30',
    hasCamera: false,
    hasWallpaper: false,
    timeMultiplier: 0.3,
    bytesPerSecond: 2882000,
  },
  {
    resolution: '1080p',
    qualityPreset: 'studio',
    frameRate: '60',
    hasCamera: true,
    hasWallpaper: true,
    timeMultiplier: 0.8,
    bytesPerSecond: 6318000,
  },
  {
    resolution: '4k',
    qualityPreset: 'studio',
    frameRate: '60',
    hasCamera: true,
    hasWallpaper: true,
    timeMultiplier: 1.2,
    bytesPerSecond: 14331000,
  },
  {
    resolution: '4k',
    qualityPreset: 'studio',
    frameRate: '50',
    hasCamera: false,
    hasWallpaper: false,
    timeMultiplier: 0.8,
    bytesPerSecond: 9000000,
  },
];

function getFrameRateMultiplier(frameRate: VideoFrameRate): number {
  return parseVideoFrameRate(frameRate) / 30;
}

function getResolutionMultiplier(resolution: VideoResolution): {
  time: number;
  size: number;
} {
  switch (resolution) {
    case '4k':
      return { time: 1.3, size: 2.3 };
    case '1080p':
    case 'original':
      return { time: 1.0, size: 1.0 };
    case '720p':
      return { time: 0.7, size: 0.6 };
    case '480p':
      return { time: 0.5, size: 0.35 };
    default:
      return { time: 1.0, size: 1.0 };
  }
}

function getQualityPresetMultiplier(preset: VideoQualityPreset): {
  time: number;
  size: number;
} {
  switch (preset) {
    case 'studio':
      return { time: 1.0, size: 1.0 };
    case 'social':
      return { time: 0.9, size: 0.6 };
    case 'web':
      return { time: 0.85, size: 0.4 };
    case 'web-low':
      return { time: 0.8, size: 0.25 };
    default:
      return { time: 1.0, size: 1.0 };
  }
}

function getEffectsMultiplier(
  hasCamera: boolean,
  hasWallpaper: boolean
): { time: number; size: number } {
  let timeMultiplier = 1.0;
  let sizeMultiplier = 1.0;

  if (hasCamera) {
    timeMultiplier *= 1.15;
    sizeMultiplier *= 1.2;
  }

  if (hasWallpaper) {
    timeMultiplier *= 1.1;
    sizeMultiplier *= 1.15;
  }

  return { time: timeMultiplier, size: sizeMultiplier };
}

function findClosestBenchmark(
  settings: ExportSettings,
  hasCamera: boolean,
  hasWallpaper: boolean
): BenchmarkEntry | null {
  const { resolution, qualityPreset, frameRate } = settings;

  let bestMatch: BenchmarkEntry | null = null;
  let bestScore = -1;

  for (const entry of BENCHMARK_DATA) {
    let score = 0;

    if (entry.resolution === resolution) score += 4;
    if (entry.frameRate === frameRate) score += 3;
    if (entry.qualityPreset === qualityPreset) score += 2;
    if (entry.hasCamera === hasCamera) score += 1;
    if (entry.hasWallpaper === hasWallpaper) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

export function estimateExport(
  settings: ExportSettings,
  videoDurationSeconds: number,
  hasCamera: boolean,
  hasWallpaper: boolean
): ExportEstimate {
  const closestBenchmark = findClosestBenchmark(
    settings,
    hasCamera,
    hasWallpaper
  );

  if (!closestBenchmark) {
    return {
      estimatedTimeSeconds: Math.round(videoDurationSeconds * 0.5),
      estimatedFileSizeBytes: videoDurationSeconds * 4000000,
    };
  }

  const baseTimeMultiplier = closestBenchmark.timeMultiplier;
  const baseBytesPerSecond = closestBenchmark.bytesPerSecond;

  const frameRateMult = getFrameRateMultiplier(settings.frameRate);
  const benchmarkFrameRateMult = getFrameRateMultiplier(
    closestBenchmark.frameRate
  );
  const frameRateAdjustment = frameRateMult / benchmarkFrameRateMult;

  const resMult = getResolutionMultiplier(settings.resolution);
  const benchmarkResMult = getResolutionMultiplier(closestBenchmark.resolution);
  const resTimeAdjustment = resMult.time / benchmarkResMult.time;
  const resSizeAdjustment = resMult.size / benchmarkResMult.size;

  const qualityMult = getQualityPresetMultiplier(settings.qualityPreset);
  const benchmarkQualityMult = getQualityPresetMultiplier(
    closestBenchmark.qualityPreset
  );
  const qualityTimeAdjustment = qualityMult.time / benchmarkQualityMult.time;
  const qualitySizeAdjustment = qualityMult.size / benchmarkQualityMult.size;

  const effectsMult = getEffectsMultiplier(hasCamera, hasWallpaper);
  const benchmarkEffectsMult = getEffectsMultiplier(
    closestBenchmark.hasCamera,
    closestBenchmark.hasWallpaper
  );
  const effectsTimeAdjustment = effectsMult.time / benchmarkEffectsMult.time;
  const effectsSizeAdjustment = effectsMult.size / benchmarkEffectsMult.size;

  const finalTimeMultiplier =
    baseTimeMultiplier *
    frameRateAdjustment *
    resTimeAdjustment *
    qualityTimeAdjustment *
    effectsTimeAdjustment;

  const finalBytesPerSecond =
    baseBytesPerSecond *
    frameRateAdjustment *
    resSizeAdjustment *
    qualitySizeAdjustment *
    effectsSizeAdjustment;

  return {
    estimatedTimeSeconds: Math.max(
      1,
      Math.round(videoDurationSeconds * finalTimeMultiplier)
    ),
    estimatedFileSizeBytes: Math.round(
      videoDurationSeconds * finalBytesPerSecond
    ),
  };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
