import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDaemonCall = vi.fn();
const mockGetConfig = vi.fn();
const mockShowNotification = vi.fn();
const mockUpdateConfig = vi.fn();
const mockHideDesktopIcons = vi.fn();
const mockShowDesktopIcons = vi.fn();
const mockIsSupported = vi.fn();
const mockCheckAccessibility = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockClipboardWriteImage = vi.fn();
const mockShowCapturePreview = vi.fn();
const mockOpenScreenshotEditor = vi.fn();
const mockAddToHistory = vi.fn();

vi.mock('electron', () => ({
  clipboard: { writeImage: (...a: unknown[]) => mockClipboardWriteImage(...a) },
  nativeImage: { createFromBuffer: vi.fn() },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}));

vi.mock('@/main/daemon', () => ({
  daemon: {
    call: (...a: unknown[]) => mockDaemonCall(...a),
    onEvent: vi.fn(),
    offEvent: vi.fn(),
  },
}));

vi.mock('@/main/utils/notifications', () => ({
  showNotification: (...a: unknown[]) => mockShowNotification(...a),
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
  updateConfig: (...a: unknown[]) => mockUpdateConfig(...a),
}));

vi.mock('@/main/capture/desktop-icons', () => ({
  hideDesktopIcons: (...a: unknown[]) => mockHideDesktopIcons(...a),
  showDesktopIcons: (...a: unknown[]) => mockShowDesktopIcons(...a),
  isSupported: () => mockIsSupported(),
  checkAccessibilityPermission: (...a: unknown[]) =>
    mockCheckAccessibility(...a),
}));

vi.mock('@/main/history', () => ({
  addToHistory: (...a: unknown[]) => mockAddToHistory(...a),
}));

vi.mock('@/main/capture/screenshot/utils', () => ({
  generateScreenshotPath: vi.fn(() => '/p/out.png'),
}));

vi.mock('@/main/capture/capture-preview', () => ({
  showCapturePreview: (...a: unknown[]) => mockShowCapturePreview(...a),
}));

vi.mock('@/main/capture/screenshot/open-editor', () => ({
  openScreenshotEditor: (...a: unknown[]) => mockOpenScreenshotEditor(...a),
}));

vi.mock('@/main/capture/area-selector', () => ({
  startAreaSelection: vi.fn(),
  cancelAreaSelection: vi.fn(),
}));

describe('scroll-capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetConfig.mockReturnValue({
      screenshot: { hideDesktopIcons: false },
      scrollCapture: { autoScrollSpeed: 'medium', maxHeight: 20000 },
    });
    mockIsSupported.mockReturnValue(true);
    mockCheckAccessibility.mockReturnValue(true);
    mockAddToHistory.mockResolvedValue({ id: 'h1' });
  });

  describe('cancelScrollCapture', () => {
    it('calls daemon cancel', async () => {
      mockDaemonCall.mockResolvedValue({});
      const { cancelScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await cancelScrollCapture();
      expect(mockDaemonCall).toHaveBeenCalledWith('scroll-capture', 'cancel');
    });

    it('swallows daemon errors', async () => {
      mockDaemonCall.mockRejectedValue(new Error('boom'));
      const { cancelScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await expect(cancelScrollCapture()).resolves.toBeUndefined();
    });
  });

  describe('getScrollCaptureStatus', () => {
    it('returns daemon status', async () => {
      mockDaemonCall.mockResolvedValue({
        isCapturing: true,
        frameCount: 5,
        estimatedHeight: 1000,
      });
      const { getScrollCaptureStatus } =
        await import('@/main/capture/scroll-capture');
      const status = await getScrollCaptureStatus();
      expect(status).toEqual({
        isCapturing: true,
        frameCount: 5,
        estimatedHeight: 1000,
      });
    });

    it('returns default status on daemon error', async () => {
      mockDaemonCall.mockRejectedValue(new Error('boom'));
      const { getScrollCaptureStatus } =
        await import('@/main/capture/scroll-capture');
      const status = await getScrollCaptureStatus();
      expect(status).toEqual({
        isCapturing: false,
        frameCount: 0,
        estimatedHeight: 0,
      });
    });
  });

  describe('startScrollCapture', () => {
    it('hides desktop icons when configured', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { hideDesktopIcons: true },
      });
      const areaSelector = await import('@/main/capture/area-selector');
      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onCancelled?: () => Promise<void>;
      }) => {
        setImmediate(() => opts.onCancelled?.());
        return undefined;
      }) as never);
      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await startScrollCapture();
      expect(mockHideDesktopIcons).toHaveBeenCalledWith('capture');
      expect(mockShowDesktopIcons).toHaveBeenCalledWith('capture');
    });

    it('disables hide-icons when accessibility permission is missing', async () => {
      mockGetConfig.mockReturnValue({
        screenshot: { hideDesktopIcons: true },
      });
      mockCheckAccessibility.mockReturnValue(false);
      const areaSelector = await import('@/main/capture/area-selector');
      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onCancelled?: () => Promise<void>;
      }) => {
        setImmediate(() => opts.onCancelled?.());
        return undefined;
      }) as never);
      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await startScrollCapture();
      expect(mockUpdateConfig).toHaveBeenCalled();
      expect(mockHideDesktopIcons).not.toHaveBeenCalled();
    });

    it('completes when area selection is cancelled', async () => {
      const areaSelector = await import('@/main/capture/area-selector');
      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onCancelled?: () => Promise<void>;
      }) => {
        setImmediate(() => opts.onCancelled?.());
        return undefined;
      }) as never);
      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await expect(startScrollCapture()).resolves.toBeUndefined();
    });

    it('processes area selection then triggers daemon scroll-capture start', async () => {
      const daemonModule = await import('@/main/daemon');
      const areaSelector = await import('@/main/capture/area-selector');
      let daemonHandler: ((e: string, d?: unknown) => void) | null = null;
      vi.mocked(daemonModule.daemon.onEvent).mockImplementation(((
        cb: (e: string, d?: unknown) => void
      ) => {
        daemonHandler = cb;
      }) as never);
      mockDaemonCall.mockResolvedValue({});

      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onSelected?: (s: unknown) => Promise<void>;
      }) => {
        setImmediate(async () => {
          await opts.onSelected?.({
            status: 'selected',
            x: 10,
            y: 20,
            width: 200,
            height: 100,
          });
          // Fire scroll-capture:done event after async setup
          await new Promise(res => setImmediate(res));
          mockDaemonCall.mockResolvedValueOnce({
            success: true,
            outputPath: '/p/out.png',
            width: 200,
            height: 1000,
          });
          daemonHandler?.('scroll-capture:done');
        });
        return undefined;
      }) as never);

      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await startScrollCapture();
      expect(mockDaemonCall).toHaveBeenCalledWith(
        'scroll-capture',
        'start',
        expect.objectContaining({ x: 10, y: 20, width: 200, height: 100 })
      );
    });

    it('handles scroll-capture:cancelled event', async () => {
      const daemonModule = await import('@/main/daemon');
      const areaSelector = await import('@/main/capture/area-selector');
      let daemonHandler: ((e: string, d?: unknown) => void) | null = null;
      vi.mocked(daemonModule.daemon.onEvent).mockImplementation(((
        cb: (e: string, d?: unknown) => void
      ) => {
        daemonHandler = cb;
      }) as never);
      mockDaemonCall.mockResolvedValue({});

      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onSelected?: (s: unknown) => Promise<void>;
      }) => {
        setImmediate(async () => {
          await opts.onSelected?.({
            status: 'selected',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          });
          await new Promise(res => setImmediate(res));
          daemonHandler?.('scroll-capture:cancelled');
        });
        return undefined;
      }) as never);

      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await expect(startScrollCapture()).resolves.toBeUndefined();
    });

    it('handles daemon start failure gracefully', async () => {
      const areaSelector = await import('@/main/capture/area-selector');
      mockDaemonCall.mockRejectedValue(new Error('daemon dead'));

      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onSelected?: (s: unknown) => Promise<void>;
      }) => {
        setImmediate(() =>
          opts.onSelected?.({
            status: 'selected',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          })
        );
        return undefined;
      }) as never);

      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await expect(startScrollCapture()).resolves.toBeUndefined();
    });

    it('ignores area selection without complete bounds', async () => {
      const areaSelector = await import('@/main/capture/area-selector');
      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onSelected?: (s: unknown) => Promise<void>;
        onCancelled?: () => Promise<void>;
      }) => {
        setImmediate(async () => {
          await opts.onSelected?.({ status: 'selected' });
          await opts.onCancelled?.();
        });
        return undefined;
      }) as never);

      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await startScrollCapture();
      expect(mockDaemonCall).not.toHaveBeenCalledWith(
        'scroll-capture',
        'start',
        expect.anything()
      );
    });

    it('opens screenshot editor after successful capture (default flow)', async () => {
      const daemonModule = await import('@/main/daemon');
      const areaSelector = await import('@/main/capture/area-selector');
      let daemonHandler: ((e: string, d?: unknown) => void) | null = null;
      vi.mocked(daemonModule.daemon.onEvent).mockImplementation(((
        cb: (e: string, d?: unknown) => void
      ) => {
        daemonHandler = cb;
      }) as never);
      mockGetConfig.mockReturnValue({
        screenshot: {
          hideDesktopIcons: false,
          captureToClipboard: false,
          showPreview: false,
        },
        scrollCapture: { autoScrollSpeed: 'medium', maxHeight: 20000 },
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('image'));
      let finishCount = 0;
      mockDaemonCall.mockImplementation(async (_module, method) => {
        if (method === 'finish') {
          finishCount++;
          return {
            success: true,
            outputPath: '/p/out.png',
            width: 200,
            height: 1000,
          };
        }
        return {};
      });

      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onSelected?: (s: unknown) => Promise<void>;
      }) => {
        setImmediate(async () => {
          await opts.onSelected?.({
            status: 'selected',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          });
          await new Promise(res => setImmediate(res));
          daemonHandler?.('scroll-capture:done');
        });
        return undefined;
      }) as never);

      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await startScrollCapture();
      expect(finishCount).toBeGreaterThan(0);
      expect(mockOpenScreenshotEditor).toHaveBeenCalled();
    });

    it('writes to clipboard when captureToClipboard enabled', async () => {
      const daemonModule = await import('@/main/daemon');
      const areaSelector = await import('@/main/capture/area-selector');
      let daemonHandler: ((e: string, d?: unknown) => void) | null = null;
      vi.mocked(daemonModule.daemon.onEvent).mockImplementation(((
        cb: (e: string, d?: unknown) => void
      ) => {
        daemonHandler = cb;
      }) as never);
      mockGetConfig.mockReturnValue({
        general: { showCaptureNotifications: true },
        screenshot: {
          hideDesktopIcons: false,
          captureToClipboard: true,
          showPreview: false,
        },
        scrollCapture: { autoScrollSpeed: 'medium', maxHeight: 20000 },
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('image'));
      mockDaemonCall.mockImplementation(async (_module, method) => {
        if (method === 'finish') {
          return {
            success: true,
            outputPath: '/p/out.png',
            width: 200,
            height: 1000,
          };
        }
        return {};
      });

      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onSelected?: (s: unknown) => Promise<void>;
      }) => {
        setImmediate(async () => {
          await opts.onSelected?.({
            status: 'selected',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          });
          await new Promise(res => setImmediate(res));
          daemonHandler?.('scroll-capture:done');
        });
        return undefined;
      }) as never);

      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await startScrollCapture();
      expect(mockClipboardWriteImage).toHaveBeenCalled();
    });

    it('shows capture preview when configured', async () => {
      const daemonModule = await import('@/main/daemon');
      const areaSelector = await import('@/main/capture/area-selector');
      let daemonHandler: ((e: string, d?: unknown) => void) | null = null;
      vi.mocked(daemonModule.daemon.onEvent).mockImplementation(((
        cb: (e: string, d?: unknown) => void
      ) => {
        daemonHandler = cb;
      }) as never);
      mockGetConfig.mockReturnValue({
        screenshot: {
          hideDesktopIcons: false,
          captureToClipboard: false,
          showPreview: true,
        },
        scrollCapture: { autoScrollSpeed: 'medium', maxHeight: 20000 },
      });
      mockExistsSync.mockReturnValue(true);
      mockDaemonCall.mockImplementation(async (_module, method) => {
        if (method === 'finish') {
          return {
            success: true,
            outputPath: '/p/out.png',
            width: 200,
            height: 1000,
          };
        }
        return {};
      });

      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onSelected?: (s: unknown) => Promise<void>;
      }) => {
        setImmediate(async () => {
          await opts.onSelected?.({
            status: 'selected',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          });
          await new Promise(res => setImmediate(res));
          daemonHandler?.('scroll-capture:done');
        });
        return undefined;
      }) as never);

      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await startScrollCapture();
      expect(mockShowCapturePreview).toHaveBeenCalled();
    });

    it('handles failed daemon.finish response', async () => {
      const daemonModule = await import('@/main/daemon');
      const areaSelector = await import('@/main/capture/area-selector');
      let daemonHandler: ((e: string, d?: unknown) => void) | null = null;
      vi.mocked(daemonModule.daemon.onEvent).mockImplementation(((
        cb: (e: string, d?: unknown) => void
      ) => {
        daemonHandler = cb;
      }) as never);
      mockDaemonCall.mockImplementation(async (_module, method) => {
        if (method === 'finish') {
          return { success: false };
        }
        return {};
      });

      vi.mocked(areaSelector.startAreaSelection).mockImplementation(((opts: {
        onSelected?: (s: unknown) => Promise<void>;
      }) => {
        setImmediate(async () => {
          await opts.onSelected?.({
            status: 'selected',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          });
          await new Promise(res => setImmediate(res));
          daemonHandler?.('scroll-capture:done');
        });
        return undefined;
      }) as never);

      const { startScrollCapture } =
        await import('@/main/capture/scroll-capture');
      await expect(startScrollCapture()).resolves.toBeUndefined();
    });
  });
});
