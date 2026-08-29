import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.fn();
const mockRealpathSync = vi.fn((filePath: string) => filePath);
const mockShowOpenDialog = vi.fn();
const mockGetPrimaryDisplay = vi.fn(() => ({
  workAreaSize: { width: 1920, height: 1080 },
}));
const mockRegisterDockWindow = vi.fn().mockResolvedValue(undefined);
const mockAppFocus = vi.fn();

const browserWindows: MockBrowserWindow[] = [];

class MockBrowserWindow {
  static webContentsCounter = 0;
  static instances: MockBrowserWindow[] = [];

  windowHandlers: Record<string, ((...a: unknown[]) => unknown)[]> = {};
  webContents = {
    id: ++MockBrowserWindow.webContentsCounter,
    on: vi.fn((event: string, cb: (...a: unknown[]) => unknown) => {
      this.windowHandlers[`wc:${event}`] ??= [];
      this.windowHandlers[`wc:${event}`].push(cb);
    }),
    send: vi.fn(),
  };

  destroyed = false;
  loadURL = vi.fn();
  loadFile = vi.fn();
  show = vi.fn();
  focus = vi.fn();
  close = vi.fn();
  isDestroyed = vi.fn(() => this.destroyed);
  on = vi.fn((event: string, cb: (...a: unknown[]) => unknown) => {
    this.windowHandlers[event] ??= [];
    this.windowHandlers[event].push(cb);
  });
  once = vi.fn((event: string, cb: (...a: unknown[]) => unknown) => {
    this.windowHandlers[event] ??= [];
    this.windowHandlers[event].push(cb);
  });

  constructor(_opts: unknown) {
    void _opts;
    browserWindows.push(this);
    MockBrowserWindow.instances.push(this);
  }
}

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  app: { focus: mockAppFocus },
  screen: {
    getPrimaryDisplay: () => mockGetPrimaryDisplay(),
  },
  dialog: {
    showOpenDialog: (...a: unknown[]) => mockShowOpenDialog(...a),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    realpathSync: (...a: unknown[]) => mockRealpathSync(...(a as [string])),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  realpathSync: (...a: unknown[]) => mockRealpathSync(...(a as [string])),
}));

vi.mock('@/main/utils/env', () => ({
  isDev: true,
  devServerUrl: 'http://localhost:5173',
}));

vi.mock('@/main/utils/dock', () => ({
  registerDockWindow: (...a: unknown[]) => mockRegisterDockWindow(...a),
}));

describe('window-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRealpathSync.mockImplementation((filePath: string) => filePath);
    browserWindows.splice(0);
    MockBrowserWindow.instances.splice(0);
    MockBrowserWindow.webContentsCounter = 0;
  });

  describe('createVideoEditorWindow', () => {
    it('returns undefined when video file missing', async () => {
      mockExistsSync.mockReturnValue(false);
      const { createVideoEditorWindow } =
        await import('@/main/capture/video/window-manager');
      expect(createVideoEditorWindow('/missing/video.mov')).toBeUndefined();
      expect(browserWindows.length).toBe(0);
    });

    it('creates a new BrowserWindow and tracks it', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      const win = m.createVideoEditorWindow('/path/video.mov');
      const { getMediaPathForSender } =
        await import('@/main/capture/video/media-sources');
      expect(win).toBeDefined();
      expect(browserWindows.length).toBe(1);
      expect(m.getVideoEditorWindowsCount()).toBe(1);
      expect(
        getMediaPathForSender(browserWindows[0].webContents.id, 'video')
      ).toBe('/path/video.mov');
    });

    it('uses project recording path when path is a project folder', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      const win = m.createVideoEditorWindow('/path/Rec.capty');
      expect(win).toBeDefined();
      const data = m.getWindowData(browserWindows[0].webContents.id);
      expect(data?.filePath).toBe('/path/Rec.capty/recording.mov');
    });

    it('rejects project recording symlinks outside the project folder', async () => {
      mockExistsSync.mockReturnValue(true);
      mockRealpathSync.mockImplementation((filePath: string) => {
        if (filePath.endsWith('/recording.mov')) return '/private/video.mov';
        return filePath;
      });
      const m = await import('@/main/capture/video/window-manager');

      expect(m.createVideoEditorWindow('/path/Rec.capty')).toBeUndefined();
      expect(browserWindows).toHaveLength(0);
    });

    it('pins canonical video paths and rejects camera symlink escapes', async () => {
      mockExistsSync.mockReturnValue(true);
      mockRealpathSync.mockImplementation((filePath: string) => {
        if (filePath === '/path/video.mov') return '/media/video.mov';
        if (filePath === '/path/video.camera.mov') {
          return '/private/camera.mov';
        }
        return filePath;
      });
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/path/video.mov');
      const data = m.getWindowData(browserWindows[0].webContents.id);

      expect(data?.mediaPaths).toEqual({
        video: '/media/video.mov',
        camera: null,
      });
    });
  });

  describe('lookups', () => {
    it('getWindowData / getWindowFromWebContentsId / getVideoEditorWindow', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/path/video.mov');
      const id = browserWindows[0].webContents.id;
      expect(m.getWindowData(id)?.filePath).toBe('/path/video.mov');
      expect(m.getWindowFromWebContentsId(id)).toBe(browserWindows[0]);
      expect(m.getVideoEditorWindow(id)).toBe(browserWindows[0]);
    });

    it('returns null for unknown ids', async () => {
      const m = await import('@/main/capture/video/window-manager');
      expect(m.getWindowData(999)).toBeUndefined();
      expect(m.getWindowFromWebContentsId(999)).toBeNull();
    });
  });

  describe('updateWindowFilePath', () => {
    it('updates the file path of the tracked window', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/old/video.mov');
      const id = browserWindows[0].webContents.id;
      m.updateWindowFilePath(id, '/new/video.mov');
      expect(m.getWindowData(id)?.filePath).toBe('/new/video.mov');
    });

    it('is a no-op for unknown ids', async () => {
      const m = await import('@/main/capture/video/window-manager');
      expect(() => m.updateWindowFilePath(999, '/x')).not.toThrow();
    });
  });

  describe('setWindowData / deleteWindowData', () => {
    it('round-trips data', async () => {
      const m = await import('@/main/capture/video/window-manager');
      const fake = {
        window: {} as never,
        filePath: '/a.mov',
        mediaPaths: { video: '/a.mov', camera: null },
        isClosingConfirmed: false,
        isExporting: false,
      };
      m.setWindowData(42, fake);
      expect(m.getWindowData(42)).toBe(fake);
      m.deleteWindowData(42);
      expect(m.getWindowData(42)).toBeUndefined();
    });
  });

  describe('openVideoInEditor', () => {
    it('does nothing when dialog cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: [],
      });
      const m = await import('@/main/capture/video/window-manager');
      await m.openVideoInEditor();
      expect(browserWindows.length).toBe(0);
    });

    it('opens editor when file selected and exists', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/video.mov'],
      });
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      await m.openVideoInEditor();
      expect(browserWindows.length).toBe(1);
    });
  });

  describe('window event handlers', () => {
    it('did-finish-load sends load event', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/video.mov');
      const win = browserWindows[0];
      (win.windowHandlers['wc:did-finish-load'] || []).forEach(cb => cb());
      expect(win.webContents.send).toHaveBeenCalledWith(
        'load',
        expect.objectContaining({ type: 'video-editor' })
      );
    });

    it('did-finish-load is no-op when window data deleted', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/video.mov');
      const win = browserWindows[0];
      m.deleteWindowData(win.webContents.id);
      win.webContents.send.mockClear();
      (win.windowHandlers['wc:did-finish-load'] || []).forEach(cb => cb());
      expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it('ready-to-show registers dock + shows window', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/video.mov');
      const win = browserWindows[0];
      const handlers = win.windowHandlers['ready-to-show'] || [];
      await handlers[0]();
      expect(mockRegisterDockWindow).toHaveBeenCalled();
      expect(win.show).toHaveBeenCalled();
    });

    it('close handler marks closing confirmed', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/video.mov');
      const win = browserWindows[0];
      const data = m.getWindowData(win.webContents.id);
      (win.windowHandlers['close'] || []).forEach(cb => cb());
      expect(data?.isClosingConfirmed).toBe(true);
    });

    it('closed handler removes from registry', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/video.mov');
      const win = browserWindows[0];
      const id = win.webContents.id;
      const { getMediaPathForSender } =
        await import('@/main/capture/video/media-sources');
      (win.windowHandlers['closed'] || []).forEach(cb => cb());
      expect(m.getWindowData(id)).toBeUndefined();
      expect(getMediaPathForSender(id, 'video')).toBeNull();
    });
  });
});
