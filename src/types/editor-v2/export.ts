import type { EditorProjectV2 } from './document';
import type { Rational } from './time';

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
  error?: string;
}
