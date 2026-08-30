import type { EditorProjectV2 } from './document';
import type { Rational } from './time';

export const EDITOR_EXPORT_CHUNK_SIZE = 4 * 1024 * 1024;

export type EditorExportFormat = 'mp4' | 'gif';
export type EditorExportResolution =
  'original' | '4k' | '1080p' | '720p' | '480p';
export type EditorExportQuality = 'studio' | 'social' | 'web' | 'web-low';

export interface EditorExportSettings {
  format: EditorExportFormat;
  resolution: EditorExportResolution;
  quality: EditorExportQuality;
  frameRate: Rational;
  revealWhenComplete: boolean;
  uploadWhenComplete: boolean;
}

export interface EditorWorkspaceSnapshot {
  previewFrameRate: Rational;
  exportSettings: EditorExportSettings;
}

export interface EditorExportSnapshot {
  project: EditorProjectV2;
  workspace: EditorWorkspaceSnapshot;
}

export type EditorExportStage =
  | 'preparing'
  | 'video'
  | 'audio'
  | 'muxing'
  | 'gif'
  | 'uploading'
  | 'finalizing';

export interface EditorExportProgress {
  jobId: string;
  stage: EditorExportStage;
  completed: number;
  total: number;
}

export interface EditorExportResult {
  jobId: string;
  status: 'completed' | 'cancelled' | 'failed';
  outputToken?: string;
  uploadUrl?: string;
  error?: string;
}

export interface EditorExportChunk {
  jobId: string;
  chunkId: string;
  position: number;
  data: Uint8Array<ArrayBuffer>;
}

export interface EditorExportChunkAck {
  jobId: string;
  chunkId: string;
  error?: string;
}

export const clampEditorExportSettingsToFree = (
  settings: EditorExportSettings
): EditorExportSettings => ({
  ...settings,
  format: 'mp4',
  resolution:
    settings.resolution === '720p' ||
    settings.resolution === '480p' ||
    settings.resolution === '1080p'
      ? settings.resolution
      : '1080p',
  quality: settings.quality === 'studio' ? 'social' : settings.quality,
  frameRate:
    settings.frameRate.numerator / settings.frameRate.denominator > 30
      ? { numerator: 30, denominator: 1 }
      : settings.frameRate,
  uploadWhenComplete: false,
});
