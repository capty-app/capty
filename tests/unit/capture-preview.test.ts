import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockDisplay {
  id: number;
  workArea: { x: number; y: number; width: number; height: number };
}

const DISPLAY_ONE: MockDisplay = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

const DISPLAY_TWO: MockDisplay = {
  id: 2,
  workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
};

const CURSOR_ON_ONE = { x: 10, y: 10 };
const CURSOR_ON_TWO = { x: 2500, y: 10 };

let cursorPoint = { ...CURSOR_ON_ONE };

const browserWindows: MockBrowserWindow[] = [];
const ipcOn: Record<string, (...a: unknown[]) => unknown> = {};
const ipcHandle: Record<string, (...a: unknown[]) => unknown> = {};

function displayNearestPoint(point: { x: number; y: number }): MockDisplay {
  return (
    [DISPLAY_ONE, DISPLAY_TWO].find(
      display =>
        point.x >= display.workArea.x &&
        point.x < display.workArea.x + display.workArea.width
    ) ?? DISPLAY_ONE
  );
}

const mockGetConfig = vi.fn();
const mockUpdateConfig = vi.fn();
const mockGetThumbnail = vi.fn();
const mockDeleteHistoryItem = vi.fn();
const mockGetHistoryItemByPath = vi.fn();
const mockOpenScreenshotEditor = vi.fn();
const mockCreateVideoEditorWindow = vi.fn();
const mockDeleteVideo = vi.fn();
const mockClipboardWriteImage = vi.fn();
const mockReadFileSync = vi.fn(() => Buffer.from('image'));
const mockNativeImageCreateFromBuffer = vi.fn(() => ({ image: true }));
const mockNativeImageCreateFromPath = vi.fn(() => ({
  resize: () => ({ image: true }),
}));
const mockIsWindowAnimating = vi.fn(() => false);
const mockAnimateWindowMove = vi.fn();
const mockAnimateWindowIn = vi.fn();
const mockMoveWindowInstantly = vi.fn(
  (window: MockBrowserWindow, position: { x: number; y: number }) => {
    window.setPosition(position.x, position.y);
  }
);
const mockGetDisplayMatching = vi.fn((bounds: { x: number; y: number }) =>
  displayNearestPoint(bounds)
);
const mockDaemonCall = vi.fn(() => Promise.resolve(undefined));
const mockDaemonOnEvent = vi.fn();
const mockDaemonOffEvent = vi.fn();

class MockBrowserWindow {
  static webContentsCounter = 0;

  windowHandlers: Record<string, ((...a: unknown[]) => unknown)[]> = {};
  webContents = {
    id: ++MockBrowserWindow.webContentsCounter,
    on: vi.fn((event: string, cb: (...a: unknown[]) => unknown) => {
      this.windowHandlers[`wc:${event}`] ??= [];
      this.windowHandlers[`wc:${event}`].push(cb);
    }),
    send: vi.fn(),
    startDrag: vi.fn(),
  };

  destroyedFlag = false;
  bounds = { x: 0, y: 0, width: 200, height: 140 };
  loadURL = vi.fn();
  loadFile = vi.fn();
  show = vi.fn();
  showInactive = vi.fn();
  focus = vi.fn();
  close = vi.fn(() => {
    this.destroyedFlag = true;
    (this.windowHandlers['closed'] || []).forEach(cb => cb());
  });
  setVisibleOnAllWorkspaces = vi.fn();
  setAlwaysOnTop = vi.fn();
  setBounds = vi.fn(
    (bounds: { x: number; y: number; width: number; height: number }) => {
      this.bounds = { ...bounds };
    }
  );
  setPosition = vi.fn((x: number, y: number) => {
    this.bounds = { ...this.bounds, x, y };
  });
  getPosition = vi.fn(() => [this.bounds.x, this.bounds.y]);
  getBounds = vi.fn(() => ({ ...this.bounds }));
  isDestroyed = vi.fn(() => this.destroyedFlag);
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
  }
}

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  ipcMain: {
    on: (e: string, h: (...a: unknown[]) => unknown) => {
      ipcOn[e] = h;
    },
    handle: (e: string, h: (...a: unknown[]) => unknown) => {
      ipcHandle[e] = h;
    },
  },
  app: {
    whenReady: () => Promise.resolve(),
    getPath: () => '/tmp',
  },
  screen: {
    getPrimaryDisplay: () => DISPLAY_ONE,
    getAllDisplays: () => [DISPLAY_ONE, DISPLAY_TWO],
    getDisplayMatching: (bounds: { x: number; y: number }) =>
      mockGetDisplayMatching(bounds),
    getCursorScreenPoint: () => cursorPoint,
    getDisplayNearestPoint: (point: { x: number; y: number }) =>
      displayNearestPoint(point),
    on: vi.fn(),
  },
  clipboard: {
    writeImage: (...a: unknown[]) => mockClipboardWriteImage(...a),
  },
  nativeImage: {
    createFromBuffer: (...a: unknown[]) =>
      mockNativeImageCreateFromBuffer(...a),
    createFromPath: (...a: unknown[]) => mockNativeImageCreateFromPath(...a),
  },
}));

vi.mock('fs', () => ({
  default: { readFileSync: (...a: unknown[]) => mockReadFileSync(...a) },
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}));

vi.mock('@/main/utils/env', () => ({
  isDev: true,
  devServerUrl: 'http://localhost:5173',
}));

vi.mock('@/main/utils/thumbnails', () => ({
  getThumbnail: (...a: unknown[]) => mockGetThumbnail(...a),
}));

vi.mock('@/main/history', () => ({
  deleteHistoryItem: (...a: unknown[]) => mockDeleteHistoryItem(...a),
  getHistoryItemByPath: (...a: unknown[]) => mockGetHistoryItemByPath(...a),
}));

vi.mock('@/main/capture/screenshot/open-editor', () => ({
  openScreenshotEditor: (...a: unknown[]) => mockOpenScreenshotEditor(...a),
}));

vi.mock('@/main/capture/video/video-editor', () => ({
  createVideoEditorWindow: (...a: unknown[]) =>
    mockCreateVideoEditorWindow(...a),
}));

vi.mock('@/main/capture/video/delete-video', () => ({
  deleteVideo: (...a: unknown[]) => mockDeleteVideo(...a),
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
  updateConfig: (...a: unknown[]) => mockUpdateConfig(...a),
  setPreviewConfigListener: vi.fn(),
}));

vi.mock('@/main/daemon', () => ({
  daemon: {
    call: (...a: unknown[]) => mockDaemonCall(...a),
    onEvent: (...a: unknown[]) => mockDaemonOnEvent(...a),
    offEvent: (...a: unknown[]) => mockDaemonOffEvent(...a),
  },
}));

vi.mock('@/main/capture/capture-preview/video-export', () => ({
  registerPreviewExportIpc: vi.fn(),
}));

vi.mock('@/main/utils/window-animation', () => ({
  animateWindowIn: (...a: unknown[]) => mockAnimateWindowIn(...a),
  animateWindowMove: (...a: unknown[]) => mockAnimateWindowMove(...a),
  getInitialBounds: () => ({ x: 0, y: 0, width: 200, height: 140 }),
  isWindowAnimating: () => mockIsWindowAnimating(),
  moveWindowInstantly: (
    window: MockBrowserWindow,
    position: { x: number; y: number }
  ) => mockMoveWindowInstantly(window, position),
}));

function fireMoved(window: MockBrowserWindow): void {
  (window.windowHandlers['moved'] || []).forEach(cb => cb());
}

function fireReadyToShow(window: MockBrowserWindow): void {
  (window.windowHandlers['ready-to-show'] || []).forEach(cb => cb());
}

function setPreviewConfig(
  followActiveDisplay: boolean,
  displayId = DISPLAY_TWO.id
): void {
  mockGetConfig.mockReturnValue({
    preview: { displayId, followActiveDisplay },
  });
}

async function showPreviews(count: number): Promise<void> {
  const { showCapturePreview } = await import('@/main/capture/capture-preview');

  for (let index = 0; index < count; index++) {
    await showCapturePreview(`/p/img${index}.png`, 'screenshot');
  }
}

describe('capture-preview index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    browserWindows.splice(0);
    MockBrowserWindow.webContentsCounter = 0;
    Object.keys(ipcOn).forEach(k => delete ipcOn[k]);
    Object.keys(ipcHandle).forEach(k => delete ipcHandle[k]);
    mockIsWindowAnimating.mockReturnValue(false);
    cursorPoint = { ...CURSOR_ON_ONE };
    mockGetConfig.mockReturnValue({
      preview: { displayId: DISPLAY_ONE.id, followActiveDisplay: false },
    });
    mockGetThumbnail.mockResolvedValue({ base64: 'abc', cached: false });
  });

  it('showCapturePreview creates a preview window', async () => {
    const { showCapturePreview } =
      await import('@/main/capture/capture-preview');
    await showCapturePreview('/p/img.png', 'screenshot');
    expect(browserWindows.length).toBe(1);
  });

  it('closeAllPreviewWindows closes all windows', async () => {
    const m = await import('@/main/capture/capture-preview');
    await m.showCapturePreview('/p/img.png', 'screenshot');
    await m.showCapturePreview('/p/img2.png', 'video');
    m.closeAllPreviewWindows();
    expect(browserWindows[0].close).toHaveBeenCalled();
  });

  describe('IPC handlers', () => {
    beforeEach(async () => {
      const { registerCapturePreviewIpc } =
        await import('@/main/capture/capture-preview');
      registerCapturePreviewIpc();
    });

    it('close closes the matching preview window', async () => {
      const { showCapturePreview } =
        await import('@/main/capture/capture-preview');
      await showCapturePreview('/p/img.png', 'screenshot');
      const id = browserWindows[0].webContents.id;
      ipcOn['capture-preview:close']({ sender: { id } });
      expect(browserWindows[0].close).toHaveBeenCalled();
    });

    it('copy writes image to clipboard for screenshots', async () => {
      const { showCapturePreview } =
        await import('@/main/capture/capture-preview');
      await showCapturePreview('/p/img.png', 'screenshot');
      const id = browserWindows[0].webContents.id;
      ipcOn['capture-preview:copy']({ sender: { id } });
      expect(mockClipboardWriteImage).toHaveBeenCalled();
    });

    it('copy ignores video content type', async () => {
      const { showCapturePreview } =
        await import('@/main/capture/capture-preview');
      await showCapturePreview('/p/v.mov', 'video');
      const id = browserWindows[0].webContents.id;
      ipcOn['capture-preview:copy']({ sender: { id } });
      expect(mockClipboardWriteImage).not.toHaveBeenCalled();
    });

    it('open-editor opens screenshot editor for screenshots', async () => {
      const { showCapturePreview } =
        await import('@/main/capture/capture-preview');
      await showCapturePreview('/p/img.png', 'screenshot', 'h1');
      const id = browserWindows[0].webContents.id;
      ipcOn['capture-preview:open-editor']({ sender: { id } });
      expect(mockOpenScreenshotEditor).toHaveBeenCalledWith('/p/img.png', 'h1');
    });

    it('open-editor opens video editor for videos', async () => {
      const { showCapturePreview } =
        await import('@/main/capture/capture-preview');
      await showCapturePreview('/p/v.mov', 'video');
      const id = browserWindows[0].webContents.id;
      ipcOn['capture-preview:open-editor']({ sender: { id } });
      expect(mockCreateVideoEditorWindow).toHaveBeenCalledWith('/p/v.mov');
    });

    it('delete deletes video without notification', async () => {
      const { showCapturePreview } =
        await import('@/main/capture/capture-preview');
      await showCapturePreview('/p/v.mov', 'video');
      const id = browserWindows[0].webContents.id;
      await ipcOn['capture-preview:delete']({ sender: { id } });
      expect(mockDeleteVideo).toHaveBeenCalledWith('/p/v.mov', {
        showNotification: false,
      });
    });

    it('delete deletes screenshot history item', async () => {
      mockGetHistoryItemByPath.mockReturnValue({ id: 'h1' });
      const { showCapturePreview } =
        await import('@/main/capture/capture-preview');
      await showCapturePreview('/p/img.png', 'screenshot');
      const id = browserWindows[0].webContents.id;
      await ipcOn['capture-preview:delete']({ sender: { id } });
      expect(mockDeleteHistoryItem).toHaveBeenCalledWith('h1');
    });

    it('start-drag invokes startDrag on web contents', async () => {
      const { showCapturePreview } =
        await import('@/main/capture/capture-preview');
      await showCapturePreview('/p/img.png', 'screenshot');
      const sender = browserWindows[0].webContents;
      ipcOn['capture-preview:start-drag'](
        { sender: { ...sender, id: sender.id } },
        '/p/img.png'
      );
    });

    it('get-displays returns display info', async () => {
      const result = await ipcHandle['capture-preview:get-displays']();
      expect(result).toBeInstanceOf(Array);
    });

    it('move-to-display updates config and reposition', async () => {
      const result = await ipcHandle['capture-preview:move-to-display']({}, 1);
      expect(mockUpdateConfig).toHaveBeenCalledWith({
        preview: { displayId: 1, followActiveDisplay: false },
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('places previews on the active display instead of the persisted one', async () => {
      setPreviewConfig(true, DISPLAY_ONE.id);
      cursorPoint = { ...CURSOR_ON_TWO };
      await showPreviews(1);

      fireReadyToShow(browserWindows[0]);

      expect(mockAnimateWindowIn).toHaveBeenCalledWith(browserWindows[0], {
        x: 1944,
        y: 916,
        width: 200,
        height: 140,
      });
    });

    it('starts the active display monitor when the first preview opens', async () => {
      setPreviewConfig(true);
      await showPreviews(1);

      expect(mockDaemonCall).toHaveBeenCalledWith('active-display', 'start');
    });

    it('stops the active display monitor when the last preview closes', async () => {
      setPreviewConfig(true);
      await showPreviews(1);
      mockDaemonCall.mockClear();

      browserWindows[0].close();

      expect(mockDaemonCall).toHaveBeenCalledWith('active-display', 'stop');
    });

    it('stops the active display monitor when the only preview is detached', async () => {
      setPreviewConfig(true);
      await showPreviews(1);
      mockDaemonCall.mockClear();

      browserWindows[0].setPosition(500, 500);
      fireMoved(browserWindows[0]);

      expect(mockDaemonCall).toHaveBeenCalledWith('active-display', 'stop');
    });

    it('drag detaches the window and persists nothing while following', async () => {
      setPreviewConfig(true);
      await showPreviews(2);

      browserWindows[1].setPosition(500, 500);
      fireMoved(browserWindows[1]);
      mockAnimateWindowMove.mockClear();

      browserWindows[0].close();

      expect(
        mockAnimateWindowMove.mock.calls.some(
          call => call[0] === browserWindows[1]
        )
      ).toBe(false);
      expect(mockUpdateConfig).not.toHaveBeenCalled();
    });

    it('detaching the middle preview re-stacks the rest contiguously', async () => {
      setPreviewConfig(true);
      await showPreviews(3);

      browserWindows[1].setPosition(500, 500);
      mockAnimateWindowMove.mockClear();
      fireMoved(browserWindows[1]);

      expect(mockAnimateWindowMove).toHaveBeenCalledWith(browserWindows[0], {
        x: 24,
        y: 916,
      });
      expect(mockAnimateWindowMove).toHaveBeenCalledWith(browserWindows[2], {
        x: 24,
        y: 764,
      });
      expect(
        mockAnimateWindowMove.mock.calls.some(
          call => call[0] === browserWindows[1]
        )
      ).toBe(false);
    });

    it('ignores a moved event fired while the window is animating', async () => {
      setPreviewConfig(true);
      await showPreviews(2);

      mockIsWindowAnimating.mockReturnValue(true);
      browserWindows[1].setPosition(500, 500);
      fireMoved(browserWindows[1]);
      mockIsWindowAnimating.mockReturnValue(false);
      mockAnimateWindowMove.mockClear();

      browserWindows[0].close();

      expect(mockAnimateWindowMove).toHaveBeenCalledWith(browserWindows[1], {
        x: 24,
        y: 916,
      });
    });

    it('ignores a moved event landing exactly on the stack slot', async () => {
      setPreviewConfig(true);
      await showPreviews(2);

      browserWindows[1].setPosition(24, 764);
      fireMoved(browserWindows[1]);
      mockAnimateWindowMove.mockClear();

      browserWindows[0].close();

      expect(mockAnimateWindowMove).toHaveBeenCalledWith(browserWindows[1], {
        x: 24,
        y: 916,
      });
    });

    it('drag detaches the window and persists the display while not following', async () => {
      setPreviewConfig(false, DISPLAY_ONE.id);
      await showPreviews(2);

      browserWindows[1].setPosition(2500, 500);
      fireMoved(browserWindows[1]);

      expect(mockGetDisplayMatching).toHaveBeenCalledWith({
        x: 2500,
        y: 500,
        width: 200,
        height: 140,
      });
      expect(mockUpdateConfig).toHaveBeenCalledWith({
        preview: { displayId: DISPLAY_TWO.id, followActiveDisplay: false },
      });
      expect(mockUpdateConfig.mock.invocationCallOrder[0]).toBeLessThan(
        mockAnimateWindowMove.mock.invocationCallOrder[0]
      );

      mockAnimateWindowMove.mockClear();
      browserWindows[0].close();

      expect(
        mockAnimateWindowMove.mock.calls.some(
          call => call[0] === browserWindows[1]
        )
      ).toBe(false);
    });

    it('ignores further moved events once the window is detached', async () => {
      setPreviewConfig(false);
      await showPreviews(2);

      browserWindows[1].setPosition(500, 500);
      fireMoved(browserWindows[1]);

      mockAnimateWindowMove.mockClear();
      mockUpdateConfig.mockClear();
      mockGetDisplayMatching.mockClear();

      browserWindows[1].setPosition(600, 600);
      fireMoved(browserWindows[1]);

      expect(mockAnimateWindowMove).not.toHaveBeenCalled();
      expect(mockGetDisplayMatching).not.toHaveBeenCalled();
      expect(mockUpdateConfig).not.toHaveBeenCalled();
    });

    it('animates in to the current slot when the stack changed before ready-to-show', async () => {
      setPreviewConfig(false, DISPLAY_ONE.id);
      await showPreviews(2);

      browserWindows[0].close();
      mockAnimateWindowMove.mockClear();
      fireReadyToShow(browserWindows[1]);

      const target = mockAnimateWindowIn.mock.calls[0][1] as {
        x: number;
        y: number;
      };
      expect(target).toEqual({ x: 24, y: 916, width: 200, height: 140 });

      browserWindows[1].setPosition(target.x, target.y);
      fireMoved(browserWindows[1]);

      await ipcHandle['capture-preview:move-to-display']({}, 1);

      expect(mockAnimateWindowMove).toHaveBeenCalledWith(browserWindows[1], {
        x: 24,
        y: 916,
      });
    });

    it('skips the entry animation when the preview left the stack before ready-to-show', async () => {
      setPreviewConfig(false);
      await showPreviews(1);

      browserWindows[0].close();
      fireReadyToShow(browserWindows[0]);

      expect(browserWindows[0].showInactive).not.toHaveBeenCalled();
      expect(mockAnimateWindowIn).not.toHaveBeenCalled();
    });

    it('positions previews instantly when the reposition crosses displays', async () => {
      setPreviewConfig(false, DISPLAY_ONE.id);
      await showPreviews(1);
      browserWindows[0].setPosition(24, 916);

      setPreviewConfig(false, DISPLAY_TWO.id);
      mockAnimateWindowMove.mockClear();
      mockMoveWindowInstantly.mockClear();

      await ipcHandle['capture-preview:move-to-display']({}, DISPLAY_TWO.id);

      expect(mockMoveWindowInstantly).toHaveBeenCalledWith(browserWindows[0], {
        x: 1944,
        y: 916,
      });
      expect(mockAnimateWindowMove).not.toHaveBeenCalled();
    });

    it('animates the re-stack while previews stay on the same display', async () => {
      setPreviewConfig(false, DISPLAY_ONE.id);
      await showPreviews(2);
      browserWindows[0].setPosition(24, 916);
      browserWindows[1].setPosition(24, 764);
      mockAnimateWindowMove.mockClear();
      mockMoveWindowInstantly.mockClear();

      browserWindows[0].close();

      expect(mockAnimateWindowMove).toHaveBeenCalledWith(browserWindows[1], {
        x: 24,
        y: 916,
      });
      expect(mockMoveWindowInstantly).not.toHaveBeenCalled();
    });

    it('keeps a preview stacked after an instant cross-display move', async () => {
      setPreviewConfig(false, DISPLAY_ONE.id);
      await showPreviews(1);
      browserWindows[0].setPosition(24, 916);

      setPreviewConfig(false, DISPLAY_TWO.id);
      await ipcHandle['capture-preview:move-to-display']({}, DISPLAY_TWO.id);

      mockAnimateWindowMove.mockClear();
      mockMoveWindowInstantly.mockClear();
      fireMoved(browserWindows[0]);

      expect(mockAnimateWindowMove).not.toHaveBeenCalled();
      expect(mockMoveWindowInstantly).not.toHaveBeenCalled();

      setPreviewConfig(false, DISPLAY_ONE.id);
      await ipcHandle['capture-preview:move-to-display']({}, DISPLAY_ONE.id);

      expect(mockMoveWindowInstantly).toHaveBeenCalledWith(browserWindows[0], {
        x: 24,
        y: 916,
      });
    });
  });
});
