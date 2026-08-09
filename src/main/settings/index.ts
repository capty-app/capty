import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { daemon } from '@/main/daemon';
import type {
  CloudConfig,
  CustomBackground,
  CustomGradient,
  SettingsConfig,
  WallpaperPreset,
} from '@/types/settings.ts';
import {
  DEFAULT_CLOUD_CONFIG,
  DEFAULT_REST_PROVIDER_CONFIG,
  DEFAULT_S3_PROVIDER_CONFIG,
  DEFAULT_SETTINGS,
  DEFAULT_STORAGE_CONFIG,
  DEFAULT_ALL_IN_ONE_CONFIG,
  DEFAULT_PREVIEW_CONFIG,
  DEFAULT_SAVE_LOCATIONS_CONFIG,
} from '@/types/settings.ts';
import {
  generateFilename,
  validateNamingPattern,
  getAvailableTokens,
  type CaptureType,
} from '@/main/utils/filename-generator';
import { getConfigDir, getConfigFilePath } from '@/main/utils/paths.ts';
import { getAppVersion } from '@/main/utils/env.ts';

export { createOrShowSettingsWindow } from './window';

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = getConfigFilePath();

let currentConfig: SettingsConfig = { ...DEFAULT_SETTINGS };
let configLoaded = false;
let previewConfigListener: ((config: SettingsConfig) => void) | null = null;

export function setPreviewConfigListener(
  listener: (config: SettingsConfig) => void
): void {
  previewConfigListener = listener;
}

function migrateWallpaperConfig(
  savedWallpaper?: SettingsConfig['wallpaper']
): SettingsConfig['wallpaper'] {
  const base = {
    ...DEFAULT_SETTINGS.wallpaper,
    ...savedWallpaper,
  };

  if (base.customBackgrounds && base.customBackgrounds.length > 0) {
    return {
      customBackgrounds: base.customBackgrounds,
      presets: base.presets ?? [],
    };
  }

  const legacyGradients =
    (savedWallpaper as { customGradients?: CustomGradient[] })
      ?.customGradients ?? [];
  const migratedBackgrounds: CustomBackground[] = legacyGradients
    .filter(g => g.colors && g.angle !== undefined)
    .map(g => ({
      id: g.id,
      type: 'gradient' as const,
      data: {
        colors: g.colors!,
        angle: g.angle!,
      },
    }));

  return {
    customBackgrounds: migratedBackgrounds,
    presets: base.presets ?? [],
  };
}

export function migrateCloudConfig(savedCloud: unknown): CloudConfig {
  if (!savedCloud || typeof savedCloud !== 'object') {
    return { ...DEFAULT_CLOUD_CONFIG };
  }

  const raw = savedCloud as Record<string, unknown>;
  const hasNestedS3 = raw.s3 && typeof raw.s3 === 'object';
  const hasLegacyFlatS3 =
    typeof raw.endpoint === 'string' ||
    typeof raw.bucket === 'string' ||
    typeof raw.accessKeyId === 'string';

  const s3Source = hasNestedS3
    ? (raw.s3 as Record<string, unknown>)
    : hasLegacyFlatS3
      ? raw
      : {};

  const restSource =
    raw.rest && typeof raw.rest === 'object'
      ? (raw.rest as Record<string, unknown>)
      : {};
  const hasConfiguredS3 = [
    s3Source.endpoint,
    s3Source.bucket,
    s3Source.accessKeyId,
    s3Source.secretAccessKey,
  ].some(value => typeof value === 'string' && value.length > 0);
  const hasConfiguredRest =
    (typeof restSource.url === 'string' && restSource.url.length > 0) ||
    (Array.isArray(restSource.headers) && restSource.headers.length > 0) ||
    (typeof restSource.responseUrlPath === 'string' &&
      restSource.responseUrlPath.length > 0);

  let activeProvider = DEFAULT_CLOUD_CONFIG.activeProvider;

  if (raw.activeProvider === 'capty') {
    activeProvider = 'capty';
  }

  if (raw.activeProvider === 'rest' && hasConfiguredRest) {
    activeProvider = 'rest';
  }

  if ((raw.activeProvider === 's3' || hasLegacyFlatS3) && hasConfiguredS3) {
    activeProvider = 's3';
  }

  const isExistingCaptyConfig = raw.activeProvider === 'capty';
  const enabled =
    activeProvider === 'capty' && !isExistingCaptyConfig
      ? DEFAULT_CLOUD_CONFIG.enabled
      : typeof raw.enabled === 'boolean'
        ? raw.enabled
        : DEFAULT_CLOUD_CONFIG.enabled;

  return {
    enabled,
    activeProvider,
    s3: { ...DEFAULT_S3_PROVIDER_CONFIG, ...s3Source },
    rest: {
      ...DEFAULT_REST_PROVIDER_CONFIG,
      ...restSource,
    },
  };
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): SettingsConfig {
  if (configLoaded) {
    return currentConfig;
  }

  try {
    ensureConfigDir();
    if (fs.existsSync(CONFIG_FILE)) {
      const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const savedConfig = JSON.parse(fileContent);
      currentConfig = {
        general: { ...DEFAULT_SETTINGS.general, ...savedConfig.general },
        screenshot: {
          ...DEFAULT_SETTINGS.screenshot,
          ...savedConfig.screenshot,
        },
        shortcuts: {
          screenshot: {
            ...DEFAULT_SETTINGS.shortcuts.screenshot,
            ...savedConfig.shortcuts?.screenshot,
          },
          captureText:
            savedConfig.shortcuts?.captureText ??
            DEFAULT_SETTINGS.shortcuts.captureText,
          scanQRCode:
            savedConfig.shortcuts?.scanQRCode ??
            DEFAULT_SETTINGS.shortcuts.scanQRCode,
          timerCapture:
            savedConfig.shortcuts?.timerCapture ??
            DEFAULT_SETTINGS.shortcuts.timerCapture,
          scrollCapture:
            savedConfig.shortcuts?.scrollCapture ??
            DEFAULT_SETTINGS.shortcuts.scrollCapture,
          recording: {
            ...DEFAULT_SETTINGS.shortcuts.recording,
            ...savedConfig.shortcuts?.recording,
          },
          history:
            savedConfig.shortcuts?.history ??
            DEFAULT_SETTINGS.shortcuts.history,
          allInOne:
            savedConfig.shortcuts?.allInOne ??
            DEFAULT_SETTINGS.shortcuts.allInOne,
          openInEditor:
            savedConfig.shortcuts?.openInEditor ??
            DEFAULT_SETTINGS.shortcuts.openInEditor,
          clipboardInEditor:
            savedConfig.shortcuts?.clipboardInEditor ??
            DEFAULT_SETTINGS.shortcuts.clipboardInEditor,
          editor: {
            ...DEFAULT_SETTINGS.shortcuts.editor,
            ...savedConfig.shortcuts?.editor,
          },
          editorActions: {
            ...DEFAULT_SETTINGS.shortcuts.editorActions,
            ...savedConfig.shortcuts?.editorActions,
          },
          videoEditorSidebar: {
            ...DEFAULT_SETTINGS.shortcuts.videoEditorSidebar,
            ...savedConfig.shortcuts?.videoEditorSidebar,
          },
        },
        editor: { ...DEFAULT_SETTINGS.editor, ...savedConfig.editor },
        wallpaper: migrateWallpaperConfig(savedConfig.wallpaper),
        history: { ...DEFAULT_SETTINGS.history, ...savedConfig.history },
        onboarding: {
          ...DEFAULT_SETTINGS.onboarding,
          ...savedConfig.onboarding,
        },
        cloud: migrateCloudConfig(savedConfig.cloud),
        recording: { ...DEFAULT_SETTINGS.recording, ...savedConfig.recording },
        storage: { ...DEFAULT_STORAGE_CONFIG, ...savedConfig.storage },
        saveLocations: {
          ...DEFAULT_SAVE_LOCATIONS_CONFIG,
          ...savedConfig.saveLocations,
        },
        preview: { ...DEFAULT_PREVIEW_CONFIG, ...savedConfig.preview },
        allInOne: { ...DEFAULT_ALL_IN_ONE_CONFIG, ...savedConfig.allInOne },
        scrollCapture: {
          ...DEFAULT_SETTINGS.scrollCapture,
          ...savedConfig.scrollCapture,
        },
      };
    } else {
      currentConfig = { ...DEFAULT_SETTINGS };
      saveConfig(currentConfig);
    }
    configLoaded = true;
  } catch (error) {
    console.error('Failed to load config:', error);
    currentConfig = { ...DEFAULT_SETTINGS };
    configLoaded = true;
  }
  return currentConfig;
}

export function saveConfig(config: SettingsConfig): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    currentConfig = config;
  } catch (error) {
    console.error('Failed to save config:', error);
    throw error;
  }
}

export function getConfig(): SettingsConfig {
  if (!configLoaded) {
    loadConfig();
  }
  return currentConfig;
}

export function updateConfig(updates: Partial<SettingsConfig>): SettingsConfig {
  if (!configLoaded) {
    loadConfig();
  }

  currentConfig = {
    ...currentConfig,
    ...updates,
    general: { ...currentConfig.general, ...updates.general },
    screenshot: { ...currentConfig.screenshot, ...updates.screenshot },
    shortcuts: {
      screenshot: {
        ...currentConfig.shortcuts.screenshot,
        ...updates.shortcuts?.screenshot,
      },
      captureText:
        updates.shortcuts?.captureText ?? currentConfig.shortcuts.captureText,
      scanQRCode:
        updates.shortcuts?.scanQRCode ?? currentConfig.shortcuts.scanQRCode,
      timerCapture:
        updates.shortcuts?.timerCapture ?? currentConfig.shortcuts.timerCapture,
      scrollCapture:
        updates.shortcuts?.scrollCapture ??
        currentConfig.shortcuts.scrollCapture,
      recording: {
        ...currentConfig.shortcuts.recording,
        ...updates.shortcuts?.recording,
      },
      history: updates.shortcuts?.history ?? currentConfig.shortcuts.history,
      allInOne: updates.shortcuts?.allInOne ?? currentConfig.shortcuts.allInOne,
      openInEditor:
        updates.shortcuts?.openInEditor ?? currentConfig.shortcuts.openInEditor,
      clipboardInEditor:
        updates.shortcuts?.clipboardInEditor ??
        currentConfig.shortcuts.clipboardInEditor,
      editor: {
        ...currentConfig.shortcuts.editor,
        ...updates.shortcuts?.editor,
      },
      editorActions: {
        ...currentConfig.shortcuts.editorActions,
        ...updates.shortcuts?.editorActions,
      },
      videoEditorSidebar: {
        ...currentConfig.shortcuts.videoEditorSidebar,
        ...updates.shortcuts?.videoEditorSidebar,
      },
    },
    editor: { ...currentConfig.editor, ...updates.editor },
    wallpaper: { ...currentConfig.wallpaper, ...updates.wallpaper },
    history: { ...currentConfig.history, ...updates.history },
    onboarding: { ...currentConfig.onboarding, ...updates.onboarding },
    cloud: {
      ...currentConfig.cloud,
      ...updates.cloud,
      s3: { ...currentConfig.cloud.s3, ...updates.cloud?.s3 },
      rest: {
        ...currentConfig.cloud.rest,
        ...updates.cloud?.rest,
        headers:
          updates.cloud?.rest?.headers ?? currentConfig.cloud.rest.headers,
      },
    },
    recording: { ...currentConfig.recording, ...updates.recording },
    storage: { ...currentConfig.storage, ...updates.storage },
    saveLocations: { ...currentConfig.saveLocations, ...updates.saveLocations },
    preview: { ...currentConfig.preview, ...updates.preview },
    allInOne: { ...currentConfig.allInOne, ...updates.allInOne },
    scrollCapture: { ...currentConfig.scrollCapture, ...updates.scrollCapture },
  };

  if (updates.general?.startOnLogin !== undefined) {
    try {
      app.setLoginItemSettings({
        openAtLogin: updates.general.startOnLogin,
      });
    } catch (error) {
      console.warn('Failed to set login item:', error);
    }
  }

  saveConfig(currentConfig);

  if (updates.preview !== undefined) {
    previewConfigListener?.(currentConfig);
  }

  return currentConfig;
}

export function needsOnboarding(): boolean {
  const config = getConfig();
  return !config.onboarding.completed && !config.onboarding.skipped;
}

export function markOnboardingCompleted(): void {
  updateConfig({ onboarding: { completed: true, skipped: false } });
}

export function markOnboardingSkipped(): void {
  updateConfig({ onboarding: { completed: false, skipped: true } });
}

function applyLoginItemSetting() {
  const config = getConfig();
  try {
    app.setLoginItemSettings({
      openAtLogin: config.general.startOnLogin,
    });
  } catch (error) {
    console.warn('Failed to apply login item setting:', error);
  }
}

export function init() {
  loadConfig();

  applyLoginItemSetting();

  ipcMain.handle('settings:get', () => {
    return getConfig();
  });

  ipcMain.handle(
    'settings:update',
    (_event, updates: Partial<SettingsConfig>) => {
      const updatedConfig = updateConfig(updates);

      if (updates.screenshot) {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('screenshot-settings:updated', {
            closeOnCopy: updatedConfig.screenshot.closeOnCopy,
            closeOnSave: updatedConfig.screenshot.closeOnSave,
            format: updatedConfig.screenshot.format,
          });
        });
      }

      return updatedConfig;
    }
  );

  ipcMain.handle('settings:reset', () => {
    currentConfig = { ...DEFAULT_SETTINGS };
    saveConfig(currentConfig);
    applyLoginItemSetting();
    previewConfigListener?.(currentConfig);
    return currentConfig;
  });

  ipcMain.handle('app:getVersion', () => {
    return getAppVersion();
  });

  ipcMain.handle('editor:getPreferences', () => {
    return getConfig().editor;
  });

  ipcMain.handle(
    'editor:updatePreferences',
    (_event, updates: Partial<SettingsConfig['editor']>) => {
      return updateConfig({ editor: { ...currentConfig.editor, ...updates } })
        .editor;
    }
  );

  ipcMain.handle('wallpaper:getSettings', () => {
    return getConfig().wallpaper;
  });

  ipcMain.handle(
    'wallpaper:addBackground',
    (_event, background: CustomBackground) => {
      const wallpaper = currentConfig.wallpaper;
      wallpaper.customBackgrounds.push(background);
      updateConfig({ wallpaper });
      return wallpaper.customBackgrounds;
    }
  );

  ipcMain.handle(
    'wallpaper:updateBackground',
    (_event, background: CustomBackground) => {
      const wallpaper = currentConfig.wallpaper;
      const index = wallpaper.customBackgrounds.findIndex(
        b => b.id === background.id
      );
      if (index !== -1) {
        wallpaper.customBackgrounds[index] = background;
        updateConfig({ wallpaper });
      }
      return wallpaper.customBackgrounds;
    }
  );

  ipcMain.handle('wallpaper:deleteBackground', (_event, id: string) => {
    const wallpaper = currentConfig.wallpaper;
    wallpaper.customBackgrounds = wallpaper.customBackgrounds.filter(
      b => b.id !== id
    );
    updateConfig({ wallpaper });
    return wallpaper.customBackgrounds;
  });

  ipcMain.handle('wallpaper:addPreset', (_event, preset: WallpaperPreset) => {
    const wallpaper = currentConfig.wallpaper;
    wallpaper.presets.push(preset);
    updateConfig({ wallpaper });
    return wallpaper.presets;
  });

  ipcMain.handle(
    'wallpaper:updatePreset',
    (_event, preset: WallpaperPreset) => {
      const wallpaper = currentConfig.wallpaper;
      const index = wallpaper.presets.findIndex(p => p.id === preset.id);
      if (index !== -1) {
        wallpaper.presets[index] = preset;
        updateConfig({ wallpaper });
      }
      return wallpaper.presets;
    }
  );

  ipcMain.handle('wallpaper:deletePreset', (_event, id: string) => {
    const wallpaper = currentConfig.wallpaper;
    wallpaper.presets = wallpaper.presets.filter(p => p.id !== id);
    updateConfig({ wallpaper });
    return wallpaper.presets;
  });

  ipcMain.handle('wallpaper:selectImage', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'],
          },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const filePath = result.filePaths[0];
      const imageBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();

      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.svg'
              ? 'image/svg+xml'
              : ext === '.webp'
                ? 'image/webp'
                : 'image/png';

      const base64 = imageBuffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('Failed to select image:', error);
      return null;
    }
  });

  ipcMain.handle(
    'storage:selectPath',
    async (_event, type: 'screenshots' | 'recordings') => {
      const defaultPath =
        type === 'screenshots'
          ? app.getPath('pictures')
          : app.getPath('videos');

      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        defaultPath,
        title: `Select ${type === 'screenshots' ? 'Screenshots' : 'Recordings'} Folder`,
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const selectedPath = result.filePaths[0];
      const validation = validateStoragePath(selectedPath);

      if (!validation.valid) {
        return { error: validation.error };
      }

      return { path: selectedPath };
    }
  );

  ipcMain.handle('storage:validatePattern', (_event, pattern: string) => {
    return validateNamingPattern(pattern);
  });

  ipcMain.handle(
    'storage:previewFilename',
    (_event, pattern: string, type: CaptureType) => {
      const extension = type === 'Screenshot' ? 'png' : 'mov';
      return generateFilename({ pattern, type, extension });
    }
  );

  ipcMain.handle('storage:getTokens', () => {
    return getAvailableTokens();
  });

  ipcMain.handle('storage:getDefaultPaths', () => {
    return {
      screenshots: path.join(app.getPath('pictures'), 'Capty'),
      recordings: path.join(app.getPath('videos'), 'Capty'),
    };
  });

  ipcMain.handle('cursor:selectImage', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'],
          },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const filePath = result.filePaths[0];
      const imageBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();

      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.svg'
              ? 'image/svg+xml'
              : ext === '.webp'
                ? 'image/webp'
                : ext === '.gif'
                  ? 'image/gif'
                  : 'image/png';

      const base64 = imageBuffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('Failed to select cursor image:', error);
      return null;
    }
  });

  ipcMain.handle('wallpaper:getDesktopWallpaper', async () => {
    try {
      const result = await daemon.call<{ type: string; value: string }>(
        'desktop-wallpaper',
        'get'
      );

      if (!result) {
        return null;
      }

      if (result.type === 'data') {
        return result.value;
      }

      if (result.type === 'path') {
        const filePath = result.value;
        if (!fs.existsSync(filePath)) {
          console.error('Desktop wallpaper file not found:', filePath);
          return null;
        }

        const imageBuffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType =
          ext === '.png'
            ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.heic'
                ? 'image/heic'
                : 'image/png';

        const base64 = imageBuffer.toString('base64');
        return `data:${mimeType};base64,${base64}`;
      }

      return null;
    } catch (error) {
      console.error('Failed to get desktop wallpaper:', error);
      return null;
    }
  });
}

function validateStoragePath(dirPath: string): {
  valid: boolean;
  error?: string;
} {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: 'Selected path is not a directory' };
    }

    const testFile = path.join(dirPath, `.capty-test-${Date.now()}`);
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error ? error.message : 'Unable to access directory',
    };
  }
}
