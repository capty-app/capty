import { isValidV1EditorState } from './state-validator';
import { DEFAULT_AUDIO_STYLE } from '@/types/audio';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
import type { VideoEditorState } from '@/types/video-editor-state';
import { DEFAULT_ZOOM_SETTINGS } from '@/types/zoom';
import { normalizeMusicTracks, normalizeWallpaper } from './media-normalizer';
import {
  DEFAULT_V1_TIMELINE_ZOOM,
  type NormalizedV1Project,
  type V1NormalizationDiagnostic,
  type V1ProjectNormalizationContext,
} from './normalization-types';
import { isFiniteNumber, isRecord } from './normalization-utils';
import {
  getTimelineDuration,
  normalizeSegments,
  normalizeZoomSegments,
} from './timeline-normalizer';
import {
  normalizeExportSettings,
  normalizeFirstFrame,
  normalizeStyle,
} from './value-normalizer';

export {
  DEFAULT_V1_EXPORT_SETTINGS,
  DEFAULT_V1_TIMELINE_ZOOM,
  type NormalizedV1EditorState,
  type NormalizedV1Project,
  type V1NormalizationDiagnostic,
  type V1ProjectNormalizationContext,
  type V1WallpaperPresetValue,
} from './normalization-types';

export const normalizeV1Project = (
  value: unknown,
  context: V1ProjectNormalizationContext
): NormalizedV1Project => {
  const diagnostics: V1NormalizationDiagnostic[] = [];
  const acceptedState = isValidV1EditorState(value);
  const input = acceptedState ? value : undefined;

  if (value !== null && value !== undefined && !acceptedState) {
    diagnostics.push({ code: 'invalid-state', path: '' });
  }

  const recordingType =
    input?.recordingType === 'ios-device' ? 'ios-device' : undefined;
  const segments = normalizeSegments(input?.segments, context, diagnostics);
  const timelineDuration = getTimelineDuration(segments);
  const zoomSettings = normalizeStyle(
    input?.zoomSettings,
    DEFAULT_ZOOM_SETTINGS,
    'zoomSettings',
    diagnostics
  );
  const firstFrame = normalizeFirstFrame(input?.firstFrame, diagnostics);
  const exportSettings = normalizeExportSettings(
    input?.exportSettings,
    diagnostics
  );
  const ui: Record<string, unknown> = isRecord(input?.ui) ? input.ui : {};
  const sidebarTabs: VideoEditorState['ui']['sidebarTab'][] = [
    'cursor',
    'zoom',
    'drawing',
    'camera',
    'audio',
    'wallpaper',
    'keyboard',
    'subtitle',
    'first-frame',
    'export',
  ];
  const sidebarOpen =
    typeof ui.sidebarOpen === 'boolean' ? ui.sidebarOpen : true;
  const sidebarTab = sidebarTabs.includes(
    ui.sidebarTab as VideoEditorState['ui']['sidebarTab']
  )
    ? (ui.sidebarTab as VideoEditorState['ui']['sidebarTab'])
    : 'cursor';
  const scrubAudioEnabled =
    typeof ui.scrubAudioEnabled === 'boolean' ? ui.scrubAudioEnabled : false;
  const timelineZoom =
    isFiniteNumber(input?.timelineZoom) && input.timelineZoom > 0
      ? input.timelineZoom
      : DEFAULT_V1_TIMELINE_ZOOM;

  if (
    input &&
    (sidebarOpen !== ui.sidebarOpen ||
      sidebarTab !== ui.sidebarTab ||
      (ui.scrubAudioEnabled !== undefined &&
        scrubAudioEnabled !== ui.scrubAudioEnabled) ||
      (input.timelineZoom !== undefined && timelineZoom !== input.timelineZoom))
  ) {
    diagnostics.push({ code: 'invalid-workspace', path: 'ui' });
  }

  return {
    acceptedState,
    diagnostics,
    state: {
      version: 1,
      savedAt: input?.savedAt ?? context.savedAt,
      recordingType,
      segments,
      cursorStyle: normalizeStyle(
        input?.cursorStyle,
        DEFAULT_CURSOR_STYLE,
        'cursorStyle',
        diagnostics
      ),
      cameraStyle: normalizeStyle(
        input?.cameraStyle,
        DEFAULT_CAMERA_STYLE,
        'cameraStyle',
        diagnostics
      ),
      keyboardStyle: normalizeStyle(
        input?.keyboardStyle,
        DEFAULT_KEYBOARD_STYLE,
        'keyboardStyle',
        diagnostics
      ),
      subtitleStyle: normalizeStyle(
        input?.subtitleStyle,
        DEFAULT_SUBTITLE_STYLE,
        'subtitleStyle',
        diagnostics
      ),
      audioStyle: normalizeStyle(
        input?.audioStyle,
        DEFAULT_AUDIO_STYLE,
        'audioStyle',
        diagnostics
      ),
      zoomSegments: normalizeZoomSegments(
        input?.zoomSegments,
        timelineDuration,
        diagnostics
      ),
      zoomSettings,
      drawingSegments: input?.drawingSegments ?? [],
      musicTracks: normalizeMusicTracks(
        input?.musicTracks,
        timelineDuration,
        context,
        diagnostics
      ),
      wallpaper: normalizeWallpaper(
        input?.wallpaper,
        context.wallpaperRecordingType ?? recordingType,
        context,
        diagnostics
      ),
      firstFrame,
      exportSettings,
      timelineZoom,
      ui: {
        sidebarOpen,
        sidebarTab,
        scrubAudioEnabled,
      },
    },
  };
};
