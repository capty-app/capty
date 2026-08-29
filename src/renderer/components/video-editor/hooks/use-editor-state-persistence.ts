import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VideoEditorState,
  ExportSettings,
} from '@/types/video-editor-state';
import type { RecordingType } from '@/types/video';
import type { CursorStyle } from '@/types/cursor';
import type { CameraStyle } from '@/types/camera';
import type { KeyboardStyle } from '@/types/keyboard';
import type { SubtitleStyle } from '@/types/subtitle';
import type { AudioStyle } from '@/types/audio';
import type { ZoomSegment, ZoomSettings } from '@/types/zoom';
import type { VideoWallpaperSettings } from '@/types/video-wallpaper';
import type { FirstFrameSettings } from '@/types/first-frame';
import type { MusicTrack } from '@/types/music';
import type { DrawingSegment } from '@/types/drawing';
import type { EqualizerSegment } from '@/types/equalizer';
import type { Segment } from '../types';
import type { SidebarTab } from '../editor-sidebar';

const SAVE_DEBOUNCE_MS = 500;

interface EditorStateValues {
  segments: Segment[];
  cursorStyle: CursorStyle;
  cameraStyle: CameraStyle;
  keyboardStyle: KeyboardStyle;
  subtitleStyle: SubtitleStyle;
  audioStyle: AudioStyle;
  zoomSegments: ZoomSegment[];
  zoomSettings: ZoomSettings;
  drawingSegments: DrawingSegment[];
  wallpaper: VideoWallpaperSettings;
  firstFrame: FirstFrameSettings;
  musicTracks: MusicTrack[];
  equalizerSegments: EqualizerSegment[];
  exportSettings: ExportSettings;
  timelineZoom: number;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  scrubAudioEnabled: boolean;
}

interface UseEditorStatePersistenceProps {
  isReady: boolean;
  values: EditorStateValues;
}

interface UseEditorStatePersistenceReturn {
  loadedState: VideoEditorState | null;
  isStateLoaded: boolean;
  recordingType: RecordingType | undefined;
  resetState: () => Promise<boolean>;
}

export function useEditorStatePersistence({
  isReady,
  values,
}: UseEditorStatePersistenceProps): UseEditorStatePersistenceReturn {
  const [loadedState, setLoadedState] = useState<VideoEditorState | null>(null);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedStateRef = useRef(false);
  const isMountedRef = useRef(true);
  const isSavingRef = useRef(false);
  const recordingTypeRef = useRef<RecordingType | undefined>();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isStateLoaded) return;

    window.ipcRenderer
      .invoke('video-editor:getState')
      .then((state: VideoEditorState | null) => {
        if (!isMountedRef.current) return;
        recordingTypeRef.current = state?.recordingType;
        setLoadedState(state);
        setIsStateLoaded(true);
      })
      .catch((err: Error) => {
        console.error('Failed to load editor state:', err);
        if (isMountedRef.current) {
          setIsStateLoaded(true);
        }
      });
  }, [isStateLoaded]);

  useEffect(() => {
    if (isReady && values.segments.length > 0 && !hasAppliedStateRef.current) {
      hasAppliedStateRef.current = true;
    }
  }, [isReady, values.segments.length]);

  const saveState = useCallback(() => {
    if (!isMountedRef.current || isSavingRef.current) return;

    isSavingRef.current = true;

    const state: VideoEditorState = {
      version: 1,
      savedAt: new Date().toISOString(),
      recordingType: recordingTypeRef.current,
      segments: values.segments,
      cursorStyle: values.cursorStyle,
      cameraStyle: values.cameraStyle,
      keyboardStyle: values.keyboardStyle,
      subtitleStyle: values.subtitleStyle,
      audioStyle: values.audioStyle,
      zoomSegments: values.zoomSegments,
      zoomSettings: values.zoomSettings,
      drawingSegments: values.drawingSegments,
      wallpaper: values.wallpaper,
      firstFrame: values.firstFrame,
      musicTracks: values.musicTracks,
      equalizerSegments: values.equalizerSegments,
      exportSettings: values.exportSettings,
      timelineZoom: values.timelineZoom,
      ui: {
        sidebarOpen: values.sidebarOpen,
        sidebarTab: values.sidebarTab,
        scrubAudioEnabled: values.scrubAudioEnabled,
      },
    };

    window.ipcRenderer
      .invoke('video-editor:saveState', state)
      .catch((err: Error) => {
        console.error('Failed to save editor state:', err);
      })
      .finally(() => {
        isSavingRef.current = false;
      });
  }, [values]);

  useEffect(() => {
    if (
      !isStateLoaded ||
      !isReady ||
      !hasAppliedStateRef.current ||
      values.segments.length === 0
    ) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveState();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [isStateLoaded, isReady, values, saveState]);

  const resetState = useCallback(async (): Promise<boolean> => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      return await window.ipcRenderer.invoke('video-editor:resetState');
    } catch (err) {
      console.error('Failed to reset editor state:', err);
      return false;
    }
  }, []);

  return {
    loadedState,
    isStateLoaded,
    recordingType: recordingTypeRef.current,
    resetState,
  };
}
