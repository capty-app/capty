import { BrowserWindow, screen, app, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { isDev, devServerUrl } from '@/main/utils/env';
import { getRecordingVideoPath, isRecordingProject } from './recording-project';
import {
  deleteMediaPathsForSender,
  resolveVideoMediaPaths,
  setMediaPathsForSender,
  type VideoMediaPaths,
} from './media-sources';
import { registerDockWindow } from '@/main/utils/dock';

export interface VideoEditorWindowData {
  window: BrowserWindow;
  filePath: string;
  mediaPaths: VideoMediaPaths;
  isClosingConfirmed: boolean;
  isExporting: boolean;
}

const videoEditorWindows = new Map<number, VideoEditorWindowData>();

export function getWindowData(
  webContentsId: number
): VideoEditorWindowData | undefined {
  return videoEditorWindows.get(webContentsId);
}

export function setWindowData(
  webContentsId: number,
  data: VideoEditorWindowData
): void {
  videoEditorWindows.set(webContentsId, data);
  setMediaPathsForSender(webContentsId, data.mediaPaths);
}

export function deleteWindowData(webContentsId: number): void {
  videoEditorWindows.delete(webContentsId);
  deleteMediaPathsForSender(webContentsId);
}

export function updateWindowFilePath(
  webContentsId: number,
  newFilePath: string
): void {
  const data = videoEditorWindows.get(webContentsId);
  if (!data) return;

  try {
    const mediaPaths = resolveVideoMediaPaths(newFilePath);
    data.filePath = newFilePath;
    data.mediaPaths = mediaPaths;
    setMediaPathsForSender(webContentsId, mediaPaths);
  } catch {
    console.error(
      'Updated video media paths could not be resolved:',
      newFilePath
    );
  }
}

export function getWindowFromWebContentsId(
  webContentsId: number
): BrowserWindow | null {
  const data = videoEditorWindows.get(webContentsId);
  return data?.window ?? null;
}

export function getVideoEditorWindowsCount(): number {
  return videoEditorWindows.size;
}

export function createVideoEditorWindow(
  inputPath: string
): BrowserWindow | undefined {
  const videoPath = isRecordingProject(inputPath)
    ? getRecordingVideoPath(inputPath)
    : inputPath;

  if (!fs.existsSync(videoPath)) {
    console.error('Video file not found:', videoPath);
    return;
  }

  let mediaPaths: VideoMediaPaths;
  try {
    mediaPaths = resolveVideoMediaPaths(videoPath);
  } catch {
    console.error('Video media paths could not be resolved:', videoPath);
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  const windowWidth = Math.min(1280, screenWidth - 100);
  const windowHeight = Math.min(800, screenHeight - 100);

  const existingWindowCount = videoEditorWindows.size;
  const positionOffset = existingWindowCount * 30;

  const newWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: 1200,
    minHeight: 750,
    maximizable: true,
    minimizable: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev,
      webSecurity: false,
    },
    alwaysOnTop: false,
    titleBarStyle: 'hiddenInset',
    frame: true,
    x: Math.floor((screenWidth - windowWidth) / 2) + positionOffset,
    y: Math.floor((screenHeight - windowHeight) / 2) + positionOffset,
    show: false,
    backgroundColor: '#1e1e1e',
  });

  const webContentsId = newWindow.webContents.id;

  setWindowData(webContentsId, {
    window: newWindow,
    filePath: videoPath,
    mediaPaths,
    isClosingConfirmed: false,
    isExporting: false,
  });

  if (devServerUrl) {
    newWindow.loadURL(devServerUrl);
  } else {
    newWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  newWindow.webContents.on('did-finish-load', () => {
    const currentData = videoEditorWindows.get(webContentsId);
    if (!currentData) return;
    newWindow.webContents.send('load', {
      type: 'video-editor',
      params: {
        filePath: currentData.filePath,
      },
    });
  });

  newWindow.once('ready-to-show', async () => {
    await registerDockWindow(newWindow, 'video-editor');
    app.focus({ steal: true });
    newWindow.show();
    newWindow.focus();
  });

  newWindow.on('close', async () => {
    const windowData = videoEditorWindows.get(webContentsId);
    if (!windowData) return;

    if (!windowData.isClosingConfirmed && !newWindow.isDestroyed()) {
      windowData.isClosingConfirmed = true;
    }
  });

  newWindow.on('closed', () => {
    deleteWindowData(webContentsId);
  });

  return newWindow;
}

export function getVideoEditorWindow(
  webContentsId: number
): BrowserWindow | null {
  return getWindowFromWebContentsId(webContentsId);
}

export async function openVideoInEditor(): Promise<void> {
  app.focus({ steal: true });

  const result = await dialog.showOpenDialog({
    title: 'Select Video to Edit',
    filters: [
      {
        name: 'Videos',
        extensions: ['mov', 'mp4', 'webm', 'm4v', 'avi', 'mkv'],
      },
    ],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    createVideoEditorWindow(result.filePaths[0]);
  }
}
