import { describe, it, expect, vi, beforeEach } from 'vitest';

const browserWindows: MockBrowserWindow[] = [];
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockShowOpenDialog = vi.fn();
const mockNotificationShow = vi.fn();
const mockGetHistoryItemByPath = vi.fn();
const mockUpdateHistoryItemByPath = vi.fn();
const mockClipboardReadImage = vi.fn();
const mockOsTmpdir = vi.fn(() => '/tmp');

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
  };

  destroyedFlag = false;
  loadURL = vi.fn();
  loadFile = vi.fn();
  show = vi.fn();
  focus = vi.fn();
  close = vi.fn();
  setAlwaysOnTop = vi.fn();
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

class MockNotification {
  static isSupported = () => true;
  constructor(_args: unknown) {
    void _args;
  }
  show() {
    mockNotificationShow();
  }
}

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  app: { focus: vi.fn() },
  screen: {
    getPrimaryDisplay: () => ({
      scaleFactor: 2,
      workAreaSize: { width: 1920, height: 1080 },
    }),
  },
  dialog: { showOpenDialog: (...a: unknown[]) => mockShowOpenDialog(...a) },
  Notification: MockNotification,
  nativeImage: {
    createFromPath: () => ({ getSize: () => ({ width: 800, height: 600 }) }),
  },
  clipboard: {
    readImage: () => mockClipboardReadImage(),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
}));

vi.mock('os', () => ({
  default: { tmpdir: () => mockOsTmpdir() },
  tmpdir: () => mockOsTmpdir(),
}));

vi.mock('@/main/utils/env.ts', () => ({
  isDev: true,
  devServerUrl: 'http://localhost:5173',
}));

vi.mock('@/main/utils/dock', () => ({
  registerDockWindow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/main/history', () => ({
  getHistoryItemByPath: (...a: unknown[]) => mockGetHistoryItemByPath(...a),
  updateHistoryItemByPath: (...a: unknown[]) =>
    mockUpdateHistoryItemByPath(...a),
}));

describe('open-editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    browserWindows.splice(0);
    MockBrowserWindow.webContentsCounter = 0;
  });

  describe('getImageDimensions', () => {
    it('returns scaled dimensions', async () => {
      const { getImageDimensions } =
        await import('@/main/capture/screenshot/open-editor');
      const result = getImageDimensions('/p/img.png');
      expect(result).toEqual({ width: 400, height: 300 });
    });
  });

  describe('openScreenshotWindow', () => {
    it('opens a new window with given dimensions', async () => {
      const { openScreenshotWindow } =
        await import('@/main/capture/screenshot/open-editor');
      openScreenshotWindow({
        filePath: '/p/img.png',
        width: 800,
        height: 600,
      });
      expect(browserWindows.length).toBe(1);
    });

    it('tracks window data', async () => {
      const { openScreenshotWindow, getWindowData } =
        await import('@/main/capture/screenshot/open-editor');
      openScreenshotWindow({
        filePath: '/p/img.png',
        width: 800,
        height: 600,
      });
      const data = getWindowData(browserWindows[0].webContents.id);
      expect(data?.filePath).toBe('/p/img.png');
    });
  });

  describe('openScreenshotEditor', () => {
    it('does nothing when file is missing', async () => {
      mockExistsSync.mockReturnValue(false);
      const { openScreenshotEditor } =
        await import('@/main/capture/screenshot/open-editor');
      openScreenshotEditor('/missing.png');
      expect(browserWindows.length).toBe(0);
    });

    it('opens window when file exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const { openScreenshotEditor } =
        await import('@/main/capture/screenshot/open-editor');
      openScreenshotEditor('/p/img.png');
      expect(browserWindows.length).toBe(1);
    });
  });

  describe('openScreenshotEditorWithLayers', () => {
    it('skips when primary file missing', async () => {
      mockExistsSync.mockReturnValue(false);
      const { openScreenshotEditorWithLayers } =
        await import('@/main/capture/screenshot/open-editor');
      openScreenshotEditorWithLayers('/missing.png', [], 'bottom');
      expect(browserWindows.length).toBe(0);
    });

    it('opens window with extra layers when files exist', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('image-bytes'));
      const { openScreenshotEditorWithLayers } =
        await import('@/main/capture/screenshot/open-editor');
      openScreenshotEditorWithLayers('/p/img.png', ['/p/extra.png'], 'bottom');
      expect(browserWindows.length).toBe(1);
    });

    it('filters out missing extra image files', async () => {
      let call = 0;
      mockExistsSync.mockImplementation(() => {
        call++;
        return call <= 1;
      });
      const { openScreenshotEditorWithLayers } =
        await import('@/main/capture/screenshot/open-editor');
      openScreenshotEditorWithLayers(
        '/p/img.png',
        ['/p/missing.png'],
        'bottom'
      );
      expect(browserWindows.length).toBe(1);
    });
  });

  describe('openImageInEditor', () => {
    it('does nothing when cancelled', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: [],
      });
      const { openImageInEditor } =
        await import('@/main/capture/screenshot/open-editor');
      await openImageInEditor();
      expect(browserWindows.length).toBe(0);
    });

    it('opens editor on selection', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/p/img.png'],
      });
      mockExistsSync.mockReturnValue(true);
      const { openImageInEditor } =
        await import('@/main/capture/screenshot/open-editor');
      await openImageInEditor();
      expect(browserWindows.length).toBe(1);
    });
  });

  describe('openClipboardInEditor', () => {
    it('shows notification when clipboard empty', async () => {
      mockClipboardReadImage.mockReturnValue({
        isEmpty: () => true,
        toPNG: () => Buffer.from(''),
      });
      const { openClipboardInEditor } =
        await import('@/main/capture/screenshot/open-editor');
      openClipboardInEditor();
      expect(mockNotificationShow).toHaveBeenCalled();
      expect(browserWindows.length).toBe(0);
    });

    it('writes temp file and opens editor', async () => {
      mockClipboardReadImage.mockReturnValue({
        isEmpty: () => false,
        toPNG: () => Buffer.from('png-bytes'),
      });
      mockExistsSync.mockReturnValue(true);
      const { openClipboardInEditor } =
        await import('@/main/capture/screenshot/open-editor');
      openClipboardInEditor();
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(browserWindows.length).toBe(1);
    });
  });
});
