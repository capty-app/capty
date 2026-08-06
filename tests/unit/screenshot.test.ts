import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SettingsConfig } from '@/types/settings';
import type { HistoryItem, EditorState } from '@/types/history';
import type { RectAnnotation, WallpaperSettings } from '@/types/editor';

// Mock daemon first - must be before any module that imports it
const mockDaemonCall = vi.fn();
const mockDaemonOnEvent = vi.fn();
const mockDaemonOffEvent = vi.fn();

vi.mock('@/main/daemon', () => ({
  daemon: {
    call: (...args: unknown[]) => mockDaemonCall(...args),
    onEvent: (handler: unknown) => mockDaemonOnEvent(handler),
    offEvent: (handler: unknown) => mockDaemonOffEvent(handler),
  },
}));

// Mock child_process
const mockExec = vi.fn();
vi.mock('child_process', () => ({
  exec: mockExec,
}));

// Mock fs
const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockCopyFileSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (path: string) => mockExistsSync(path),
    mkdirSync: (path: string, options?: object) => mockMkdirSync(path, options),
    readFileSync: (path: string) => mockReadFileSync(path),
    writeFileSync: (path: string, data: Buffer) =>
      mockWriteFileSync(path, data),
    copyFileSync: (src: string, dest: string) => mockCopyFileSync(src, dest),
  },
  existsSync: (path: string) => mockExistsSync(path),
  mkdirSync: (path: string, options?: object) => mockMkdirSync(path, options),
  readFileSync: (path: string) => mockReadFileSync(path),
  writeFileSync: (path: string, data: Buffer) => mockWriteFileSync(path, data),
  copyFileSync: (src: string, dest: string) => mockCopyFileSync(src, dest),
}));

// Mock Electron
const mockIpcMainOn = vi.fn();
const mockIpcMainHandle = vi.fn();
const mockDialogShowSaveDialog = vi.fn();
const mockDialogShowMessageBox = vi.fn();
const mockClipboardWriteImage = vi.fn();
const mockNativeImageCreateFromBuffer = vi.fn();
const mockNativeImageCreateFromPath = vi.fn();
const mockAppGetPath = vi.fn();
const mockScreenGetPrimaryDisplay = vi.fn();

// Mock BrowserWindow class
const mockWebContentsSend = vi.fn();
const mockWebContentsOn = vi.fn();
const mockWebContentsExecuteJavaScript = vi.fn();
const mockWindowLoadURL = vi.fn();
const mockWindowLoadFile = vi.fn();
const mockWindowShow = vi.fn();
const mockWindowClose = vi.fn();
const mockWindowIsDestroyed = vi.fn(() => false);
const mockWindowSetAlwaysOnTop = vi.fn();
const mockWindowOn = vi.fn();
const mockWindowOnce = vi.fn();

class MockBrowserWindow {
  webContents = {
    id: 1,
    send: mockWebContentsSend,
    on: mockWebContentsOn,
    executeJavaScript: mockWebContentsExecuteJavaScript,
  };
  loadURL = mockWindowLoadURL;
  loadFile = mockWindowLoadFile;
  show = mockWindowShow;
  close = mockWindowClose;
  isDestroyed = mockWindowIsDestroyed;
  setAlwaysOnTop = mockWindowSetAlwaysOnTop;
  on = mockWindowOn;
  once = mockWindowOnce;

  // Store constructor args for assertions
  static mock = { calls: [] as unknown[][] };

  constructor(options: unknown) {
    MockBrowserWindow.mock.calls.push([options]);
  }

  static resetMock() {
    MockBrowserWindow.mock.calls = [];
  }
}

const mockScreenGetAllDisplays = vi.fn();

const mockSystemPreferences = {
  isTrustedAccessibilityClient: vi.fn(() => true),
};

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => mockAppGetPath(name),
  },
  BrowserWindow: MockBrowserWindow,
  screen: {
    getPrimaryDisplay: () => mockScreenGetPrimaryDisplay(),
    getAllDisplays: () => mockScreenGetAllDisplays(),
  },
  ipcMain: {
    on: mockIpcMainOn,
    handle: mockIpcMainHandle,
  },
  dialog: {
    showSaveDialog: mockDialogShowSaveDialog,
    showMessageBox: mockDialogShowMessageBox,
  },
  clipboard: {
    writeImage: mockClipboardWriteImage,
  },
  nativeImage: {
    createFromBuffer: mockNativeImageCreateFromBuffer,
    createFromPath: mockNativeImageCreateFromPath,
  },
  systemPreferences: mockSystemPreferences,
}));

// Mock env
vi.mock('@/main/utils/env', () => ({
  isDev: false,
  devServerUrl: null,
}));

// Mock config - using complete types
const mockGeneralConfig = {
  startOnLogin: false,
  playSoundOnScreenshot: true,
};

const mockScreenshotConfig = {
  closeOnCopy: false,
  closeOnSave: false,
  captureToClipboard: false,
  hideDesktopIcons: false,
  freezeScreen: false,
};

const mockConfig: Partial<SettingsConfig> = {
  screenshot: { ...mockScreenshotConfig },
  general: { ...mockGeneralConfig },
};

const mockGetConfig = vi.fn(() => mockConfig);
const mockUpdateConfig = vi.fn();

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
  updateConfig: (config: unknown) => mockUpdateConfig(config),
  createOrShowSettingsWindow: (tab?: string) =>
    mockCreateOrShowSettingsWindow(tab),
}));

// Mock desktop-icons
const mockHideDesktopIcons = vi.fn();
const mockShowDesktopIcons = vi.fn();
const mockIsDesktopIconsSupported = vi.fn(() => true);
const mockCheckAccessibilityPermission = vi.fn(() => true);

vi.mock('@/main/capture/desktop-icons', () => ({
  hideDesktopIcons: () => mockHideDesktopIcons(),
  showDesktopIcons: () => mockShowDesktopIcons(),
  isSupported: () => mockIsDesktopIconsSupported(),
  checkAccessibilityPermission: () => mockCheckAccessibilityPermission(),
}));

// Mock freeze-screen
const mockFreezeScreen = vi.fn((_watchSpaceKey?: boolean) =>
  Promise.resolve(true)
);
const mockReleaseScreen = vi.fn();
const mockIsFreezeScreenSupported = vi.fn(() => true);

vi.mock('@/main/capture/freeze-screen', () => ({
  freezeScreen: (watchSpaceKey?: boolean) => mockFreezeScreen(watchSpaceKey),
  releaseScreen: () => mockReleaseScreen(),
  isSupported: () => mockIsFreezeScreenSupported(),
}));

// Mock history
const mockAddToHistory = vi.fn();
const mockUpdateHistoryItemByPath = vi.fn();
const mockGetHistoryItemByPath = vi.fn();
const mockDeleteHistoryItem = vi.fn();

vi.mock('@/main/history', () => ({
  addToHistory: (path: string) => mockAddToHistory(path),
  updateHistoryItemByPath: (path: string, state: unknown) =>
    mockUpdateHistoryItemByPath(path, state),
  getHistoryItemByPath: (path: string) => mockGetHistoryItemByPath(path),
  deleteHistoryItem: (id: string) => mockDeleteHistoryItem(id),
}));

// Mock settings window
const mockCreateOrShowSettingsWindow = vi.fn();

// Mock display-selector
const mockSelectDisplay = vi.fn();
const mockKillDisplaySelector = vi.fn();

vi.mock('@/main/capture/display-selector', () => ({
  selectDisplay: () => mockSelectDisplay(),
  killDisplaySelector: () => mockKillDisplaySelector(),
}));

// Mock capture-preview
const mockShowCapturePreview = vi.fn();

vi.mock('@/main/capture/capture-preview', () => ({
  showCapturePreview: (filePath: string, historyId?: string) =>
    mockShowCapturePreview(filePath, historyId),
  registerCapturePreviewIpc: vi.fn(),
}));

// Mock area-selector (uses daemon internally)
const mockStartAreaSelection = vi.fn();
const mockCancelAreaSelection = vi.fn();

vi.mock('@/main/capture/area-selector', () => ({
  startAreaSelection: (options?: {
    onSelected?: (selection: unknown) => void;
    onCancelled?: () => void;
  }) => {
    mockStartAreaSelection(options);
    if (options?.onCancelled) {
      setTimeout(() => {
        options.onCancelled?.();
      }, 0);
    }
    return Promise.resolve(null);
  },
  cancelAreaSelection: () => {
    mockCancelAreaSelection();
    return Promise.resolve();
  },
  confirmAreaSelection: vi.fn(),
  hasPendingSelection: vi.fn(() => false),
  hideAreaSelector: vi.fn(),
  showAreaSelector: vi.fn(),
  killAreaSelector: vi.fn(),
  updateAreaSelectionCallbacks: vi.fn(),
}));

// Mock capture-area
const mockCaptureArea = vi.fn().mockResolvedValue('/mock/path/screenshot.png');

vi.mock('@/main/capture/screenshot/capture-area', () => ({
  captureArea: (
    area: unknown,
    options?: { onCaptured?: () => void | Promise<void> }
  ) => {
    mockCaptureArea(area, options);
    options?.onCaptured?.();
    return Promise.resolve('/mock/path/screenshot.png');
  },
}));

// Helper to create valid WallpaperSettings
function createWallpaperSettings(
  overrides: Partial<WallpaperSettings> = {}
): WallpaperSettings {
  return {
    gradient: null,
    backgroundImage: null,
    backgroundBlur: 0,
    padding: 0,
    corners: 0,
    shadow: 0,
    windowFrame: { style: 'none' },
    ...overrides,
  };
}

describe('Screenshot Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockBrowserWindow.resetMock();

    // Default mock implementations
    mockAppGetPath.mockImplementation((name: string) => {
      const paths: Record<string, string> = {
        pictures: '/mock/Pictures',
        userData: '/mock/userData',
      };
      return paths[name] || `/mock/${name}`;
    });

    mockScreenGetPrimaryDisplay.mockReturnValue({
      scaleFactor: 2,
      workAreaSize: { width: 1920, height: 1080 },
    });

    // Default: single display setup (skip display selector)
    mockScreenGetAllDisplays.mockReturnValue([{ id: 1 }]);

    // Default: display selector returns selected (for multi-display tests)
    mockSelectDisplay.mockResolvedValue({
      status: 'selected',
      displayNumber: 1,
    });

    mockExistsSync.mockReturnValue(true);

    mockExec.mockImplementation(
      (
        _cmd: string,
        callback: (err: Error | null, stdout: string, stderr: string) => void
      ) => {
        if (callback) callback(null, '', '');
      }
    );

    mockGetConfig.mockReturnValue({
      screenshot: { ...mockScreenshotConfig },
      general: { ...mockGeneralConfig },
    });

    // Default PNG buffer for any file reads
    const defaultPngBuffer = Buffer.alloc(24);
    defaultPngBuffer.write('\x89PNG\r\n\x1a\n', 0);
    defaultPngBuffer.writeUInt32BE(800, 16);
    defaultPngBuffer.writeUInt32BE(600, 20);
    mockReadFileSync.mockReturnValue(defaultPngBuffer);

    // Default nativeImage mock for dimension reading
    mockNativeImageCreateFromPath.mockReturnValue({
      getSize: () => ({ width: 800, height: 600 }),
    });
    mockNativeImageCreateFromBuffer.mockReturnValue({
      getSize: () => ({ width: 800, height: 600 }),
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('IPC Handlers Registration', () => {
    it('should register toggle-pin handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'toggle-pin',
        expect.any(Function)
      );
    });

    it('should register screenshot:close-confirmed handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'screenshot:close-confirmed',
        expect.any(Function)
      );
    });

    it('should register screenshot:copy-from-menu handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'screenshot:copy-from-menu',
        expect.any(Function)
      );
    });

    it('should register save-screenshot handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'save-screenshot',
        expect.any(Function)
      );
    });

    it('should register screenshot:save-edited handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'screenshot:save-edited',
        expect.any(Function)
      );
    });

    it('should register get-screenshot-path handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'get-screenshot-path',
        expect.any(Function)
      );
    });

    it('should register screenshot:read-file handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainHandle).toHaveBeenCalledWith(
        'screenshot:read-file',
        expect.any(Function)
      );
    });

    it('should register history:save-editor-state handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'history:save-editor-state',
        expect.any(Function)
      );
    });

    it('should register history:openScreenshot handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'history:openScreenshot',
        expect.any(Function)
      );
    });

    it('should register open-settings handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'open-settings',
        expect.any(Function)
      );
    });

    it('should register screenshot:pin handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'screenshot:pin',
        expect.any(Function)
      );
    });

    it('should register screenshot:sync-state handler', async () => {
      await import('@/main/capture/screenshot');

      expect(mockIpcMainOn).toHaveBeenCalledWith(
        'screenshot:sync-state',
        expect.any(Function)
      );
    });
  });

  describe('screenshot() function', () => {
    it('should create Capty directory if it does not exist', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('Capty')) return false;
        return true;
      });

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('Capty'),
        { recursive: true }
      );
    });

    it('should not create Capty directory if it already exists', async () => {
      mockExistsSync.mockReturnValue(true);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('should use screencapture -i for area mode', async () => {
      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/screencapture.*-i -t png/),
        expect.any(Function)
      );
    });

    it('should execute screencapture command for screen mode', async () => {
      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/screencapture.*-t png/),
        expect.any(Function)
      );
      // Should NOT contain -i flag for screen mode
      const call = mockExec.mock.calls[0][0] as string;
      expect(call).not.toMatch(/-i/);
    });

    it('should execute screencapture command for window mode', async () => {
      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('window');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/screencapture.*-i -o -w -t png/),
        expect.any(Function)
      );
    });

    it('should add -x flag when sound is disabled', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig },
        general: { ...mockGeneralConfig, playSoundOnScreenshot: false },
      });

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/screencapture -x/),
        expect.any(Function)
      );
    });

    it('should not add -x flag when sound is enabled', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig },
        general: { ...mockGeneralConfig, playSoundOnScreenshot: true },
      });

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      const call = mockExec.mock.calls[0][0] as string;
      expect(call).not.toMatch(/screencapture -x/);
    });

    it('should hide desktop icons when enabled and supported', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, hideDesktopIcons: true },
        general: { ...mockGeneralConfig },
      });
      mockIsDesktopIconsSupported.mockReturnValue(true);
      mockCheckAccessibilityPermission.mockReturnValue(true);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockHideDesktopIcons).toHaveBeenCalled();
    });

    it('should not hide desktop icons when disabled', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, hideDesktopIcons: false },
        general: { ...mockGeneralConfig },
      });

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockHideDesktopIcons).not.toHaveBeenCalled();
    });

    it('should not hide desktop icons when not supported', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, hideDesktopIcons: true },
        general: { ...mockGeneralConfig },
      });
      mockIsDesktopIconsSupported.mockReturnValue(false);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockHideDesktopIcons).not.toHaveBeenCalled();
    });

    it('should disable hideDesktopIcons when accessibility permission is denied', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, hideDesktopIcons: true },
        general: { ...mockGeneralConfig },
      });
      mockIsDesktopIconsSupported.mockReturnValue(true);
      mockCheckAccessibilityPermission.mockReturnValue(false);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockUpdateConfig).toHaveBeenCalledWith({
        screenshot: expect.objectContaining({ hideDesktopIcons: false }),
      });
      expect(mockHideDesktopIcons).not.toHaveBeenCalled();
    });

    it('should show desktop icons after screenshot when they were hidden', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, hideDesktopIcons: true },
        general: { ...mockGeneralConfig },
      });
      mockIsDesktopIconsSupported.mockReturnValue(true);
      mockCheckAccessibilityPermission.mockReturnValue(true);

      // Simulate successful exec callback
      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) callback(null, '', '');
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockShowDesktopIcons).toHaveBeenCalled();
    });

    it('should freeze screen in area mode when freeze screen is enabled', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, freezeScreen: true },
        general: { ...mockGeneralConfig },
      });
      mockIsFreezeScreenSupported.mockReturnValue(true);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockFreezeScreen).toHaveBeenCalledWith(true);
    });

    it('should release screen after area capture completes', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, freezeScreen: true },
        general: { ...mockGeneralConfig },
      });
      mockIsFreezeScreenSupported.mockReturnValue(true);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockReleaseScreen).toHaveBeenCalled();
    });

    it('should not freeze screen in area mode when setting is disabled', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, freezeScreen: false },
        general: { ...mockGeneralConfig },
      });

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockFreezeScreen).not.toHaveBeenCalled();
    });

    it('should not freeze screen in area mode when not supported', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, freezeScreen: true },
        general: { ...mockGeneralConfig },
      });
      mockIsFreezeScreenSupported.mockReturnValue(false);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockFreezeScreen).not.toHaveBeenCalled();
    });

    it('should not freeze screen in window mode', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, freezeScreen: true },
        general: { ...mockGeneralConfig },
      });
      mockIsFreezeScreenSupported.mockReturnValue(true);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('window');

      expect(mockFreezeScreen).not.toHaveBeenCalled();
    });

    it('should not freeze screen in screen mode', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, freezeScreen: true },
        general: { ...mockGeneralConfig },
      });
      mockIsFreezeScreenSupported.mockReturnValue(true);

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockFreezeScreen).not.toHaveBeenCalled();
    });

    it('should release screen even when capture fails', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, freezeScreen: true },
        general: { ...mockGeneralConfig },
      });
      mockIsFreezeScreenSupported.mockReturnValue(true);

      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) callback(new Error('capture failed'), '', '');
        }
      );

      vi.spyOn(console, 'log').mockImplementation(() => {});

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('area');

      expect(mockReleaseScreen).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it('should default to area mode when no mode specified', async () => {
      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot();

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringMatching(/screencapture.*-i -t png/),
        expect.any(Function)
      );
    });
  });

  describe('screenshot() exec callback behavior', () => {
    it('should log error when exec returns error', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const testError = new Error('Test error');

      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) callback(testError, '', '');
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('error: Test error')
      );
      consoleSpy.mockRestore();
    });

    it('should log stderr when exec returns stderr', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) callback(null, '', 'stderr message');
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('stderr: stderr message')
      );
      consoleSpy.mockRestore();
    });

    it('should copy to clipboard when captureToClipboard is enabled', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { ...mockScreenshotConfig, captureToClipboard: true },
        general: { ...mockGeneralConfig },
      });

      // Create a valid PNG buffer (minimal PNG header)
      const pngHeader = Buffer.alloc(24);
      pngHeader.write('\x89PNG\r\n\x1a\n', 0);
      pngHeader.writeUInt32BE(100, 16); // width
      pngHeader.writeUInt32BE(100, 20); // height

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(pngHeader);
      mockNativeImageCreateFromPath.mockReturnValue({
        getSize: () => ({ width: 100, height: 100 }),
      });

      const mockImage = {
        toPNG: vi.fn(),
        getSize: () => ({ width: 100, height: 100 }),
      };
      mockNativeImageCreateFromBuffer.mockReturnValue(mockImage);

      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) callback(null, '', '');
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockNativeImageCreateFromBuffer).toHaveBeenCalled();
      expect(mockClipboardWriteImage).toHaveBeenCalledWith(mockImage);
    });

    it('should add screenshot to history on successful capture', async () => {
      // Create a valid PNG buffer
      const pngHeader = Buffer.alloc(24);
      pngHeader.write('\x89PNG\r\n\x1a\n', 0);
      pngHeader.writeUInt32BE(200, 16); // width
      pngHeader.writeUInt32BE(150, 20); // height

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(pngHeader);
      mockNativeImageCreateFromPath.mockReturnValue({
        getSize: () => ({ width: 200, height: 150 }),
      });
      mockAddToHistory.mockResolvedValue({ id: 'test-id' });

      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) callback(null, '', '');
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockAddToHistory).toHaveBeenCalledWith(
        expect.stringContaining('Screenshot ')
      );
    });

    it('should not process when screenshot file does not exist', async () => {
      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          if (callback) callback(null, '', '');
        }
      );
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('Screenshot ')) return false;
        return true;
      });

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockAddToHistory).not.toHaveBeenCalled();
    });
  });

  describe('IPC Handler: screenshot:read-file', () => {
    it('should return base64 encoded file content', async () => {
      await import('@/main/capture/screenshot');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlerCall = (mockIpcMainHandle.mock.calls as any[]).find(
        call => call[0] === 'screenshot:read-file'
      );
      const handler = handlerCall?.[1];

      const testBuffer = Buffer.from('test image data');
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(testBuffer);

      const result = await handler(null, '/path/to/image.png');

      expect(result).toBe(testBuffer.toString('base64'));
    });

    it('should throw error when file not found', async () => {
      await import('@/main/capture/screenshot');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlerCall = (mockIpcMainHandle.mock.calls as any[]).find(
        call => call[0] === 'screenshot:read-file'
      );
      const handler = handlerCall?.[1];

      mockExistsSync.mockReturnValue(false);

      await expect(handler(null, '/nonexistent/file.png')).rejects.toThrow(
        'File not found'
      );
    });
  });

  describe('IPC Handler: open-settings', () => {
    it('should open settings window', async () => {
      await import('@/main/capture/screenshot');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlerCall = (mockIpcMainOn.mock.calls as any[]).find(
        call => call[0] === 'open-settings'
      );
      const handler = handlerCall?.[1];

      handler({ sender: { id: 1 } }, 'general');

      expect(mockCreateOrShowSettingsWindow).toHaveBeenCalledWith('general');
    });

    it('should open settings window without tab', async () => {
      await import('@/main/capture/screenshot');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlerCall = (mockIpcMainOn.mock.calls as any[]).find(
        call => call[0] === 'open-settings'
      );
      const handler = handlerCall?.[1];

      handler({ sender: { id: 1 } });

      expect(mockCreateOrShowSettingsWindow).toHaveBeenCalledWith(undefined);
    });
  });

  describe('openScreenshotFromHistory', () => {
    it('should log error when file does not exist', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockExistsSync.mockReturnValue(false);

      const { openScreenshotFromHistory } =
        await import('@/main/capture/screenshot');

      const historyItem: HistoryItem = {
        id: 'test-id',
        timestamp: Date.now(),
        originalPath: '/nonexistent/path.png',
        type: 'screenshot',
        editorState: null,
      };

      openScreenshotFromHistory(historyItem);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Screenshot file not found:',
        '/nonexistent/path.png'
      );
      consoleSpy.mockRestore();
    });

    it('should open screenshot window when file exists', async () => {
      // Create a valid PNG buffer
      const pngHeader = Buffer.alloc(24);
      pngHeader.write('\x89PNG\r\n\x1a\n', 0);
      pngHeader.writeUInt32BE(400, 16); // width
      pngHeader.writeUInt32BE(300, 20); // height

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(pngHeader);
      mockNativeImageCreateFromPath.mockReturnValue({
        getSize: () => ({ width: 400, height: 300 }),
      });

      const { openScreenshotFromHistory } =
        await import('@/main/capture/screenshot');

      const editorState: EditorState = {
        annotations: [],
        wallpaper: createWallpaperSettings(),
      };

      const historyItem: HistoryItem = {
        id: 'test-id',
        timestamp: Date.now(),
        originalPath: '/test/path.png',
        type: 'screenshot',
        editorState,
      };

      openScreenshotFromHistory(historyItem);

      // Verify window was created
      expect(MockBrowserWindow.mock.calls.length).toBeGreaterThan(0);
    });

    it('should pass editor state to new window', async () => {
      // Create a valid PNG buffer
      const pngHeader = Buffer.alloc(24);
      pngHeader.write('\x89PNG\r\n\x1a\n', 0);
      pngHeader.writeUInt32BE(400, 16);
      pngHeader.writeUInt32BE(300, 20);

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(pngHeader);
      mockNativeImageCreateFromPath.mockReturnValue({
        getSize: () => ({ width: 400, height: 300 }),
      });

      const { openScreenshotFromHistory } =
        await import('@/main/capture/screenshot');

      const annotation: RectAnnotation = {
        id: 'ann-1',
        type: 'rectangle',
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        stroke: '#FF0000',
        strokeWidth: 2,
      };

      const editorState: EditorState = {
        annotations: [annotation],
        wallpaper: createWallpaperSettings({
          padding: 20,
          corners: 8,
          shadow: 10,
        }),
      };

      const historyItem: HistoryItem = {
        id: 'test-id',
        timestamp: Date.now(),
        originalPath: '/test/path.png',
        type: 'screenshot',
        editorState,
      };

      openScreenshotFromHistory(historyItem);

      // Verify window was created with proper configuration
      expect(MockBrowserWindow.mock.calls.length).toBeGreaterThan(0);
      const windowOptions = MockBrowserWindow.mock.calls[0][0] as {
        webPreferences?: { devTools?: boolean };
      };
      expect(windowOptions.webPreferences?.devTools).toBe(false);
    });
  });

  describe('CaptureMode type', () => {
    it('should accept valid capture modes', async () => {
      const { default: screenshot } = await import('@/main/capture/screenshot');

      await screenshot('screen');
      await screenshot('area');
      await screenshot('window');

      expect(mockExec).toHaveBeenCalledTimes(3);
    });
  });

  describe('Window size calculations', () => {
    it('should calculate window size respecting screen bounds', async () => {
      // Create a large image that would exceed screen bounds
      const pngHeader = Buffer.alloc(24);
      pngHeader.write('\x89PNG\r\n\x1a\n', 0);
      pngHeader.writeUInt32BE(8000, 16); // Very large width
      pngHeader.writeUInt32BE(6000, 20); // Very large height

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(pngHeader);
      mockNativeImageCreateFromPath.mockReturnValue({
        getSize: () => ({ width: 8000, height: 6000 }),
      });
      mockAddToHistory.mockResolvedValue({ id: 'test-id' });

      // Create a promise that resolves after exec callback completes
      let resolveExec: () => void;
      const execDone = new Promise<void>(resolve => {
        resolveExec = resolve;
      });

      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          // Use setTimeout to ensure proper async flow
          setTimeout(() => {
            if (callback) callback(null, '', '');
            resolveExec();
          }, 0);
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      screenshot('screen');

      // Wait for exec callback to complete
      await execDone;
      // Give async operations time to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Window should be created with constrained size
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls = MockBrowserWindow.mock.calls as any[];
      const windowConfig = calls[0]?.[0] as
        { width: number; height: number } | undefined;
      if (windowConfig) {
        expect(windowConfig.width).toBeLessThanOrEqual(1920 - 80); // screenWidth - padding*2
        expect(windowConfig.height).toBeLessThanOrEqual(1080 - 80);
      }
    });

    it('should enforce minimum window size', async () => {
      // Create a very small image
      const pngHeader = Buffer.alloc(24);
      pngHeader.write('\x89PNG\r\n\x1a\n', 0);
      pngHeader.writeUInt32BE(100, 16); // Small width (50 after scale factor)
      pngHeader.writeUInt32BE(100, 20); // Small height

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(pngHeader);
      mockNativeImageCreateFromPath.mockReturnValue({
        getSize: () => ({ width: 100, height: 100 }),
      });
      mockAddToHistory.mockResolvedValue({ id: 'test-id' });

      // Create a promise that resolves after exec callback completes
      let resolveExec: () => void;
      const execDone = new Promise<void>(resolve => {
        resolveExec = resolve;
      });

      mockExec.mockImplementation(
        (
          _cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          // Use setTimeout to ensure proper async flow
          setTimeout(() => {
            if (callback) callback(null, '', '');
            resolveExec();
          }, 0);
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      screenshot('screen');

      // Wait for exec callback to complete
      await execDone;
      // Give async operations time to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Window should respect minimum size
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls = MockBrowserWindow.mock.calls as any[];
      const windowConfig = calls[0]?.[0] as
        { minWidth: number; minHeight: number } | undefined;
      if (windowConfig) {
        expect(windowConfig.minWidth).toBe(950);
        expect(windowConfig.minHeight).toBe(650);
      }
    });
  });

  describe('Screenshot path generation', () => {
    it('should generate timestamp-based filename', async () => {
      mockExec.mockImplementation(
        (
          cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          // Verify the command contains a timestamp-formatted path
          expect(cmd).toMatch(
            /Screenshot \d{4}-\d{2}-\d{2} at \d{2}\.\d{2}\.\d{2}\.png/
          );
          if (callback) callback(null, '', '');
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockExec).toHaveBeenCalled();
    });

    it('should save to Capty folder in Pictures directory', async () => {
      mockExec.mockImplementation(
        (
          cmd: string,
          callback: (err: Error | null, stdout: string, stderr: string) => void
        ) => {
          expect(cmd).toMatch(/\/mock\/Pictures\/Capty\//);
          if (callback) callback(null, '', '');
        }
      );

      const { default: screenshot } = await import('@/main/capture/screenshot');
      await screenshot('screen');

      expect(mockExec).toHaveBeenCalled();
    });
  });
});
