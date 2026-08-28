import { BrowserWindow, shell, ipcMain, app, screen } from 'electron';
import path from 'path';
import { isDev, devServerUrl } from '@/main/utils/env';
import { showNotification } from '@/main/utils/notifications';

let activationWindow: BrowserWindow | null = null;

export function createActivationWindow(): BrowserWindow {
  if (activationWindow && !activationWindow.isDestroyed()) {
    activationWindow.focus();
    return activationWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  const windowWidth = 500;
  const windowHeight = 650;

  activationWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    x: Math.floor((screenWidth - windowWidth) / 2),
    y: Math.floor((screenHeight - windowHeight) / 2),
    backgroundColor: '#1e1e1e',
    title: 'Activate Capty',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev,
    },
  });

  if (devServerUrl) {
    activationWindow.loadURL(devServerUrl);
  } else {
    activationWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  activationWindow.webContents.on('did-finish-load', () => {
    activationWindow?.webContents.send('load', {
      type: 'activation',
      params: {},
    });
  });

  activationWindow.once('ready-to-show', () => {
    app.focus({ steal: true });
    activationWindow?.show();
    activationWindow?.focus();
  });

  activationWindow.on('closed', () => {
    activationWindow = null;
  });

  activationWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return activationWindow;
}

export function closeActivationWindow(): void {
  if (activationWindow && !activationWindow.isDestroyed()) {
    activationWindow.close();
    activationWindow = null;
  }
}

export function getActivationWindow(): BrowserWindow | null {
  return activationWindow;
}

function broadcastLicenseChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('license:changed');
    }
  }
}

export function init(): void {
  ipcMain.on('license:activated', () => {
    closeActivationWindow();
    broadcastLicenseChanged();

    showNotification({
      title: 'Capty Pro Activated',
      body: 'Your license has been successfully activated. Enjoy Capty Pro!',
    });
  });

  ipcMain.on('license:close', () => {
    closeActivationWindow();
  });

  ipcMain.on('license:deleted', () => {
    broadcastLicenseChanged();
  });

  ipcMain.on('license:open-activation', () => {
    createActivationWindow();
  });
}
