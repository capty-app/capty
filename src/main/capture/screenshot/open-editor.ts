import {
  BrowserWindow,
  screen,
  nativeImage,
  app,
  dialog,
  clipboard,
} from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isDev, devServerUrl } from '@/main/utils/env.ts';
import { updateHistoryItemByPath, getHistoryItemByPath } from '@/main/history';
import { registerDockWindow } from '@/main/utils/dock';
import { showNotification } from '@/main/utils/notifications';
import type { ImageLayer } from '@/types/editor.ts';
import type { EditorState } from '@/types/history.ts';
import type { MultiImageAttachEdge } from '@/types/settings.ts';

interface ScreenshotWindowData {
  window: BrowserWindow;
  filePath: string;
  isClosingConfirmed: boolean;
  editorState: EditorState | null;
}

const screenshotWindows = new Map<number, ScreenshotWindowData>();

export function getWindowData(
  webContentsId: number
): ScreenshotWindowData | undefined {
  return screenshotWindows.get(webContentsId);
}

export function getWindowFromWebContentsId(
  webContentsId: number
): BrowserWindow | null {
  const data = screenshotWindows.get(webContentsId);
  return data?.window ?? null;
}

export function getImageDimensions(imagePath: string): {
  width: number;
  height: number;
} {
  const image = nativeImage.createFromPath(imagePath);
  const { width: actualPixelWidth, height: actualPixelHeight } =
    image.getSize();

  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleFactor = primaryDisplay.scaleFactor;

  return {
    width: Math.floor(actualPixelWidth / scaleFactor),
    height: Math.floor(actualPixelHeight / scaleFactor),
  };
}

function calculateWindowSize(imgWidth: number, imgHeight: number) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  const minWidth = 950;
  const minHeight = 650;
  const screenPadding = 40;
  const maxWidth = screenWidth - screenPadding * 2;
  const maxHeight = screenHeight - screenPadding * 2;
  const titleBarHeight = 40;

  let windowWidth = imgWidth;
  let windowHeight = imgHeight + titleBarHeight;

  if (windowWidth > maxWidth || windowHeight > maxHeight) {
    const scaleX = maxWidth / imgWidth;
    const scaleY = (maxHeight - titleBarHeight) / imgHeight;
    const scale = Math.min(scaleX, scaleY);

    windowWidth = Math.floor(imgWidth * scale);
    windowHeight = Math.floor(imgHeight * scale) + titleBarHeight;
  }

  windowWidth = Math.max(windowWidth, minWidth);
  windowHeight = Math.max(windowHeight, minHeight);

  return {
    windowWidth,
    windowHeight,
    screenWidth,
    screenHeight,
    minWidth,
    minHeight,
  };
}

export interface OpenScreenshotOptions {
  filePath: string;
  width: number;
  height: number;
  editorState?: EditorState;
  historyId?: string;
}

export function openScreenshotWindow(options: OpenScreenshotOptions): void {
  const { filePath, width, height, editorState, historyId } = options;

  const existingWindowCount = screenshotWindows.size;
  const positionOffset = existingWindowCount * 30;

  const {
    windowWidth,
    windowHeight,
    screenWidth,
    screenHeight,
    minWidth,
    minHeight,
  } = calculateWindowSize(width, height);

  const newWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: minWidth,
    minHeight: minHeight,
    maximizable: true,
    minimizable: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev,
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

  screenshotWindows.set(webContentsId, {
    window: newWindow,
    filePath,
    isClosingConfirmed: false,
    editorState: editorState || null,
  });

  if (devServerUrl) {
    newWindow.loadURL(devServerUrl);
  } else {
    newWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  newWindow.webContents.on('did-finish-load', () => {
    const windowData = screenshotWindows.get(webContentsId);
    const currentEditorState =
      windowData?.editorState ||
      getHistoryItemByPath(filePath)?.editorState ||
      editorState;

    newWindow.webContents.send('load', {
      type: 'screenshot',
      params: {
        filePath,
        width,
        height,
        editorState: currentEditorState,
        historyId,
      },
    });
  });

  newWindow.once('ready-to-show', async () => {
    await registerDockWindow(newWindow, 'screenshot');
    app.focus({ steal: true });
    newWindow.setAlwaysOnTop(true, 'screen-saver');
    newWindow.show();
    newWindow.focus();
    newWindow.setAlwaysOnTop(false);
  });

  newWindow.on('close', async () => {
    const windowData = screenshotWindows.get(webContentsId);
    if (!windowData) return;

    if (windowData.editorState && windowData.filePath) {
      await updateHistoryItemByPath(
        windowData.filePath,
        windowData.editorState
      );
    }
  });

  newWindow.on('closed', () => {
    screenshotWindows.delete(webContentsId);
  });
}

export function openScreenshotEditor(
  filePath: string,
  historyId?: string
): void {
  if (!fs.existsSync(filePath)) {
    console.error('Screenshot file not found:', filePath);
    return;
  }

  const { width, height } = getImageDimensions(filePath);

  openScreenshotWindow({
    filePath,
    width,
    height,
    historyId,
  });
}

function buildExtraImageLayer(
  filePath: string,
  edge: MultiImageAttachEdge
): ImageLayer | null {
  if (!fs.existsSync(filePath)) {
    console.error('Extra image not found:', filePath);
    return null;
  }

  const image = nativeImage.createFromPath(filePath);
  const { width, height } = image.getSize();

  if (width === 0 || height === 0) {
    console.error('Extra image has zero dimensions:', filePath);
    return null;
  }

  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    base64: fs.readFileSync(filePath).toString('base64'),
    naturalWidth: width,
    naturalHeight: height,
    edge,
  };
}

export function openScreenshotEditorWithLayers(
  primaryFilePath: string,
  extraFilePaths: string[],
  edge: MultiImageAttachEdge
): void {
  if (!fs.existsSync(primaryFilePath)) {
    console.error('Screenshot file not found:', primaryFilePath);
    return;
  }

  const { width, height } = getImageDimensions(primaryFilePath);
  const layers = extraFilePaths
    .map(p => buildExtraImageLayer(p, edge))
    .filter((l): l is ImageLayer => l !== null);

  openScreenshotWindow({
    filePath: primaryFilePath,
    width,
    height,
    editorState: { layers },
  });
}

export async function openImageInEditor(): Promise<void> {
  app.focus({ steal: true });

  const result = await dialog.showOpenDialog({
    title: 'Select Image to Edit',
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'],
      },
    ],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    openScreenshotEditor(result.filePaths[0]);
  }
}

export function openClipboardInEditor(): void {
  const image = clipboard.readImage();

  if (image.isEmpty()) {
    showNotification({
      title: 'No Image in Clipboard',
      body: 'Copy an image to your clipboard first, then try again.',
    });
    return;
  }

  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `capty-clipboard-${Date.now()}.png`);

  fs.writeFileSync(tempFile, image.toPNG());

  openScreenshotEditor(tempFile);
}
