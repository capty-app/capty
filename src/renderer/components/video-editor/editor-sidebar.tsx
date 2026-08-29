import CursorSettingsPanel from './cursor-settings-panel';
import ZoomSettingsPanel from './zoom-settings-panel';
import DrawingSettingsPanel from './drawing-settings-panel';
import CameraSettingsPanel from './camera-settings-panel';
import AudioSettingsPanel from './audio-settings-panel';
import KeyboardSettingsPanel from './keyboard-settings-panel';
import SubtitleSettingsPanel from './subtitle-settings-panel';
import WallpaperSettingsPanel from './wallpaper-settings-panel';
import ExportSettingsPanel from './export-settings-panel';
import FirstFrameSettingsPanel from './first-frame-settings-panel';
import type { CursorData, CursorStyle } from '@/types/cursor';
import type { ZoomSegment, ZoomSettings } from '@/types/zoom';
import type { CameraStyle } from '@/types/camera';
import type { AudioStyle } from '@/types/audio';
import type { MusicTrack } from '@/types/music';
import type { KeyboardStyle } from '@/types/keyboard';
import type {
  SubtitleStyle,
  SubtitleData,
  SubtitleGenerationOptions,
} from '@/types/subtitle';
import type { VideoExportOptions } from '@/types/video';
import type { AspectRatio } from '@/types/aspect-ratio';
import type { VideoWallpaperSettings } from '@/types/video-wallpaper';
import type { Annotation, GradientOption } from '@/types/editor';
import type { ExportSettings } from '@/types/video-editor-state';
import type { CloudUploadState } from '@/types/cloud';
import type { RecordingType } from '@/types/video';
import type { FirstFrameSettings, FirstFrameFit } from '@/types/first-frame';
import type { DrawingSegment, DrawingToolSettings } from '@/types/drawing';

export type SidebarTab =
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

interface EditorSidebarProps {
  isOpen: boolean;
  activeTab: SidebarTab;
  cursorStyle: CursorStyle;
  onCursorStyleChange: (style: CursorStyle) => void;
  hasCursorData: boolean;
  cursorData: CursorData | null;
  videoDuration: number;
  videoWidth: number;
  videoHeight: number;
  onCursorDataSave: (
    data: CursorData
  ) => Promise<{ success: boolean; error?: string }>;
  onCursorDataImport: () => Promise<{ success: boolean; error?: string }>;
  selectedZoomId: string | null;
  zoomSegments: ZoomSegment[];
  zoomSettings: ZoomSettings;
  onUpdateZoomSegment: (id: string, updates: Partial<ZoomSegment>) => void;
  onUpdateZoomSettings: (settings: ZoomSettings) => void;
  drawingSegments: DrawingSegment[];
  selectedDrawingId: string | null;
  drawingToolSettings: DrawingToolSettings;
  textFocusNonce: number;
  onDrawingToolSettingsChange: (settings: DrawingToolSettings) => void;
  onUpdateDrawingAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onDeleteDrawingSegment: (id: string) => void;
  videoSrc: string;
  timelinePosition: number;
  cameraStyle: CameraStyle;
  onCameraStyleChange: (style: CameraStyle) => void;
  hasCameraData: boolean;
  audioStyle: AudioStyle;
  onAudioStyleChange: (style: AudioStyle) => void;
  hasMicAudio: boolean;
  hasKeyboardData: boolean;
  musicTracks: MusicTrack[];
  onAddMusicTrack: () => void;
  onRemoveMusicTrack: (id: string) => void;
  onUpdateMusicTrack: (id: string, updates: Partial<MusicTrack>) => void;
  onPlayDemo: () => void;
  onStopDemo: () => void;
  isDemoPlaying: boolean;
  keyboardStyle: KeyboardStyle;
  onKeyboardStyleChange: (style: KeyboardStyle) => void;
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (style: SubtitleStyle) => void;
  subtitleData: SubtitleData | null;
  onSubtitleGenerate: (options: SubtitleGenerationOptions) => Promise<void>;
  onSubtitleDelete: () => Promise<void>;
  onSubtitleDataSave: (
    data: SubtitleData
  ) => Promise<{ success: boolean; error?: string }>;
  onSubtitleDataImport: () => Promise<{ success: boolean; error?: string }>;
  wallpaper: VideoWallpaperSettings;
  onWallpaperEnabledChange: (enabled: boolean) => void;
  onWallpaperGradientChange: (gradient: GradientOption | null) => void;
  onWallpaperBackgroundImageChange: (image: string | null) => void;
  onWallpaperPaddingChange: (padding: number) => void;
  onWallpaperCornersChange: (corners: number) => void;
  onWallpaperShadowChange: (shadow: number) => void;
  onWallpaperAspectRatioChange: (aspectRatio: AspectRatio | null) => void;
  onWallpaperDeviceFrameChange: (deviceFrame: boolean) => void;
  recordingType?: RecordingType;
  firstFrame: FirstFrameSettings;
  onFirstFrameImageChange: (imageData: string | null) => void;
  onFirstFrameFitChange: (fit: FirstFrameFit) => void;
  exportSettings: ExportSettings;
  onExportSettingsChange: (settings: ExportSettings) => void;
  onExport: (options: VideoExportOptions) => void;
  isExporting: boolean;
  exportError: string | null;
  videoDurationSeconds: number;
  hasWallpaper: boolean;
  uploadToCloud: boolean;
  onUploadToCloudChange: (value: boolean) => void;
  cloudConfigured: boolean;
  cloudUploadState: CloudUploadState;
  uploadedUrl: string | null;
  onCopyUploadedUrl: () => void;
  onCancelCloudUpload: () => void;
}

export default function EditorSidebar({
  isOpen,
  activeTab,
  cursorStyle,
  onCursorStyleChange,
  hasCursorData,
  cursorData,
  videoDuration,
  videoWidth,
  videoHeight,
  onCursorDataSave,
  onCursorDataImport,
  selectedZoomId,
  zoomSegments,
  zoomSettings,
  onUpdateZoomSegment,
  onUpdateZoomSettings,
  drawingSegments,
  selectedDrawingId,
  drawingToolSettings,
  textFocusNonce,
  onDrawingToolSettingsChange,
  onUpdateDrawingAnnotation,
  onDeleteDrawingSegment,
  videoSrc,
  timelinePosition,
  cameraStyle,
  onCameraStyleChange,
  hasCameraData,
  audioStyle,
  onAudioStyleChange,
  hasMicAudio,
  hasKeyboardData,
  musicTracks,
  onAddMusicTrack,
  onRemoveMusicTrack,
  onUpdateMusicTrack,
  onPlayDemo,
  onStopDemo,
  isDemoPlaying,
  keyboardStyle,
  onKeyboardStyleChange,
  subtitleStyle,
  onSubtitleStyleChange,
  subtitleData,
  onSubtitleGenerate,
  onSubtitleDelete,
  onSubtitleDataSave,
  onSubtitleDataImport,
  wallpaper,
  onWallpaperEnabledChange,
  onWallpaperGradientChange,
  onWallpaperBackgroundImageChange,
  onWallpaperPaddingChange,
  onWallpaperCornersChange,
  onWallpaperShadowChange,
  onWallpaperAspectRatioChange,
  onWallpaperDeviceFrameChange,
  recordingType,
  firstFrame,
  onFirstFrameImageChange,
  onFirstFrameFitChange,
  exportSettings,
  onExportSettingsChange,
  onExport,
  isExporting,
  exportError,
  videoDurationSeconds,
  hasWallpaper,
  uploadToCloud,
  onUploadToCloudChange,
  cloudConfigured,
  cloudUploadState,
  uploadedUrl,
  onCopyUploadedUrl,
  onCancelCloudUpload,
}: EditorSidebarProps) {
  if (!isOpen) {
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'cursor':
        return (
          <CursorSettingsPanel
            cursorStyle={cursorStyle}
            onStyleChange={onCursorStyleChange}
            hasCursorData={hasCursorData}
            cursorData={cursorData}
            videoDuration={videoDuration}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            onCursorDataSave={onCursorDataSave}
            onCursorDataImport={onCursorDataImport}
          />
        );
      case 'zoom':
        return (
          <ZoomSettingsPanel
            selectedZoomId={selectedZoomId}
            zoomSegments={zoomSegments}
            zoomSettings={zoomSettings}
            onUpdateZoomSegment={onUpdateZoomSegment}
            onUpdateZoomSettings={onUpdateZoomSettings}
            videoSrc={videoSrc}
            timelinePosition={timelinePosition}
          />
        );
      case 'drawing':
        return (
          <DrawingSettingsPanel
            drawingSegments={drawingSegments}
            selectedDrawingId={selectedDrawingId}
            toolSettings={drawingToolSettings}
            textFocusNonce={textFocusNonce}
            onToolSettingsChange={onDrawingToolSettingsChange}
            onUpdateDrawingAnnotation={onUpdateDrawingAnnotation}
            onDeleteDrawingSegment={onDeleteDrawingSegment}
          />
        );
      case 'camera':
        return (
          <CameraSettingsPanel
            cameraStyle={cameraStyle}
            onStyleChange={onCameraStyleChange}
            hasCameraData={hasCameraData}
          />
        );
      case 'audio':
        return (
          <AudioSettingsPanel
            audioStyle={audioStyle}
            onStyleChange={onAudioStyleChange}
            hasKeyboardData={hasKeyboardData}
            onPlayDemo={onPlayDemo}
            onStopDemo={onStopDemo}
            isDemoPlaying={isDemoPlaying}
            musicTracks={musicTracks}
            onAddMusicTrack={onAddMusicTrack}
            onRemoveMusicTrack={onRemoveMusicTrack}
            onUpdateMusicTrack={onUpdateMusicTrack}
          />
        );
      case 'wallpaper':
        return (
          <WallpaperSettingsPanel
            wallpaper={wallpaper}
            onEnabledChange={onWallpaperEnabledChange}
            onGradientChange={onWallpaperGradientChange}
            onBackgroundImageChange={onWallpaperBackgroundImageChange}
            onPaddingChange={onWallpaperPaddingChange}
            onCornersChange={onWallpaperCornersChange}
            onShadowChange={onWallpaperShadowChange}
            onAspectRatioChange={onWallpaperAspectRatioChange}
            onDeviceFrameChange={onWallpaperDeviceFrameChange}
            recordingType={recordingType}
          />
        );
      case 'keyboard':
        return (
          <KeyboardSettingsPanel
            keyboardStyle={keyboardStyle}
            onStyleChange={onKeyboardStyleChange}
            hasKeyboardData={hasKeyboardData}
          />
        );
      case 'subtitle':
        return (
          <SubtitleSettingsPanel
            subtitleStyle={subtitleStyle}
            onStyleChange={onSubtitleStyleChange}
            subtitleData={subtitleData}
            hasMicAudio={hasMicAudio}
            videoDuration={videoDuration}
            onGenerate={onSubtitleGenerate}
            onDelete={onSubtitleDelete}
            onSubtitleDataSave={onSubtitleDataSave}
            onSubtitleDataImport={onSubtitleDataImport}
          />
        );
      case 'first-frame':
        return (
          <FirstFrameSettingsPanel
            firstFrame={firstFrame}
            onImageChange={onFirstFrameImageChange}
            onFitChange={onFirstFrameFitChange}
          />
        );
      case 'export':
        return (
          <ExportSettingsPanel
            exportSettings={exportSettings}
            onExportSettingsChange={onExportSettingsChange}
            onExport={onExport}
            isExporting={isExporting}
            exportError={exportError}
            videoDurationSeconds={videoDurationSeconds}
            hasCamera={hasCameraData}
            hasWallpaper={hasWallpaper}
            uploadToCloud={uploadToCloud}
            onUploadToCloudChange={onUploadToCloudChange}
            cloudConfigured={cloudConfigured}
            cloudUploadState={cloudUploadState}
            uploadedUrl={uploadedUrl}
            onCopyUrl={onCopyUploadedUrl}
            onCancelUpload={onCancelCloudUpload}
          />
        );
    }
  };

  return (
    <div className="bg-card border-border flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l">
      {renderContent()}
    </div>
  );
}
