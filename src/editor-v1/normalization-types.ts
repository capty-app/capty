import type {
  ExportSettings,
  VideoEditorState,
} from '@/types/video-editor-state';

export const DEFAULT_V1_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  resolution: 'original',
  qualityPreset: 'studio',
  frameRate: '60',
  openInFinder: true,
};

export const DEFAULT_V1_TIMELINE_ZOOM = 100;

export interface V1WallpaperPresetValue {
  id: string;
  imageUrl: string;
}

export interface V1ProjectNormalizationContext {
  recordingDuration: number;
  systemAudioPath: string | null;
  micAudioPath: string | null;
  hasEmbeddedAudio: boolean;
  wallpaperPresets: readonly V1WallpaperPresetValue[];
  sourceFingerprint?: string;
  wallpaperRecordingType?: VideoEditorState['recordingType'];
  v1WallpaperPresetIndex?: number;
  createSegmentId: () => string;
  savedAt: string;
}

export interface V1NormalizationDiagnostic {
  code:
    | 'invalid-state'
    | 'invalid-segment'
    | 'invalid-speed'
    | 'invalid-style'
    | 'invalid-zoom'
    | 'invalid-music'
    | 'invalid-wallpaper'
    | 'invalid-first-frame'
    | 'invalid-export'
    | 'invalid-workspace';
  path: string;
}

export interface NormalizedV1EditorState extends Omit<
  VideoEditorState,
  | 'drawingSegments'
  | 'musicTracks'
  | 'wallpaper'
  | 'firstFrame'
  | 'exportSettings'
  | 'timelineZoom'
  | 'ui'
> {
  drawingSegments: NonNullable<VideoEditorState['drawingSegments']>;
  musicTracks: NonNullable<VideoEditorState['musicTracks']>;
  wallpaper: NonNullable<VideoEditorState['wallpaper']>;
  firstFrame: NonNullable<VideoEditorState['firstFrame']>;
  exportSettings: NonNullable<VideoEditorState['exportSettings']>;
  timelineZoom: number;
  ui: VideoEditorState['ui'] & { scrubAudioEnabled: boolean };
}

export interface NormalizedV1Project {
  state: NormalizedV1EditorState;
  acceptedState: boolean;
  diagnostics: V1NormalizationDiagnostic[];
}
