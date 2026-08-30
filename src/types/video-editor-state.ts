import type { CursorStyle } from './cursor';
import type { CameraStyle } from './camera';
import type { KeyboardStyle } from './keyboard';
import type { SubtitleStyle } from './subtitle';
import type { AudioStyle } from './audio';
import type { ZoomSegment, ZoomSettings } from './zoom';
import type { VideoWallpaperSettings } from './video-wallpaper';
import type { DrawingSegment } from './drawing';
import type {
  VideoFormat,
  VideoResolution,
  VideoFrameRate,
  VideoQualityPreset,
  RecordingType,
} from './video';
import type { FirstFrameSettings } from './first-frame';
import type { MusicTrack } from './music';

export interface VideoEditorSegment {
  id: string;
  originalStart: number;
  originalEnd: number;
  trimMinStart: number;
  trimMaxEnd: number;
  speed?: number;
}

export interface ExportSettings {
  format: VideoFormat;
  resolution: VideoResolution;
  qualityPreset: VideoQualityPreset;
  frameRate: VideoFrameRate;
  openInFinder: boolean;
}

export interface VideoEditorState {
  version: 1;
  savedAt: string;
  recordingType?: RecordingType;

  segments: VideoEditorSegment[];

  cursorStyle: CursorStyle;

  cameraStyle: CameraStyle;

  keyboardStyle: KeyboardStyle;

  subtitleStyle: SubtitleStyle;

  audioStyle: AudioStyle;

  zoomSegments: ZoomSegment[];

  zoomSettings: ZoomSettings;

  drawingSegments?: DrawingSegment[];

  wallpaper?: VideoWallpaperSettings;

  firstFrame?: FirstFrameSettings;

  musicTracks?: MusicTrack[];

  exportSettings?: ExportSettings;

  timelineZoom?: number;

  ui: {
    sidebarOpen: boolean;
    sidebarTab:
      | 'cursor'
      | 'zoom'
      | 'drawing'
      | 'camera'
      | 'audio'
      | 'wallpaper'
      | 'keyboard'
      | 'subtitle'
      | 'first-frame'
      | 'export';
    scrubAudioEnabled?: boolean;
  };
}
