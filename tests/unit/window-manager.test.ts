import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';

const mockExistsSync = vi.fn();
const mockRealpathSync = vi.fn((filePath: string) => filePath);
const mockReadFileSync = vi.fn();
const mockShowOpenDialog = vi.fn();
const mockGetPrimaryDisplay = vi.fn(() => ({
  workAreaSize: { width: 1920, height: 1080 },
}));
const mockRegisterDockWindow = vi.fn().mockResolvedValue(undefined);
const mockAppFocus = vi.fn();
const mockProjectOpen = vi.fn();
const mockProjectRelease = vi.fn();

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
  options: Record<string, unknown>;
  loadURL = vi.fn();
  loadFile = vi.fn();
  show = vi.fn();
  focus = vi.fn();
  close = vi.fn();
  destroy = vi.fn(() => {
    this.destroyed = true;
  });
  maximize = vi.fn();
  getBounds = vi.fn(() => ({ x: 10, y: 20, width: 1300, height: 850 }));
  getNormalBounds = vi.fn(() => ({ x: 40, y: 50, width: 1200, height: 780 }));
  isMaximized = vi.fn(() => false);
  isDestroyed = vi.fn(() => this.destroyed);
  on = vi.fn((event: string, cb: (...a: unknown[]) => unknown) => {
    this.windowHandlers[event] ??= [];
    this.windowHandlers[event].push(cb);
  });
  once = vi.fn((event: string, cb: (...a: unknown[]) => unknown) => {
    this.windowHandlers[event] ??= [];
    this.windowHandlers[event].push(cb);
  });

  constructor(opts: Record<string, unknown>) {
    this.options = opts;
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
    realpathSync: (filePath: string) => mockRealpathSync(filePath),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  realpathSync: (filePath: string) => mockRealpathSync(filePath),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}));

vi.mock('@/main/utils/env', () => ({
  isDev: true,
  devServerUrl: 'http://localhost:5173',
}));

vi.mock('@/main/utils/dock', () => ({
  registerDockWindow: (...a: unknown[]) => mockRegisterDockWindow(...a),
}));

vi.mock('@/main/editor-v2/project/project-service', () => ({
  EditorProjectService: class {
    open = mockProjectOpen;
    release = mockProjectRelease;
  },
}));

vi.mock('@/main/editor-v2/project/legacy-media-probe', () => ({
  LegacyFfmpegProbeService: class {},
}));

describe('window-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    browserWindows.splice(0);
    MockBrowserWindow.instances.splice(0);
    MockBrowserWindow.webContentsCounter = 0;
    mockRealpathSync.mockImplementation(filePath => filePath);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('missing');
    });
    mockProjectOpen.mockResolvedValue({
      session: { ownerId: 'token' },
      project: { id: 'project' },
      workspace: { revision: 0 },
    });
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
      expect(win).toBeDefined();
      expect(browserWindows.length).toBe(1);
      expect(m.getVideoEditorWindowsCount()).toBe(1);
    });

    it('uses project recording path when path is a project folder', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      const win = m.createVideoEditorWindow('/path/Rec.capty');
      expect(win).toBeDefined();
      const data = m.getWindowData(browserWindows[0].webContents.id);
      expect(data?.filePath).toBe('/path/Rec.capty/recording.mov');
    });

    it('routes a V2-only package without recording.mov to V2 in development', async () => {
      mockExistsSync.mockImplementation(filePath =>
        String(filePath).endsWith('recording.mov') ? false : true
      );
      mockReadFileSync.mockReturnValue(
        JSON.stringify(
          createEmptyEditorProject({
            id: 'project',
            name: 'Project',
            createdAt: '2026-08-30T00:00:00.000Z',
            sequenceId: 'sequence',
            videoTrackId: 'video-track',
            audioTrackId: 'audio-track',
          })
        )
      );
      const m = await import('@/main/capture/video/window-manager');
      const win = m.createVideoEditorWindow('/path/V2.capty');

      expect(win).toBeDefined();
      expect(m.getWindowData(browserWindows[0].webContents.id)).toMatchObject({
        editorVersion: 'v2',
        filePath: '/path/V2.capty',
      });
      expect(browserWindows[0].loadURL).toHaveBeenCalledWith(
        expect.stringContaining('editor=v2')
      );
    });

    it('keeps hybrid packages on V1 by default in development', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify(
          createEmptyEditorProject({
            id: 'project',
            name: 'Project',
            createdAt: '2026-08-30T00:00:00.000Z',
            sequenceId: 'sequence',
            videoTrackId: 'video-track',
            audioTrackId: 'audio-track',
          })
        )
      );
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/path/Hybrid.capty');

      expect(m.getWindowData(browserWindows[0].webContents.id)).toMatchObject({
        editorVersion: 'v1',
        filePath: '/path/Hybrid.capty/recording.mov',
      });
      expect(browserWindows[0].loadURL).toHaveBeenCalledWith(
        'http://localhost:5173/'
      );
    });

    it('selects the dedicated preload and route for Editor V2', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/path/Rec.capty', { editorVersion: 'v2' });
      const win = browserWindows[0];
      const webPreferences = win.options.webPreferences as {
        preload: string;
        webSecurity: boolean;
      };
      expect(webPreferences.preload).toMatch(/editor-v2-preload\.js$/);
      expect(webPreferences.webSecurity).toBe(true);
      expect(win.loadURL).toHaveBeenCalledWith(
        expect.stringContaining('editor=v2')
      );
    });

    it('focuses an existing canonical project instead of opening twice', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      const first = m.createVideoEditorWindow('/path/Rec.capty');
      const second = m.createVideoEditorWindow('/path/Rec.capty');
      expect(second).toBe(first);
      expect(browserWindows).toHaveLength(1);
      expect(browserWindows[0].focus).toHaveBeenCalled();
    });

    it('focuses the direct project when opened again through a symlink', async () => {
      mockExistsSync.mockReturnValue(true);
      mockRealpathSync.mockImplementation(filePath =>
        filePath === '/alias/project-link' ? '/path/Rec.capty' : filePath
      );
      const m = await import('@/main/capture/video/window-manager');
      const direct = m.createVideoEditorWindow('/path/Rec.capty');
      const linked = m.createVideoEditorWindow('/alias/project-link');

      expect(linked).toBe(direct);
      expect(browserWindows).toHaveLength(1);
      expect(browserWindows[0].focus).toHaveBeenCalled();
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

  describe('version handoff', () => {
    it('keeps the old window when the target cannot be recreated', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/Project.capty');
      const oldWindow = browserWindows[0];
      mockExistsSync.mockReturnValue(false);

      const recreated = await m.recreateVideoEditorWindow(
        oldWindow.webContents.id,
        'v2'
      );

      expect(recreated).toBeUndefined();
      expect(oldWindow.destroy).not.toHaveBeenCalled();
      expect(m.getWindowData(oldWindow.webContents.id)?.window).toBe(oldWindow);
    });

    it('preserves normal bounds and maximized state across recreation', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/Project.capty');
      const oldWindow = browserWindows[0];
      oldWindow.isMaximized.mockReturnValue(true);

      await m.recreateVideoEditorWindow(oldWindow.webContents.id, 'v2');

      expect(oldWindow.getNormalBounds).toHaveBeenCalled();
      expect(browserWindows[1].options).toMatchObject({
        x: 40,
        y: 50,
        width: 1200,
        height: 780,
      });
      expect(browserWindows[1].maximize).toHaveBeenCalled();
    });

    it('preserves bounds and destroys the old window after recreation', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/Project.capty');
      const oldWindow = browserWindows[0];

      const recreated = await m.recreateVideoEditorWindow(
        oldWindow.webContents.id,
        'v2'
      );

      expect(recreated).toBe(browserWindows[1]);
      expect(oldWindow.destroy).toHaveBeenCalled();
      expect(browserWindows[1].options).toMatchObject({
        x: 10,
        y: 20,
        width: 1300,
        height: 850,
      });
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

    it('did-finish-load reports a V2 project open failure', async () => {
      mockExistsSync.mockReturnValue(true);
      mockProjectOpen.mockRejectedValue(new Error('project is corrupt'));
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/Project.capty', { editorVersion: 'v2' });
      const win = browserWindows[0];
      const handlers = win.windowHandlers['wc:did-finish-load'] || [];
      await handlers[0]();

      expect(win.webContents.send).toHaveBeenCalledWith(
        'editor-v2:project:load-error',
        { error: 'project is corrupt' }
      );
    });

    it('did-finish-load sends the opaque V2 project payload', async () => {
      mockExistsSync.mockReturnValue(true);
      const m = await import('@/main/capture/video/window-manager');
      m.createVideoEditorWindow('/p/Project.capty', { editorVersion: 'v2' });
      const win = browserWindows[0];
      const handlers = win.windowHandlers['wc:did-finish-load'] || [];
      await handlers[0]();
      expect(win.webContents.send).toHaveBeenCalledWith(
        'editor-v2:project:load',
        expect.objectContaining({
          projectToken: expect.any(String),
          displayPath: '/p/Project.capty',
          project: { id: 'project' },
          workspace: { revision: 0 },
        })
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
      (win.windowHandlers['closed'] || []).forEach(cb => cb());
      expect(m.getWindowData(id)).toBeUndefined();
    });
  });
});
