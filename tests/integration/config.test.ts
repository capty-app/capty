import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SettingsConfig } from '@/types/settings';

// Mock file system
const mockFs = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  mkdirSync: mockFs.mkdirSync,
  readFileSync: mockFs.readFileSync,
  writeFileSync: mockFs.writeFileSync,
}));

// Mock Electron
const mockApp = {
  setLoginItemSettings: vi.fn(),
  getVersion: vi.fn(() => '1.0.0'),
  getPath: vi.fn((name: string) => {
    const paths: Record<string, string> = {
      home: '/mock/home',
    };
    return paths[name] || `/mock/${name}`;
  }),
};

const mockIpcMain = {
  handle: vi.fn(),
};

vi.mock('electron', () => ({
  app: mockApp,
  ipcMain: mockIpcMain,
}));

// Mock utils/paths
vi.mock('@/main/utils/paths', () => ({
  getConfigDir: vi.fn(() => '/mock/home/.config/capty-dev'),
  getConfigFilePath: vi.fn(() => '/mock/home/.config/capty-dev/config.json'),
}));

describe('Config Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default behavior - no config file exists
    mockFs.existsSync.mockReturnValue(false);
    // Reset writeFileSync to default behavior
    mockFs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('loadConfig', () => {
    it('should return default settings when config file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig, createDefaultSettingsConfig } =
        await import('@/main/settings');
      const config = loadConfig();

      expect(config).toEqual(createDefaultSettingsConfig());
      expect(mockFs.writeFileSync).toHaveBeenCalled(); // Should save defaults
    });

    it('should load config from file when it exists', async () => {
      const savedConfig: Partial<SettingsConfig> = {
        general: {
          startOnLogin: true,
          playSoundOnScreenshot: false,
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(savedConfig));

      const { loadConfig } = await import('@/main/settings');
      const config = loadConfig();

      expect(config.general?.startOnLogin).toBe(true);
      expect(config.general?.playSoundOnScreenshot).toBe(false);
      expect(config.recording.autoZoom).toBe(false);
    });

    it('should merge saved config with defaults for new settings', async () => {
      // Simulate old config without recording settings
      const oldConfig = {
        general: {
          startOnLogin: false,
          playSoundOnScreenshot: true,
          showNotifications: true,
        },
        screenshot: {
          hideDesktopIcons: false,
          captureToClipboard: false,
          includeCursor: true,
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(oldConfig));

      const { loadConfig } = await import('@/main/settings');
      const config = loadConfig();

      // Should have the old settings
      expect(config.general.startOnLogin).toBe(false);
      // Should also have new default settings
      expect(config.recording).toBeDefined();
      expect(config.recording.autoZoom).toBe(false);
      expect(config.editor).toBeDefined();
      expect(config.shortcuts.editorV2.length).toBeGreaterThan(0);
    });

    it('should return defaults on parse error', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const { loadConfig, createDefaultSettingsConfig } =
        await import('@/main/settings');
      const config = loadConfig();

      expect(config).toEqual(createDefaultSettingsConfig());
    });

    it('should create config directory if it does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig } = await import('@/main/settings');
      loadConfig();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        '/mock/home/.config/capty-dev',
        { recursive: true }
      );
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const { DEFAULT_SETTINGS } = await import('@/types/settings');
      const { saveConfig } = await import('@/main/settings');

      saveConfig(DEFAULT_SETTINGS);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/mock/home/.config/capty-dev/config.json',
        JSON.stringify(DEFAULT_SETTINGS, null, 2),
        'utf-8'
      );
    });

    it('should create directory before saving', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { DEFAULT_SETTINGS } = await import('@/types/settings');
      const { saveConfig } = await import('@/main/settings');

      saveConfig(DEFAULT_SETTINGS);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        '/mock/home/.config/capty-dev',
        { recursive: true }
      );
    });

    it('should throw error on save failure', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { DEFAULT_SETTINGS } = await import('@/types/settings');
      const { saveConfig } = await import('@/main/settings');

      expect(() => saveConfig(DEFAULT_SETTINGS)).toThrow('Permission denied');
    });
  });

  describe('getConfig', () => {
    it('should return current config', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig, getConfig, createDefaultSettingsConfig } =
        await import('@/main/settings');

      loadConfig();
      const config = getConfig();

      expect(config).toEqual(createDefaultSettingsConfig());
    });
  });

  describe('updateConfig', () => {
    it('should update config with partial updates', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig, updateConfig, getConfig } =
        await import('@/main/settings');

      loadConfig();

      const updates: Partial<SettingsConfig> = {
        general: {
          startOnLogin: true,
          playSoundOnScreenshot: false,
        },
      };

      updateConfig(updates);
      const config = getConfig();

      expect(config.general.startOnLogin).toBe(true);
      expect(config.general.playSoundOnScreenshot).toBe(false);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should merge nested objects correctly', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig, updateConfig, getConfig } =
        await import('@/main/settings');

      loadConfig();

      // Update only some screenshot settings
      updateConfig({
        screenshot: {
          closeOnCopy: false,
          closeOnSave: false,
          captureToClipboard: false,
          hideDesktopIcons: true,
        },
      });

      const config = getConfig();

      expect(config.screenshot.hideDesktopIcons).toBe(true);
      // Other screenshot settings should remain at defaults
      expect(config.screenshot.captureToClipboard).toBeDefined();
    });

    it('should update login item settings when startOnLogin changes', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig, updateConfig } = await import('@/main/settings');

      loadConfig();

      updateConfig({
        general: {
          startOnLogin: true,
          playSoundOnScreenshot: true,
        },
      });

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
      });
    });

    it('should handle login item setting errors gracefully', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockApp.setLoginItemSettings.mockImplementation(() => {
        throw new Error('Platform not supported');
      });

      const { loadConfig, updateConfig } = await import('@/main/settings');

      loadConfig();

      // Should not throw
      expect(() =>
        updateConfig({
          general: {
            startOnLogin: true,
            playSoundOnScreenshot: true,
          },
        })
      ).not.toThrow();
    });
  });

  describe('needsOnboarding', () => {
    it('should return true when onboarding not completed and not skipped', async () => {
      const savedConfig = {
        onboarding: { completed: false, skipped: false },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(savedConfig));

      const { loadConfig, needsOnboarding } = await import('@/main/settings');

      loadConfig();
      expect(needsOnboarding()).toBe(true);
    });

    it('should return false when onboarding completed', async () => {
      const savedConfig = {
        onboarding: { completed: true, skipped: false },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(savedConfig));

      const { loadConfig, needsOnboarding } = await import('@/main/settings');

      loadConfig();
      expect(needsOnboarding()).toBe(false);
    });

    it('should return false when onboarding skipped', async () => {
      const savedConfig = {
        onboarding: { completed: false, skipped: true },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(savedConfig));

      const { loadConfig, needsOnboarding } = await import('@/main/settings');

      loadConfig();
      expect(needsOnboarding()).toBe(false);
    });
  });

  describe('markOnboardingCompleted', () => {
    it('should set onboarding completed to true', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig, markOnboardingCompleted, getConfig } =
        await import('@/main/settings');

      loadConfig();
      markOnboardingCompleted();

      const config = getConfig();
      expect(config.onboarding.completed).toBe(true);
      expect(config.onboarding.skipped).toBe(false);
    });
  });

  describe('markOnboardingSkipped', () => {
    it('should set onboarding skipped to true', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadConfig, markOnboardingSkipped, getConfig } =
        await import('@/main/settings');

      loadConfig();
      markOnboardingSkipped();

      const config = getConfig();
      expect(config.onboarding.skipped).toBe(true);
      expect(config.onboarding.completed).toBe(false);
    });
  });

  describe('init', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ipcHandlers: Record<string, (...args: unknown[]) => any>;

    beforeEach(() => {
      ipcHandlers = {};
      mockIpcMain.handle.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (channel: string, handler: (...args: unknown[]) => any) => {
          ipcHandlers[channel] = handler;
        }
      );
    });

    it('should register all IPC handlers', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'settings:get',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'settings:update',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'settings:reset',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'app:getVersion',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'editor:getPreferences',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'editor:updatePreferences',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'wallpaper:getSettings',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'wallpaper:addBackground',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'wallpaper:updateBackground',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'wallpaper:deleteBackground',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'wallpaper:addPreset',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'wallpaper:updatePreset',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'wallpaper:deletePreset',
        expect.any(Function)
      );
    });

    it('should handle settings:get IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init, createDefaultSettingsConfig } =
        await import('@/main/settings');
      init();

      const handler = ipcHandlers['settings:get'];
      const result = handler();

      expect(result).toEqual(createDefaultSettingsConfig());
    });

    it('should handle settings:update IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const handler = ipcHandlers['settings:update'];
      const result = handler({}, { general: { startOnLogin: true } });

      expect(result.general.startOnLogin).toBe(true);
    });

    it('should handle settings:reset IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init, createDefaultSettingsConfig } =
        await import('@/main/settings');
      init();

      // First update settings
      const updateHandler = ipcHandlers['settings:update'];
      updateHandler({}, { general: { startOnLogin: true } });

      // Then reset
      const resetHandler = ipcHandlers['settings:reset'];
      const result = resetHandler();

      expect(result).toEqual(createDefaultSettingsConfig());
    });

    it('should handle app:getVersion IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const handler = ipcHandlers['app:getVersion'];
      const result = handler();

      expect(result).toBe('1.0.0');
    });

    it('should handle editor:getPreferences IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const handler = ipcHandlers['editor:getPreferences'];
      const result = handler();

      expect(result).toBeDefined();
    });

    it('should handle editor:updatePreferences IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const handler = ipcHandlers['editor:updatePreferences'];
      const result = handler({}, { fontSize: 16 });

      expect(result).toBeDefined();
    });

    it('should handle wallpaper:getSettings IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const handler = ipcHandlers['wallpaper:getSettings'];
      const result = handler();

      expect(result).toBeDefined();
      expect(result.customBackgrounds).toBeDefined();
      expect(result.presets).toBeDefined();
    });

    it('should handle wallpaper:addBackground IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const background = {
        id: 'test-background',
        type: 'gradient' as const,
        data: {
          colors: ['#FF0000', '#00FF00'],
          angle: 45,
        },
      };

      const handler = ipcHandlers['wallpaper:addBackground'];
      const result = handler({}, background);

      expect(result).toContainEqual(background);
    });

    it('should handle wallpaper:updateBackground IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const background = {
        id: 'test-background',
        type: 'gradient' as const,
        data: {
          colors: ['#FF0000', '#00FF00'],
          angle: 45,
        },
      };

      const addHandler = ipcHandlers['wallpaper:addBackground'];
      addHandler({}, background);

      const updatedBackground = {
        ...background,
        data: { ...background.data, angle: 90 },
      };
      const updateHandler = ipcHandlers['wallpaper:updateBackground'];
      const result = updateHandler({}, updatedBackground);

      expect(
        result.find(
          (b: { id: string; data: { angle: number } }) =>
            b.id === 'test-background'
        )?.data.angle
      ).toBe(90);
    });

    it('should handle wallpaper:deleteBackground IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const background = {
        id: 'test-background',
        type: 'gradient' as const,
        data: {
          colors: ['#FF0000', '#00FF00'],
          angle: 45,
        },
      };

      const addHandler = ipcHandlers['wallpaper:addBackground'];
      addHandler({}, background);

      const deleteHandler = ipcHandlers['wallpaper:deleteBackground'];
      const result = deleteHandler({}, 'test-background');

      expect(
        result.find((b: { id: string }) => b.id === 'test-background')
      ).toBeUndefined();
    });

    it('should handle wallpaper:addPreset IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const preset = {
        id: 'test-preset',
        name: 'Test Preset',
        wallpaper: {},
      };

      const handler = ipcHandlers['wallpaper:addPreset'];
      const result = handler({}, preset);

      expect(result).toContainEqual(preset);
    });

    it('should handle wallpaper:updatePreset IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const preset = {
        id: 'test-preset',
        name: 'Test Preset',
        wallpaper: {},
      };

      const addHandler = ipcHandlers['wallpaper:addPreset'];
      addHandler({}, preset);

      const updatedPreset = { ...preset, name: 'Updated Preset' };
      const updateHandler = ipcHandlers['wallpaper:updatePreset'];
      const result = updateHandler({}, updatedPreset);

      expect(
        result.find((p: { id: string; name: string }) => p.id === 'test-preset')
          ?.name
      ).toBe('Updated Preset');
    });

    it('should handle wallpaper:deletePreset IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/settings');
      init();

      const preset = {
        id: 'test-preset',
        name: 'Test Preset',
        wallpaper: {},
      };

      const addHandler = ipcHandlers['wallpaper:addPreset'];
      addHandler({}, preset);

      const deleteHandler = ipcHandlers['wallpaper:deletePreset'];
      const result = deleteHandler({}, 'test-preset');

      expect(
        result.find((p: { id: string }) => p.id === 'test-preset')
      ).toBeUndefined();
    });
  });
});
