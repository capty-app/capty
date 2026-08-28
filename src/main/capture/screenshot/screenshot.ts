import { exec } from 'child_process';
import { selectDisplay } from '../display-selector';
import { screen, ipcMain, app, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { getConfig, updateConfig } from '@/main/settings';
import { daemon } from '@/main/daemon';
import {
  hideDesktopIcons,
  showDesktopIcons,
  isSupported as isDesktopIconsSupported,
  checkAccessibilityPermission,
} from '@/main/capture/desktop-icons';
import {
  freezeScreen,
  releaseScreen,
  isSupported as isFreezeScreenSupported,
} from '@/main/capture/freeze-screen';

import {
  addToHistory,
  deleteHistoryItem,
  getHistoryItemByPath,
  updateHistoryItemByPath,
} from '@/main/history';
import { getWindowData, getWindowFromWebContentsId } from './open-editor.ts';
import {
  generateScreenshotPath,
  generateScreenshotExportName,
} from './utils.ts';
import {
  rememberSaveDirectory,
  resolveSaveDialogPath,
} from '@/main/utils/save-location';
import { EditorState, HistoryItem } from '@/types/history.ts';
import type { ScreenshotFormat } from '@/types/settings';
import { openScreenshotFromHistory } from '@/main/capture/screenshot/open-from-history.ts';
import { createOrShowSettingsWindow } from '@/main/settings';
import { showCapturePreview } from '@/main/capture/capture-preview';
import { openScreenshotEditor } from '@/main/capture/screenshot/open-editor';
import { showNotification } from '@/main/utils/notifications';
import {
  resolveCaptureOutcome,
  copyScreenshotToClipboard,
} from './capture-feedback.ts';

export type CaptureMode = 'screen' | 'area' | 'window';

async function captureScreenMode(): Promise<void> {
  const config = getConfig();
  let shouldHideIcons =
    config.screenshot.hideDesktopIcons && isDesktopIconsSupported();

  if (shouldHideIcons && !checkAccessibilityPermission(false)) {
    shouldHideIcons = false;
    updateConfig({
      screenshot: { ...config.screenshot, hideDesktopIcons: false },
    });
  }

  const screenshotPath = generateScreenshotPath();
  const disableSound = !config.general.playSoundOnScreenshot;

  let command = 'screencapture';
  if (disableSound) {
    command += ' -x';
  }

  const displays = screen.getAllDisplays();
  let displayNumber = 1;

  if (displays.length > 1) {
    try {
      const selection = await selectDisplay();
      if (selection.status === 'cancelled') {
        return;
      }
      displayNumber = selection.displayNumber ?? 1;
    } catch (error) {
      console.error('Display selection failed:', error);
    }
  }

  if (shouldHideIcons) {
    await hideDesktopIcons('capture');
  }

  command += ` -D ${displayNumber} -t png "${screenshotPath}"`;

  exec(command, async (error, _stdout, stderr) => {
    if (shouldHideIcons) {
      await showDesktopIcons('capture');
    }

    if (
      resolveCaptureOutcome(error, stderr, screenshotPath, false) !== 'captured'
    ) {
      return;
    }

    const historyItem = await addToHistory(screenshotPath);

    if (config.screenshot.captureToClipboard) {
      copyScreenshotToClipboard(screenshotPath);
      return;
    }

    if (config.screenshot.showPreview) {
      showCapturePreview(screenshotPath, 'screenshot', historyItem?.id);
      return;
    }

    openScreenshotEditor(screenshotPath, historyItem?.id);
  });
}

async function captureWindowMode(): Promise<void> {
  const config = getConfig();
  let shouldHideIcons =
    config.screenshot.hideDesktopIcons && isDesktopIconsSupported();

  if (shouldHideIcons && !checkAccessibilityPermission(false)) {
    shouldHideIcons = false;
    updateConfig({
      screenshot: { ...config.screenshot, hideDesktopIcons: false },
    });
  }

  const screenshotPath = generateScreenshotPath();
  const disableSound = !config.general.playSoundOnScreenshot;

  let command = 'screencapture';
  if (disableSound) {
    command += ' -x';
  }

  if (shouldHideIcons) {
    await hideDesktopIcons('capture');
  }

  command += ` -i -o -w -t png "${screenshotPath}"`;

  exec(command, async (error, _stdout, stderr) => {
    if (shouldHideIcons) {
      await showDesktopIcons('capture');
    }

    if (
      resolveCaptureOutcome(error, stderr, screenshotPath, true) !== 'captured'
    ) {
      return;
    }

    const historyItem = await addToHistory(screenshotPath);

    if (config.screenshot.captureToClipboard) {
      copyScreenshotToClipboard(screenshotPath);
      return;
    }

    if (config.screenshot.showPreview) {
      showCapturePreview(screenshotPath, 'screenshot', historyItem?.id);
      return;
    }

    openScreenshotEditor(screenshotPath, historyItem?.id);
  });
}

async function captureAreaMode(): Promise<void> {
  const config = getConfig();
  let shouldHideIcons =
    config.screenshot.hideDesktopIcons && isDesktopIconsSupported();

  if (shouldHideIcons && !checkAccessibilityPermission(false)) {
    shouldHideIcons = false;
    updateConfig({
      screenshot: { ...config.screenshot, hideDesktopIcons: false },
    });
  }

  const shouldFreeze =
    config.screenshot.freezeScreen && isFreezeScreenSupported();

  if (shouldHideIcons) {
    await hideDesktopIcons('capture');
  }

  if (shouldFreeze) {
    await freezeScreen(true);
  }

  const screenshotPath = generateScreenshotPath();
  const disableSound = !config.general.playSoundOnScreenshot;

  let command = 'screencapture';
  if (disableSound) {
    command += ' -x';
  }
  command += ` -i -t png "${screenshotPath}"`;

  return new Promise<void>(resolve => {
    exec(command, async (error, _stdout, stderr) => {
      if (shouldFreeze) {
        await releaseScreen();
      }

      if (shouldHideIcons) {
        await showDesktopIcons('capture');
      }

      if (
        resolveCaptureOutcome(error, stderr, screenshotPath, true) !==
        'captured'
      ) {
        resolve();
        return;
      }

      const historyItem = await addToHistory(screenshotPath);

      if (config.screenshot.captureToClipboard) {
        copyScreenshotToClipboard(screenshotPath);
        resolve();
        return;
      }

      if (config.screenshot.showPreview) {
        showCapturePreview(screenshotPath, 'screenshot', historyItem?.id);
        resolve();
        return;
      }

      openScreenshotEditor(screenshotPath, historyItem?.id);
      resolve();
    });
  });
}

export default async function screenshot(mode: CaptureMode = 'area') {
  switch (mode) {
    case 'screen':
      return captureScreenMode();
    case 'window':
      return captureWindowMode();
    case 'area':
      return captureAreaMode();
  }
}

export function registerIpcHandlers(): void {
  ipcMain.on('screenshot:close-confirmed', event => {
    const data = getWindowData(event.sender.id);
    if (data && !data.window.isDestroyed()) {
      data.isClosingConfirmed = true;
      data.window.close();
    }
  });

  ipcMain.on('screenshot:copy-from-menu', event => {
    const win = getWindowFromWebContentsId(event.sender.id);
    if (win && !win.isDestroyed()) {
      win.webContents.send('screenshot:copy');
    }
  });

  ipcMain.on('save-screenshot', async event => {
    const data = getWindowData(event.sender.id);
    if (!data || !fs.existsSync(data.filePath)) {
      return;
    }

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: resolveSaveDialogPath(
        'screenshot',
        generateScreenshotExportName('png'),
        app.getPath('pictures')
      ),
      filters: [{ name: 'Images', extensions: ['png'] }],
    });

    if (!filePath) {
      return;
    }

    rememberSaveDirectory('screenshot', filePath);
    fs.copyFileSync(data.filePath, filePath);
    event.sender.send('screenshot:saved');
  });

  ipcMain.on(
    'screenshot:save-edited',
    async (event, imageBase64: string, format: ScreenshotFormat = 'png') => {
      const data = getWindowData(event.sender.id);
      if (!data) {
        return;
      }

      const extension = format === 'jpeg' ? 'jpg' : 'png';
      const filterName = format === 'jpeg' ? 'JPEG Image' : 'PNG Image';

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: resolveSaveDialogPath(
          'screenshot',
          generateScreenshotExportName(extension),
          app.getPath('pictures')
        ),
        filters: [{ name: filterName, extensions: [extension] }],
      });

      if (!filePath) {
        return;
      }

      rememberSaveDirectory('screenshot', filePath);
      fs.writeFileSync(filePath, Buffer.from(imageBase64, 'base64'));
      event.sender.send('screenshot:saved');
    }
  );

  ipcMain.on('get-screenshot-path', event => {
    const data = getWindowData(event.sender.id);
    event.returnValue = data?.filePath ?? null;
  });

  ipcMain.handle('screenshot:read-file', async (_event, filePath: string) => {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    const imageBuffer = fs.readFileSync(filePath);
    return imageBuffer.toString('base64');
  });

  ipcMain.on(
    'history:save-editor-state',
    async (event, editorState: EditorState) => {
      const data = getWindowData(event.sender.id);
      if (data?.filePath) {
        await updateHistoryItemByPath(data.filePath, editorState);
      }
    }
  );

  ipcMain.on(
    'screenshot:sync-state',
    (event, state: { editorState: EditorState | null }) => {
      const data = getWindowData(event.sender.id);
      if (data) {
        data.editorState = state.editorState;
      }
    }
  );

  ipcMain.on('history:openScreenshot', (_event, item: HistoryItem) => {
    openScreenshotFromHistory(item);
  });

  ipcMain.on('open-settings', (_event, tab?: string) => {
    createOrShowSettingsWindow(tab);
  });

  ipcMain.handle('screenshot:confirmDelete', async event => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: 'none' as const,
      title: 'Delete Screenshot?',
      message: 'Delete Screenshot?',
      detail:
        'This will permanently delete the current screenshot. This action cannot be undone.',
      buttons: ['Cancel', 'Delete'],
      defaultId: 1,
      cancelId: 0,
    };

    const result = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options);

    return result.response === 1;
  });

  ipcMain.on('screenshot:delete', async event => {
    const data = getWindowData(event.sender.id);
    if (!data) return;

    const filePath = data.filePath;

    if (!data.window.isDestroyed()) {
      data.isClosingConfirmed = true;
      data.window.close();
    }

    const historyItem = getHistoryItemByPath(filePath);
    if (historyItem) {
      await deleteHistoryItem(historyItem.id);
      if (getConfig().general.showDeletionNotifications) {
        showNotification({
          title: 'Screenshot Deleted',
          body: 'The screenshot has been permanently deleted.',
        });
      }
    }
  });

  ipcMain.handle('screenshot:print', async (_event, imageBase64: string) => {
    await daemon.call('print', 'image', { imageBase64 });
  });

  ipcMain.handle('screenshot:capture-for-editor', async event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return null;

    const config = getConfig();
    const screenshotPath = generateScreenshotPath();
    const disableSound = !config.general.playSoundOnScreenshot;

    win.hide();

    await new Promise(resolve => setTimeout(resolve, 300));

    let command = 'screencapture';
    if (disableSound) {
      command += ' -x';
    }
    command += ` -i -t png "${screenshotPath}"`;

    try {
      const captured = await new Promise<string | null>((resolve, reject) => {
        exec(command, error => {
          if (error) {
            reject(error);
            return;
          }

          if (!fs.existsSync(screenshotPath)) {
            resolve(null);
            return;
          }

          const imageBuffer = fs.readFileSync(screenshotPath);
          const base64 = imageBuffer.toString('base64');
          resolve(base64);
        });
      });

      win.show();
      win.focus();
      return captured;
    } catch (error) {
      console.error('Capture for editor failed:', error);
      win.show();
      win.focus();
      return null;
    }
  });
}
