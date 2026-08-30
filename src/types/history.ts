import type { Annotation, ImageLayer, WallpaperSettings } from './editor';
import type { EditorProjectLocation } from './editor-project';

export type HistoryItemType = 'screenshot' | 'video';

export interface EditorState {
  annotations?: Annotation[];
  wallpaper?: WallpaperSettings;
  layers?: ImageLayer[];
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  originalPath: string;
  type: HistoryItemType;
  editorState: EditorState | null;
  duration?: number;
  projectLocation?: EditorProjectLocation;
}

export interface HistoryConfig {
  enabled: boolean;
  maxItems: number;
  filter: HistoryFilterType;
  sortOrder: HistorySortOrder;
  layout: HistoryLayout;
}

export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
  enabled: true,
  maxItems: 50,
  filter: 'all',
  sortOrder: 'newest',
  layout: 'grid',
};

export interface VideoRecordingFeatures {
  hasMic: boolean;
  hasSystemAudio: boolean;
  hasCamera: boolean;
  hasCursor: boolean;
}

export type HistoryFilterType = 'all' | 'screenshot' | 'video';
export type HistorySortOrder = 'newest' | 'oldest';
export type HistoryLayout = 'grid' | 'list';
