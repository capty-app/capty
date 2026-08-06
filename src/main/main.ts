import { app } from 'electron';
import { daemon } from '@/main/daemon';

if (!process.env.HOME) {
  process.env.HOME = app.getPath('home');
}

if (app.isPackaged && process.cwd() === '/') {
  try {
    process.chdir(app.getPath('userData'));
  } catch {
    console.error('Failed to change working directory to userData path');
  }
}

import * as menu from '@/main/menu/index.ts';
import * as preferences from '@/main/system/preferences.ts';
import * as settings from '@/main/settings';
import * as shortcuts from '@/main/system/shortcuts.ts';
import * as history from '@/main/history';
import * as license from '@/main/license/index.ts';
import * as update from '@/main/update/index.ts';
import * as permissions from '@/main/system/permissions.ts';
import * as cloud from '@/main/cloud/index.ts';
import * as capture from '@/main/capture';
import * as activation from '@/main/activation';
import * as onboarding from '@/main/onboarding';
import * as allInOne from '@/main/capture/all-in-one';
import * as legal from '@/main/legal';
import { initDock } from '@/main/utils/dock';
import { createVideoEditorWindow } from '@/main/capture/video/video-editor';
import {
  bufferImageFile,
  flushPendingImages,
  queueImageFile,
} from '@/main/capture/screenshot/image-open-batcher';
import { isSupportedImageFile } from '@/main/utils/image-files';
import { PROJECT_EXTENSION } from '@/types/video';

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

let pendingProjectFiles: string[] = [];
let isAppReady = false;

const handleOpenedFile = (filePath: string) => {
  if (filePath.endsWith(PROJECT_EXTENSION)) {
    if (isAppReady) {
      createVideoEditorWindow(filePath);
    } else {
      pendingProjectFiles.push(filePath);
    }
    return;
  }

  if (isSupportedImageFile(filePath)) {
    if (isAppReady) {
      queueImageFile(filePath);
    } else {
      bufferImageFile(filePath);
    }
  }
};

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  handleOpenedFile(filePath);
});

const restoreMenuBarIcon = () => {
  const config = settings.getConfig();
  if (config.general.hideMenuBarIcon) {
    settings.updateConfig({
      general: { ...config.general, hideMenuBarIcon: false },
    });
    menu.init();
  }
};

app.on('second-instance', restoreMenuBarIcon);

app.on('activate', (_event, hasVisibleWindows) => {
  if (!hasVisibleWindows) {
    restoreMenuBarIcon();
  }
});

const initializeRuntimeModules = async () => {
  shortcuts.init();
  await menu.init();
  history.init();
  update.init();
};

const initializeModules = async () => {
  await daemon.start().catch(err => {
    console.error('[daemon] Failed to start:', err);
  });

  await license.init();
  activation.init();
  settings.init();
  onboarding.init();
  permissions.initPermissionsIPC();
  capture.init();
  preferences.init();
  cloud.init();
  allInOne.init();
  legal.init();

  await onboarding.showOnboardingOrRun(initializeRuntimeModules);
};

app.whenReady().then(async () => {
  initDock();
  await initializeModules();
  await update.handleAppUpdate();

  isAppReady = true;

  for (const filePath of pendingProjectFiles) {
    createVideoEditorWindow(filePath);
  }
  pendingProjectFiles = [];

  flushPendingImages();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
