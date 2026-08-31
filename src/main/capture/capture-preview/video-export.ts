import { ipcMain, clipboard } from 'electron';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { app } from 'electron';
import path from 'path';
import { probeVideo } from '@/main/utils/ffmpeg';
import {
  getRecordingVideoPath,
  getSystemAudioPath,
  getMicAudioPath,
  getEditorStatePath,
  isRecordingProject,
} from '@/main/capture/video/recording-project';
import { loadCursorData } from '@/main/capture/video/cursor-data';
import { loadCameraData } from '@/main/capture/video/camera-data';
import {
  deleteMediaPathsForSender,
  resolveVideoMediaPaths,
  setMediaPathsForSender,
  type VideoMediaPaths,
} from '@/main/capture/video/media-sources';
import type { VideoMetadata } from '@/types/video';
import type { CursorData, CursorStyle } from '@/types/cursor';
import type { CameraStyle } from '@/types/camera';
import type { AudioStyle } from '@/types/audio';
import type { VideoEditorState } from '@/types/video-editor-state';

interface PreviewExportData {
  videoPath: string;
  videoMetadata: VideoMetadata;
  segments: VideoEditorState['segments'] | null;
  zoomSegments: VideoEditorState['zoomSegments'] | null;
  zoomSettings: VideoEditorState['zoomSettings'] | null;
  drawingSegments: VideoEditorState['drawingSegments'] | null;
  cursorData: CursorData | null;
  cursorStyle: CursorStyle | null;
  cameraVideoPath: string | null;
  cameraStyle: CameraStyle | null;
  systemAudioPath: string | null;
  micAudioPath: string | null;
  hasEmbeddedAudio: boolean;
  audioStyle: AudioStyle | null;
}

const CLIPBOARD_CLEANUP_MS = 5 * 60 * 1000;

function loadEditorState(filePath: string): Partial<VideoEditorState> | null {
  const statePath = getEditorStatePath(filePath);
  if (!statePath || !existsSync(statePath)) return null;

  try {
    const content = readFileSync(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function registerPreviewExportIpc(
  getPreviewVideoPath: (webContentsId: number) => string | null
): void {
  ipcMain.handle(
    'capture-preview:load-export-data',
    async (event): Promise<PreviewExportData | null> => {
      const senderId = event.sender.id;
      deleteMediaPathsForSender(senderId);

      const filePath = getPreviewVideoPath(senderId);
      if (!filePath) return null;

      const requestedVideoPath = isRecordingProject(filePath)
        ? getRecordingVideoPath(filePath)
        : filePath;

      let mediaPaths: VideoMediaPaths;
      try {
        mediaPaths = resolveVideoMediaPaths(requestedVideoPath);
      } catch {
        return null;
      }

      const probeResult = await probeVideo(mediaPaths.video);
      if (!probeResult) return null;

      const cursorData = await loadCursorData(filePath);
      const cameraData = await loadCameraData(filePath);

      const systemAudioFilePath = getSystemAudioPath(filePath);
      const micAudioFilePath = getMicAudioPath(filePath);
      const systemAudioExists = existsSync(systemAudioFilePath);
      const micAudioExists = existsSync(micAudioFilePath);

      const hasEmbeddedAudio =
        !systemAudioExists && !micAudioExists && probeResult.hasAudio;

      const editorState = loadEditorState(filePath);
      setMediaPathsForSender(senderId, mediaPaths);

      return {
        videoPath: mediaPaths.video,
        videoMetadata: probeResult.metadata,
        segments: editorState?.segments ?? null,
        zoomSegments: editorState?.zoomSegments ?? null,
        zoomSettings: editorState?.zoomSettings ?? null,
        drawingSegments: editorState?.drawingSegments ?? null,
        cursorData,
        cursorStyle: (editorState?.cursorStyle as CursorStyle) ?? null,
        cameraVideoPath: cameraData ? mediaPaths.camera : null,
        cameraStyle: (editorState?.cameraStyle as CameraStyle) ?? null,
        systemAudioPath: systemAudioExists ? systemAudioFilePath : null,
        micAudioPath: micAudioExists ? micAudioFilePath : null,
        hasEmbeddedAudio,
        audioStyle: (editorState?.audioStyle as AudioStyle) ?? null,
      };
    }
  );

  ipcMain.handle('capture-preview:get-export-output-path', (): string => {
    return path.join(app.getPath('temp'), `capty-clipboard-${Date.now()}.mp4`);
  });

  ipcMain.handle(
    'capture-preview:copy-video-to-clipboard',
    async (_, outputPath: string): Promise<boolean> => {
      if (!existsSync(outputPath)) return false;

      try {
        clipboard.writeBuffer(
          'public.file-url',
          Buffer.from(`file://${outputPath}`)
        );
        scheduleCleanup(outputPath);
        return true;
      } catch {
        return false;
      }
    }
  );
}

function scheduleCleanup(filePath: string): void {
  setTimeout(() => {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // noop
    }
  }, CLIPBOARD_CLEANUP_MS);
}
