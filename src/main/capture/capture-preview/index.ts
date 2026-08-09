import {
  BrowserWindow,
  screen,
  ipcMain,
  clipboard,
  nativeImage,
  app,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { isDev, devServerUrl } from '@/main/utils/env';
import { getThumbnail } from '@/main/utils/thumbnails';
import { deleteHistoryItem, getHistoryItemByPath } from '@/main/history';
import { openScreenshotEditor } from '@/main/capture/screenshot/open-editor';
import { createVideoEditorWindow } from '@/main/capture/video/video-editor';
import { deleteVideo } from '@/main/capture/video/delete-video';
import * as settings from '@/main/settings';
import { registerPreviewExportIpc } from './video-export';
import {
  getFollowDisplay,
  initFollowActiveDisplay,
  syncFollowMonitor,
} from './follow-active-display';
import {
  animateWindowIn,
  animateWindowMove,
  getInitialBounds,
  isWindowAnimating,
  moveWindowInstantly,
} from '@/main/utils/window-animation';
import type { ContentType, PreviewDisplayInfo } from '@/types/capture-preview';

interface PreviewWindowData {
  window: BrowserWindow;
  filePath: string;
  contentType: ContentType;
  historyId?: string;
  detached: boolean;
}

const previewWindows: PreviewWindowData[] = [];

const MAX_PREVIEW_WINDOWS = 4;
const PREVIEW_WIDTH = 200;
const PREVIEW_HEIGHT = 140;
const MARGIN_BOTTOM = 24;
const MARGIN_LEFT = 24;
const WINDOW_GAP = 12;

function getSelectedPreviewDisplay(): Electron.Display {
  const followDisplay = getFollowDisplay();

  if (followDisplay) return followDisplay;

  const displays = screen.getAllDisplays();
  const selectedDisplayId = settings.getConfig().preview.displayId;
  const selectedDisplay = displays.find(
    display => display.id === selectedDisplayId
  );

  return selectedDisplay ?? screen.getPrimaryDisplay();
}

function getDisplayLabel(display: Electron.Display, index: number): string {
  const primaryDisplayId = screen.getPrimaryDisplay().id;
  const suffix = display.id === primaryDisplayId ? ' (Primary)' : '';

  return `Display ${index + 1}${suffix}`;
}

function getPreviewPosition(
  index: number,
  display: Electron.Display
): { x: number; y: number } {
  const { x: displayX, y: displayY, height } = display.workArea;

  const x = displayX + MARGIN_LEFT;
  const y =
    displayY +
    height -
    MARGIN_BOTTOM -
    PREVIEW_HEIGHT -
    index * (PREVIEW_HEIGHT + WINDOW_GAP);

  return { x, y };
}

function getPreviewDisplays(): PreviewDisplayInfo[] {
  const selectedDisplayId = getSelectedPreviewDisplay().id;

  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: getDisplayLabel(display, index),
    isSelected: display.id === selectedDisplayId,
  }));
}

function movePreviewsToDisplay(displayId: number): PreviewDisplayInfo[] {
  const displays = screen.getAllDisplays();
  const display = displays.find(item => item.id === displayId);

  if (!display) {
    return getPreviewDisplays();
  }

  settings.updateConfig({
    preview: { followActiveDisplay: false, displayId },
  });
  repositionAllWindows();

  return getPreviewDisplays();
}

function persistPreviewDisplayForWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;

  const display = screen.getDisplayMatching(window.getBounds());

  if (settings.getConfig().preview.displayId === display.id) return;

  settings.updateConfig({
    preview: { ...settings.getConfig().preview, displayId: display.id },
  });
}

function broadcastDisplaysChanged(): void {
  const displays = getPreviewDisplays();

  previewWindows.forEach(data => {
    if (!data.window.isDestroyed()) {
      data.window.webContents.send(
        'capture-preview:displays-changed',
        displays
      );
    }
  });
}

function getStackedPreviews(): PreviewWindowData[] {
  return previewWindows.filter(
    data => !data.detached && !data.window.isDestroyed()
  );
}

function repositionAllWindows(): void {
  const targetDisplay = getSelectedPreviewDisplay();

  getStackedPreviews().forEach((data, index) => {
    const position = getPreviewPosition(index, targetDisplay);
    const currentDisplayId = screen.getDisplayMatching(
      data.window.getBounds()
    ).id;

    if (currentDisplayId !== targetDisplay.id) {
      moveWindowInstantly(data.window, position);
      return;
    }

    animateWindowMove(data.window, position);
  });
}

function relocatePreviews(): void {
  repositionAllWindows();
  broadcastDisplaysChanged();
}

function handlePreviewMoved(previewData: PreviewWindowData): void {
  const { window } = previewData;

  if (window.isDestroyed()) return;
  if (isWindowAnimating(window)) return;
  if (previewData.detached) return;

  const stackedIndex = getStackedPreviews().indexOf(previewData);
  const slot = getPreviewPosition(stackedIndex, getSelectedPreviewDisplay());
  const [x, y] = window.getPosition();

  if (x === slot.x && y === slot.y) return;

  previewData.detached = true;

  if (!settings.getConfig().preview.followActiveDisplay) {
    persistPreviewDisplayForWindow(window);
  }

  syncFollowMonitor();
  relocatePreviews();
}

function removePreviewWindow(webContentsId: number): void {
  const index = previewWindows.findIndex(
    data =>
      data.window.isDestroyed() || data.window.webContents.id === webContentsId
  );

  if (index !== -1) {
    previewWindows.splice(index, 1);
    syncFollowMonitor();
    repositionAllWindows();
  }
}

function cleanupDestroyedWindows(): void {
  for (let i = previewWindows.length - 1; i >= 0; i--) {
    if (previewWindows[i].window.isDestroyed()) {
      previewWindows.splice(i, 1);
    }
  }
}

export async function showCapturePreview(
  filePath: string,
  contentType: ContentType = 'screenshot',
  historyId?: string
): Promise<void> {
  cleanupDestroyedWindows();

  if (previewWindows.length >= MAX_PREVIEW_WINDOWS) {
    const oldest = previewWindows.shift();
    if (oldest && !oldest.window.isDestroyed()) {
      oldest.window.close();
    }
    repositionAllWindows();
  }

  const thumbnailResult = await getThumbnail(filePath, contentType);

  const newIndex = getStackedPreviews().length;
  const { x, y } = getPreviewPosition(newIndex, getSelectedPreviewDisplay());

  const targetBounds = { x, y, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
  const initialBounds = getInitialBounds(targetBounds);

  const previewWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    frame: false,
    transparent: false,
    backgroundColor: '#1e1e1e',
    resizable: false,
    movable: true,
    skipTaskbar: true,
    show: false,
    hasShadow: true,
    roundedCorners: true,
    focusable: false,
    acceptFirstMouse: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev,
      webSecurity: false,
    },
  });

  previewWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });

  previewWindow.setAlwaysOnTop(true, 'screen-saver');

  const webContentsId = previewWindow.webContents.id;

  const previewData: PreviewWindowData = {
    window: previewWindow,
    filePath,
    contentType,
    historyId,
    detached: false,
  };

  previewWindows.push(previewData);
  syncFollowMonitor();

  if (devServerUrl) {
    previewWindow.loadURL(devServerUrl);
  } else {
    previewWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  previewWindow.webContents.on('did-finish-load', () => {
    previewWindow.webContents.send('load', {
      type: 'capture-preview',
      params: {
        filePath,
        contentType,
        thumbnailBase64: thumbnailResult.base64,
        historyId,
      },
    });
  });

  previewWindow.once('ready-to-show', () => {
    const stackedIndex = getStackedPreviews().indexOf(previewData);

    if (stackedIndex === -1) return;

    const slot = getPreviewPosition(stackedIndex, getSelectedPreviewDisplay());

    previewWindow.showInactive();
    animateWindowIn(previewWindow, {
      ...slot,
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
    });
  });

  previewWindow.on('moved', () => {
    handlePreviewMoved(previewData);
  });

  previewWindow.on('closed', () => {
    removePreviewWindow(webContentsId);
  });
}

function getPreviewDataByWebContentsId(
  webContentsId: number
): PreviewWindowData | undefined {
  return previewWindows.find(
    data =>
      !data.window.isDestroyed() && data.window.webContents.id === webContentsId
  );
}

export function registerCapturePreviewIpc(): void {
  registerPreviewExportIpc();

  initFollowActiveDisplay({
    getStackedCount: () => getStackedPreviews().length,
    onRelocate: relocatePreviews,
  });

  ipcMain.on('capture-preview:close', event => {
    const data = getPreviewDataByWebContentsId(event.sender.id);
    if (data && !data.window.isDestroyed()) {
      data.window.close();
    }
  });

  ipcMain.on('capture-preview:copy', event => {
    const data = getPreviewDataByWebContentsId(event.sender.id);
    if (!data) return;

    if (data.contentType === 'video') return;

    const imageBuffer = fs.readFileSync(data.filePath);
    const image = nativeImage.createFromBuffer(imageBuffer);
    clipboard.writeImage(image);

    if (!data.window.isDestroyed()) {
      data.window.close();
    }
  });

  ipcMain.on('capture-preview:open-editor', event => {
    const data = getPreviewDataByWebContentsId(event.sender.id);
    if (!data) return;

    const { filePath, contentType, historyId } = data;

    if (!data.window.isDestroyed()) {
      data.window.close();
    }

    if (contentType === 'video') {
      createVideoEditorWindow(filePath);
      return;
    }

    openScreenshotEditor(filePath, historyId);
  });

  ipcMain.on('capture-preview:delete', async event => {
    const data = getPreviewDataByWebContentsId(event.sender.id);
    if (!data) return;

    const { filePath, contentType } = data;

    if (!data.window.isDestroyed()) {
      data.window.close();
    }

    if (contentType === 'video') {
      await deleteVideo(filePath, { showNotification: false });
      return;
    }

    const historyItem = getHistoryItemByPath(filePath);
    if (!historyItem) return;

    await deleteHistoryItem(historyItem.id);
  });

  ipcMain.on('capture-preview:start-drag', (event, filePath: string) => {
    const data = getPreviewDataByWebContentsId(event.sender.id);
    if (!data) return;

    const icon = nativeImage.createFromPath(filePath);
    event.sender.startDrag({
      file: filePath,
      icon: icon.resize({ width: 100 }),
    });
  });

  ipcMain.handle('capture-preview:get-displays', () => {
    return getPreviewDisplays();
  });

  ipcMain.handle(
    'capture-preview:move-to-display',
    (_event, displayId: number) => {
      return movePreviewsToDisplay(displayId);
    }
  );

  app.whenReady().then(() => {
    screen.on('display-added', relocatePreviews);
    screen.on('display-removed', relocatePreviews);
    screen.on('display-metrics-changed', relocatePreviews);
  });
}

export function closeAllPreviewWindows(): void {
  [...previewWindows].forEach(data => {
    if (!data.window.isDestroyed()) {
      data.window.close();
    }
  });
  previewWindows.length = 0;
}
