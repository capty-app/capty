import { buildBuiltInMusicTracks } from './built-in-audio';
import { sha256 } from './sha256';
import type { MusicTrack } from '@/types/music';
import { isValidPlaybackSpeed } from '@/types/playback-speed';
import type { VideoEditorState } from '@/types/video-editor-state';
import {
  DEFAULT_VIDEO_WALLPAPER,
  IOS_DEVICE_DEFAULT_WALLPAPER,
} from '@/types/video-wallpaper';
import type {
  V1NormalizationDiagnostic,
  V1ProjectNormalizationContext,
} from './normalization-types';
import { isFiniteNumber, isRecord } from './normalization-utils';

const isValidMusicTrack = (
  value: unknown,
  timelineDuration: number
): value is MusicTrack => {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    (value.source !== 'system' &&
      value.source !== 'mic' &&
      value.source !== 'music') ||
    typeof value.fileName !== 'string' ||
    !isFiniteNumber(value.volume) ||
    typeof value.enabled !== 'boolean' ||
    !isFiniteNumber(value.startTime) ||
    !isFiniteNumber(value.endTime) ||
    !isFiniteNumber(value.originalDuration) ||
    !isFiniteNumber(value.trimStart) ||
    !isFiniteNumber(value.trimEnd) ||
    !isFiniteNumber(value.speed)
  ) {
    return false;
  }

  return (
    value.volume >= 0 &&
    value.startTime >= 0 &&
    value.startTime < timelineDuration &&
    value.endTime > value.startTime &&
    value.originalDuration > 0 &&
    value.trimStart >= 0 &&
    value.trimEnd >= 0 &&
    value.trimStart + value.trimEnd < value.originalDuration &&
    isValidPlaybackSpeed(value.speed)
  );
};

export const normalizeMusicTracks = (
  value: unknown,
  timelineDuration: number,
  context: V1ProjectNormalizationContext,
  diagnostics: V1NormalizationDiagnostic[]
): MusicTrack[] => {
  const sourceTracks = Array.isArray(value) ? value : [];
  if (value !== undefined && !Array.isArray(value)) {
    diagnostics.push({ code: 'invalid-music', path: 'musicTracks' });
  }

  const tracks = sourceTracks.filter((track, index): track is MusicTrack => {
    const valid = isValidMusicTrack(track, timelineDuration);
    if (!valid) {
      diagnostics.push({ code: 'invalid-music', path: `musicTracks.${index}` });
    }
    return valid;
  });
  const builtIns = buildBuiltInMusicTracks({
    systemAudioPath: context.systemAudioPath,
    micAudioPath: context.micAudioPath,
    hasEmbeddedAudio: context.hasEmbeddedAudio,
    originalDuration: context.recordingDuration,
  });
  const missingBuiltIns = builtIns.filter(
    builtIn => !tracks.some(track => track.source === builtIn.source)
  );

  return [...missingBuiltIns, ...tracks].map(track => ({
    ...track,
    endTime: Math.min(track.endTime, timelineDuration),
  }));
};

const selectIosWallpaper = (
  context: V1ProjectNormalizationContext
): NonNullable<VideoEditorState['wallpaper']> => {
  const presets = context.wallpaperPresets;
  if (presets.length === 0) {
    return {
      ...DEFAULT_VIDEO_WALLPAPER,
      ...IOS_DEVICE_DEFAULT_WALLPAPER,
      backgroundImage: null,
    };
  }

  const index = context.sourceFingerprint
    ? Number(
        BigInt(`0x${sha256(`${context.sourceFingerprint}ios-wallpaper`)}`) %
          BigInt(presets.length)
      )
    : (context.v1WallpaperPresetIndex ?? 0) % presets.length;

  return {
    ...DEFAULT_VIDEO_WALLPAPER,
    ...IOS_DEVICE_DEFAULT_WALLPAPER,
    backgroundImage: presets[index].imageUrl,
  };
};

export const normalizeWallpaper = (
  value: unknown,
  recordingType: VideoEditorState['recordingType'],
  context: V1ProjectNormalizationContext,
  diagnostics: V1NormalizationDiagnostic[]
): NonNullable<VideoEditorState['wallpaper']> => {
  if (value === undefined) {
    return recordingType === 'ios-device'
      ? selectIosWallpaper(context)
      : { ...DEFAULT_VIDEO_WALLPAPER };
  }

  if (!isRecord(value)) {
    diagnostics.push({ code: 'invalid-wallpaper', path: 'wallpaper' });
    return { ...DEFAULT_VIDEO_WALLPAPER };
  }

  return { ...DEFAULT_VIDEO_WALLPAPER, ...value };
};
