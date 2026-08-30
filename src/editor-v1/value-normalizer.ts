import { DEFAULT_FIRST_FRAME_SETTINGS } from '@/types/first-frame';
import type {
  ExportSettings,
  VideoEditorState,
} from '@/types/video-editor-state';
import {
  DEFAULT_V1_EXPORT_SETTINGS,
  type V1NormalizationDiagnostic,
} from './normalization-types';
import { isRecord } from './normalization-utils';

export const normalizeStyle = <T extends object>(
  value: unknown,
  defaults: T,
  path: string,
  diagnostics: V1NormalizationDiagnostic[]
): T => {
  if (value === undefined) return { ...defaults };
  if (isRecord(value)) return { ...defaults, ...value };
  diagnostics.push({ code: 'invalid-style', path });
  return { ...defaults };
};

export const normalizeFirstFrame = (
  value: unknown,
  diagnostics: V1NormalizationDiagnostic[]
): NonNullable<VideoEditorState['firstFrame']> => {
  if (value === undefined) return { ...DEFAULT_FIRST_FRAME_SETTINGS };
  if (!isRecord(value)) {
    diagnostics.push({ code: 'invalid-first-frame', path: 'firstFrame' });
    return { ...DEFAULT_FIRST_FRAME_SETTINGS };
  }

  const enabled =
    typeof value.enabled === 'boolean'
      ? value.enabled
      : DEFAULT_FIRST_FRAME_SETTINGS.enabled;
  const imageData =
    value.imageData === null || typeof value.imageData === 'string'
      ? value.imageData
      : DEFAULT_FIRST_FRAME_SETTINGS.imageData;
  const fit =
    value.fit === 'stretch' || value.fit === 'cover'
      ? value.fit
      : DEFAULT_FIRST_FRAME_SETTINGS.fit;

  if (
    (value.enabled !== undefined && typeof value.enabled !== 'boolean') ||
    (value.imageData !== undefined &&
      value.imageData !== null &&
      typeof value.imageData !== 'string') ||
    (value.fit !== undefined &&
      value.fit !== 'stretch' &&
      value.fit !== 'cover')
  ) {
    diagnostics.push({ code: 'invalid-first-frame', path: 'firstFrame' });
  }

  if (enabled && (!imageData || imageData.length === 0)) {
    diagnostics.push({
      code: 'invalid-first-frame',
      path: 'firstFrame.imageData',
    });
    return { enabled: false, imageData: null, fit };
  }

  return { enabled, imageData, fit };
};

export const normalizeExportSettings = (
  value: unknown,
  diagnostics: V1NormalizationDiagnostic[]
): ExportSettings => {
  if (value === undefined) return { ...DEFAULT_V1_EXPORT_SETTINGS };
  if (!isRecord(value)) {
    diagnostics.push({ code: 'invalid-export', path: 'exportSettings' });
    return { ...DEFAULT_V1_EXPORT_SETTINGS };
  }

  const normalized = { ...DEFAULT_V1_EXPORT_SETTINGS };
  if (value.format === 'mp4' || value.format === 'gif') {
    normalized.format = value.format;
  }
  if (
    value.resolution === 'original' ||
    value.resolution === '4k' ||
    value.resolution === '1080p' ||
    value.resolution === '720p' ||
    value.resolution === '480p'
  ) {
    normalized.resolution = value.resolution;
  }
  if (
    value.qualityPreset === 'studio' ||
    value.qualityPreset === 'social' ||
    value.qualityPreset === 'web' ||
    value.qualityPreset === 'web-low'
  ) {
    normalized.qualityPreset = value.qualityPreset;
  }
  if (
    value.frameRate === '60' ||
    value.frameRate === '50' ||
    value.frameRate === '40' ||
    value.frameRate === '30' ||
    value.frameRate === '25' ||
    value.frameRate === '24' ||
    value.frameRate === '20' ||
    value.frameRate === '10'
  ) {
    normalized.frameRate = value.frameRate;
  }
  if (typeof value.openInFinder === 'boolean') {
    normalized.openInFinder = value.openInFinder;
  }

  return normalized;
};
