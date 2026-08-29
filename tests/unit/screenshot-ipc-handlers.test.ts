import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => unknown;
const ipcOn: Record<string, Handler> = {};
const ipcHandle: Record<string, Handler> = {};

const mockGetConfig = vi.fn(() => ({
  general: {
    showDeletionNotifications: true,
    playSoundOnScreenshot: true,
  },
  screenshot: { captureToClipboard: false, showPreview: false },
}));
const mockUpdateConfig = vi.fn();
const mockExistsSync = vi.fn(() => true);
const mockReadFileSync = vi.fn(() => Buffer.from('image'));
const mockWriteFileSync = vi.fn();
const mockCopyFileSync = vi.fn();
const mockStatSync = vi.fn(() => ({ isDirectory: () => true }));
const mockShowSaveDialog = vi.fn();
const mockShowMessageBox = vi.fn();
const mockGetWindowData = vi.fn();
const mockGetWindowFromWebContentsId = vi.fn();
const mockGetHistoryItemByPath = vi.fn();
const mockDeleteHistoryItem = vi.fn();
const mockUpdateHistoryItemByPath = vi.fn();
const mockOpenScreenshotFromHistory = vi.fn();
const mockCreateOrShowSettingsWindow = vi.fn();
const mockDaemonCall = vi.fn();
const mockNotificationShow = vi.fn();
const mockExec = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    on: (e: string, h: Handler) => {
      ipcOn[e] = h;
    },
    handle: (e: string, h: Handler) => {
      ipcHandle[e] = h;
    },
  },
  app: {
    isPackaged: false,
    getPath: (n: string) => (n === 'pictures' ? '/Pictures' : '/tmp'),
  },
  dialog: {
    showSaveDialog: (...a: unknown[]) => mockShowSaveDialog(...a),
    showMessageBox: (...a: unknown[]) => mockShowMessageBox(...a),
  },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  clipboard: { writeImage: vi.fn() },
  nativeImage: { createFromBuffer: vi.fn(() => ({})) },
  Notification: class {
    static isSupported = () => true;
    constructor(_a: unknown) {
      void _a;
    }
    show() {
      mockNotificationShow();
    }
  },
  screen: {
    getPrimaryDisplay: () => ({
      scaleFactor: 2,
      workAreaSize: { width: 1920, height: 1080 },
    }),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    copyFileSync: (...a: unknown[]) => mockCopyFileSync(...a),
    statSync: (...a: unknown[]) => mockStatSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  copyFileSync: (...a: unknown[]) => mockCopyFileSync(...a),
  statSync: (...a: unknown[]) => mockStatSync(...a),
}));

vi.mock('child_process', () => ({ exec: (...a: unknown[]) => mockExec(...a) }));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
  updateConfig: (...a: unknown[]) => mockUpdateConfig(...a),
  createOrShowSettingsWindow: (...a: unknown[]) =>
    mockCreateOrShowSettingsWindow(...a),
}));

vi.mock('@/main/daemon', () => ({
  daemon: { call: (...a: unknown[]) => mockDaemonCall(...a) },
}));

vi.mock('@/main/capture/desktop-icons', () => ({
  hideDesktopIcons: vi.fn(),
  showDesktopIcons: vi.fn(),
  isSupported: vi.fn(() => true),
  checkAccessibilityPermission: vi.fn(() => true),
}));

vi.mock('@/main/capture/freeze-screen', () => ({
  freezeScreen: vi.fn(),
  releaseScreen: vi.fn(),
  isSupported: vi.fn(() => true),
}));

vi.mock('@/main/history', () => ({
  addToHistory: vi.fn().mockResolvedValue({ id: 'h1' }),
  deleteHistoryItem: (...a: unknown[]) => mockDeleteHistoryItem(...a),
  getHistoryItemByPath: (...a: unknown[]) => mockGetHistoryItemByPath(...a),
  updateHistoryItemByPath: (...a: unknown[]) =>
    mockUpdateHistoryItemByPath(...a),
}));

vi.mock('@/main/capture/screenshot/open-editor.ts', () => ({
  getWindowData: (...a: unknown[]) => mockGetWindowData(...a),
  getWindowFromWebContentsId: (...a: unknown[]) =>
    mockGetWindowFromWebContentsId(...a),
  openScreenshotEditor: vi.fn(),
  openScreenshotWindow: vi.fn(),
  openImageInEditor: vi.fn(),
  openClipboardInEditor: vi.fn(),
  openScreenshotEditorWithLayers: vi.fn(),
  getImageDimensions: () => ({ width: 100, height: 100 }),
}));

vi.mock('@/main/capture/screenshot/utils.ts', () => ({
  generateScreenshotPath: () => '/p/Screenshot.png',
  generateScreenshotExportName: (ext = 'png') => `Screenshot.${ext}`,
}));

vi.mock('@/main/capture/screenshot/open-from-history.ts', () => ({
  openScreenshotFromHistory: (...a: unknown[]) =>
    mockOpenScreenshotFromHistory(...a),
}));

vi.mock('@/main/capture/capture-preview', () => ({
  showCapturePreview: vi.fn(),
}));

vi.mock('@/main/capture/screenshot/open-editor', () => ({
  openScreenshotEditor: vi.fn(),
  getWindowData: (...a: unknown[]) => mockGetWindowData(...a),
  getWindowFromWebContentsId: (...a: unknown[]) =>
    mockGetWindowFromWebContentsId(...a),
  openScreenshotWindow: vi.fn(),
  openImageInEditor: vi.fn(),
  openClipboardInEditor: vi.fn(),
  openScreenshotEditorWithLayers: vi.fn(),
  getImageDimensions: () => ({ width: 100, height: 100 }),
}));

vi.mock('@/main/capture/display-selector', () => ({
  selectDisplay: vi.fn().mockResolvedValue({ status: 'cancelled' }),
}));

describe('screenshot IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcOn).forEach(k => delete ipcOn[k]);
    Object.keys(ipcHandle).forEach(k => delete ipcHandle[k]);
  });

  async function registerHandlers(): Promise<void> {
    const m = await import('@/main/capture/screenshot/screenshot');
    m.registerIpcHandlers();
  }

  describe('screenshot:close-confirmed', () => {
    it('closes window when not destroyed', async () => {
      const close = vi.fn();
      mockGetWindowData.mockReturnValue({
        window: { isDestroyed: () => false, close },
        isClosingConfirmed: false,
      });
      await registerHandlers();
      ipcOn['screenshot:close-confirmed']({ sender: { id: 1 } });
      expect(close).toHaveBeenCalled();
    });

    it('is a no-op when window destroyed', async () => {
      const close = vi.fn();
      mockGetWindowData.mockReturnValue({
        window: { isDestroyed: () => true, close },
        isClosingConfirmed: false,
      });
      await registerHandlers();
      ipcOn['screenshot:close-confirmed']({ sender: { id: 1 } });
      expect(close).not.toHaveBeenCalled();
    });
  });

  describe('screenshot:copy-from-menu', () => {
    it('sends copy event to renderer', async () => {
      const send = vi.fn();
      mockGetWindowFromWebContentsId.mockReturnValue({
        isDestroyed: () => false,
        webContents: { send },
      });
      await registerHandlers();
      ipcOn['screenshot:copy-from-menu']({ sender: { id: 1 } });
      expect(send).toHaveBeenCalledWith('screenshot:copy');
    });
  });

  describe('save-screenshot', () => {
    it('does nothing when no window data', async () => {
      mockGetWindowData.mockReturnValue(undefined);
      await registerHandlers();
      await ipcOn['save-screenshot']({ sender: { id: 1 } });
      expect(mockShowSaveDialog).not.toHaveBeenCalled();
    });

    it('copies the file when user selects a path', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/screenshot.png' });
      mockShowSaveDialog.mockResolvedValue({ filePath: '/dest/x.png' });
      const send = vi.fn();
      await registerHandlers();
      await ipcOn['save-screenshot']({ sender: { id: 1, send } });
      expect(mockCopyFileSync).toHaveBeenCalledWith(
        '/p/screenshot.png',
        '/dest/x.png'
      );
      expect(send).toHaveBeenCalledWith('screenshot:saved');
    });

    it('does nothing when user cancels', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      mockShowSaveDialog.mockResolvedValue({ filePath: undefined });
      await registerHandlers();
      await ipcOn['save-screenshot']({ sender: { id: 1, send: vi.fn() } });
      expect(mockCopyFileSync).not.toHaveBeenCalled();
    });

    it('defaults to Pictures when no directory was remembered', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      mockShowSaveDialog.mockResolvedValue({ filePath: undefined });
      await registerHandlers();
      await ipcOn['save-screenshot']({ sender: { id: 1, send: vi.fn() } });
      const [opts] = mockShowSaveDialog.mock.calls[0];
      expect(opts.defaultPath).toBe('/Pictures/Screenshot.png');
    });

    it('defaults to the previously used directory', async () => {
      mockGetConfig.mockReturnValueOnce({
        saveLocations: { screenshot: '/Users/me/Desktop' },
      });
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      mockShowSaveDialog.mockResolvedValue({ filePath: undefined });
      await registerHandlers();
      await ipcOn['save-screenshot']({ sender: { id: 1, send: vi.fn() } });
      const [opts] = mockShowSaveDialog.mock.calls[0];
      expect(opts.defaultPath).toBe('/Users/me/Desktop/Screenshot.png');
    });

    it('persists the directory the user saved to', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/screenshot.png' });
      mockShowSaveDialog.mockResolvedValue({
        filePath: '/Users/me/Desktop/x.png',
      });
      await registerHandlers();
      await ipcOn['save-screenshot']({ sender: { id: 1, send: vi.fn() } });
      expect(mockUpdateConfig).toHaveBeenCalledWith({
        saveLocations: expect.objectContaining({
          screenshot: '/Users/me/Desktop',
        }),
      });
    });

    it('does not persist a directory when user cancels', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      mockShowSaveDialog.mockResolvedValue({ filePath: undefined });
      await registerHandlers();
      await ipcOn['save-screenshot']({ sender: { id: 1, send: vi.fn() } });
      expect(mockUpdateConfig).not.toHaveBeenCalled();
    });
  });

  describe('screenshot:save-edited', () => {
    it('writes buffer when user selects path', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      mockShowSaveDialog.mockResolvedValue({ filePath: '/dest/x.png' });
      const send = vi.fn();
      await registerHandlers();
      await ipcOn['screenshot:save-edited'](
        { sender: { id: 1, send } },
        'aGVsbG8=',
        'png'
      );
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith('screenshot:saved');
    });

    it('uses jpeg filter for jpeg format', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      mockShowSaveDialog.mockResolvedValue({ filePath: '/dest/x.jpg' });
      await registerHandlers();
      await ipcOn['screenshot:save-edited'](
        { sender: { id: 1, send: vi.fn() } },
        'aGVsbG8=',
        'jpeg'
      );
      const [opts] = mockShowSaveDialog.mock.calls[0];
      expect(opts.filters[0].extensions).toEqual(['jpg']);
    });

    it('is a no-op when no window data', async () => {
      mockGetWindowData.mockReturnValue(undefined);
      await registerHandlers();
      await ipcOn['screenshot:save-edited'](
        { sender: { id: 1, send: vi.fn() } },
        'aGVsbG8='
      );
      expect(mockShowSaveDialog).not.toHaveBeenCalled();
    });

    it('defaults to the previously used directory', async () => {
      mockGetConfig.mockReturnValueOnce({
        saveLocations: { screenshot: '/Users/me/Desktop' },
      });
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      mockShowSaveDialog.mockResolvedValue({ filePath: undefined });
      await registerHandlers();
      await ipcOn['screenshot:save-edited'](
        { sender: { id: 1, send: vi.fn() } },
        'aGVsbG8=',
        'jpeg'
      );
      const [opts] = mockShowSaveDialog.mock.calls[0];
      expect(opts.defaultPath).toBe('/Users/me/Desktop/Screenshot.jpg');
    });

    it('persists the directory the user saved to', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      mockShowSaveDialog.mockResolvedValue({
        filePath: '/Users/me/Documents/x.png',
      });
      await registerHandlers();
      await ipcOn['screenshot:save-edited'](
        { sender: { id: 1, send: vi.fn() } },
        'aGVsbG8=',
        'png'
      );
      expect(mockUpdateConfig).toHaveBeenCalledWith({
        saveLocations: expect.objectContaining({
          screenshot: '/Users/me/Documents',
        }),
      });
    });
  });

  describe('get-screenshot-path', () => {
    it('returns filePath via event.returnValue', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      await registerHandlers();
      const event = { sender: { id: 1 }, returnValue: null as string | null };
      ipcOn['get-screenshot-path'](event);
      expect(event.returnValue).toBe('/p/x.png');
    });

    it('returns null when no data', async () => {
      mockGetWindowData.mockReturnValue(undefined);
      await registerHandlers();
      const event = { sender: { id: 1 }, returnValue: null as string | null };
      ipcOn['get-screenshot-path'](event);
      expect(event.returnValue).toBeNull();
    });
  });

  describe('screenshot:read-file', () => {
    it('returns base64', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('img'));
      await registerHandlers();
      const result = await ipcHandle['screenshot:read-file']({}, '/p/x.png');
      expect(typeof result).toBe('string');
    });

    it('throws when file missing', async () => {
      mockExistsSync.mockReturnValue(false);
      await registerHandlers();
      await expect(
        ipcHandle['screenshot:read-file']({}, '/p/missing.png')
      ).rejects.toThrow('File not found');
    });
  });

  describe('history:save-editor-state', () => {
    it('updates history when window data has filePath', async () => {
      mockGetWindowData.mockReturnValue({ filePath: '/p/x.png' });
      await registerHandlers();
      await ipcOn['history:save-editor-state'](
        { sender: { id: 1 } },
        { layers: [] }
      );
      expect(mockUpdateHistoryItemByPath).toHaveBeenCalled();
    });

    it('skips when no filePath', async () => {
      mockGetWindowData.mockReturnValue({});
      await registerHandlers();
      await ipcOn['history:save-editor-state'](
        { sender: { id: 1 } },
        { layers: [] }
      );
      expect(mockUpdateHistoryItemByPath).not.toHaveBeenCalled();
    });
  });

  describe('screenshot:sync-state', () => {
    it('mutates window data editorState', async () => {
      const data: { editorState: unknown } = { editorState: null };
      mockGetWindowData.mockReturnValue(data);
      await registerHandlers();
      ipcOn['screenshot:sync-state'](
        { sender: { id: 1 } },
        { editorState: { foo: 1 } }
      );
      expect(data.editorState).toEqual({ foo: 1 });
    });
  });

  describe('history:openScreenshot', () => {
    it('forwards to openScreenshotFromHistory', async () => {
      await registerHandlers();
      const item = { id: 'h1', filePath: '/p/x.png' };
      ipcOn['history:openScreenshot']({}, item);
      expect(mockOpenScreenshotFromHistory).toHaveBeenCalledWith(item);
    });
  });

  describe('open-settings', () => {
    it('opens settings window with tab', async () => {
      await registerHandlers();
      ipcOn['open-settings']({}, 'general');
      expect(mockCreateOrShowSettingsWindow).toHaveBeenCalledWith('general');
    });
  });

  describe('screenshot:confirmDelete', () => {
    it('returns true when user clicks Delete', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 1 });
      await registerHandlers();
      const result = await ipcHandle['screenshot:confirmDelete']({
        sender: {},
      });
      expect(result).toBe(true);
    });

    it('returns false on Cancel', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      await registerHandlers();
      const result = await ipcHandle['screenshot:confirmDelete']({
        sender: {},
      });
      expect(result).toBe(false);
    });
  });

  describe('screenshot:delete', () => {
    it('closes window and deletes history', async () => {
      const close = vi.fn();
      mockGetWindowData.mockReturnValue({
        window: { isDestroyed: () => false, close },
        filePath: '/p/x.png',
        isClosingConfirmed: false,
      });
      mockGetHistoryItemByPath.mockReturnValue({ id: 'h1' });
      await registerHandlers();
      await ipcOn['screenshot:delete']({ sender: { id: 1 } });
      expect(close).toHaveBeenCalled();
      expect(mockDeleteHistoryItem).toHaveBeenCalledWith('h1');
      expect(mockNotificationShow).toHaveBeenCalled();
    });

    it('skips notification when disabled', async () => {
      mockGetConfig.mockReturnValue({
        general: {
          showDeletionNotifications: false,
          playSoundOnScreenshot: true,
        },
        screenshot: { captureToClipboard: false, showPreview: false },
      });
      mockGetWindowData.mockReturnValue({
        window: { isDestroyed: () => false, close: vi.fn() },
        filePath: '/p/x.png',
        isClosingConfirmed: false,
      });
      mockGetHistoryItemByPath.mockReturnValue({ id: 'h1' });
      await registerHandlers();
      await ipcOn['screenshot:delete']({ sender: { id: 1 } });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });

    it('skips when no window data', async () => {
      mockGetWindowData.mockReturnValue(undefined);
      await registerHandlers();
      await ipcOn['screenshot:delete']({ sender: { id: 1 } });
      expect(mockDeleteHistoryItem).not.toHaveBeenCalled();
    });

    it('skips delete when no history item', async () => {
      mockGetWindowData.mockReturnValue({
        window: { isDestroyed: () => false, close: vi.fn() },
        filePath: '/p/x.png',
        isClosingConfirmed: false,
      });
      mockGetHistoryItemByPath.mockReturnValue(null);
      await registerHandlers();
      await ipcOn['screenshot:delete']({ sender: { id: 1 } });
      expect(mockDeleteHistoryItem).not.toHaveBeenCalled();
    });
  });

  describe('screenshot:print', () => {
    it('calls daemon print module', async () => {
      mockDaemonCall.mockResolvedValue({});
      await registerHandlers();
      await ipcHandle['screenshot:print']({}, 'aGVsbG8=');
      expect(mockDaemonCall).toHaveBeenCalledWith('print', 'image', {
        imageBase64: 'aGVsbG8=',
      });
    });
  });

  describe('screenshot:capture-for-editor', () => {
    it('returns null when no window found', async () => {
      const { BrowserWindow } = await import('electron');
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null);
      await registerHandlers();
      const result = await ipcHandle['screenshot:capture-for-editor']({
        sender: {},
      });
      expect(result).toBeNull();
    });

    it('returns base64 when capture succeeds', async () => {
      const { BrowserWindow } = await import('electron');
      const win = {
        isDestroyed: () => false,
        hide: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      };
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(win as never);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('img'));
      mockExec.mockImplementation(
        (_cmd: string, cb: (err: Error | null) => void) => cb(null)
      );
      await registerHandlers();
      const result = await ipcHandle['screenshot:capture-for-editor']({
        sender: {},
      });
      expect(typeof result).toBe('string');
    });

    it('returns null when capture file missing', async () => {
      const { BrowserWindow } = await import('electron');
      const win = {
        isDestroyed: () => false,
        hide: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      };
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(win as never);
      mockExistsSync.mockReturnValue(false);
      mockExec.mockImplementation(
        (_cmd: string, cb: (err: Error | null) => void) => cb(null)
      );
      await registerHandlers();
      const result = await ipcHandle['screenshot:capture-for-editor']({
        sender: {},
      });
      expect(result).toBeNull();
    });

    it('returns null on capture error', async () => {
      const { BrowserWindow } = await import('electron');
      const win = {
        isDestroyed: () => false,
        hide: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
      };
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(win as never);
      mockExec.mockImplementation(
        (_cmd: string, cb: (err: Error | null) => void) => cb(new Error('boom'))
      );
      await registerHandlers();
      const result = await ipcHandle['screenshot:capture-for-editor']({
        sender: {},
      });
      expect(result).toBeNull();
    });
  });
});
