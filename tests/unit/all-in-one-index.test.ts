import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStartAreaSelection = vi.fn();
const mockCancelAreaSelection = vi.fn();
const mockUpdateAreaSelection = vi.fn();
const mockUpdateAreaSelectionCallbacks = vi.fn();
const mockShowAllInOneControl = vi.fn();
const mockUpdateAllInOnePosition = vi.fn();
const mockHideAllInOneControl = vi.fn();
const mockGetCurrentAreaSelection = vi.fn();
const mockSetAllInOneCallbacks = vi.fn();
const mockCaptureArea = vi.fn();
const mockShowPreRecordingControl = vi.fn();
const mockUpdateRecordingControlPosition = vi.fn();
const mockHidePreRecordingControl = vi.fn();
const mockPrewarmRecordingControl = vi.fn();
const mockPrewarmRecorder = vi.fn();
const mockPrewarmOverlay = vi.fn();
const mockGlobalShortcutRegister = vi.fn();
const mockGlobalShortcutUnregister = vi.fn();
const mockGetConfig = vi.fn();
const mockUpdateConfig = vi.fn();
const mockGetAllDisplays = vi.fn();

vi.mock('electron', () => ({
  globalShortcut: {
    register: (key: string, cb: () => void) =>
      mockGlobalShortcutRegister(key, cb),
    unregister: (key: string) => mockGlobalShortcutUnregister(key),
  },
  screen: {
    getAllDisplays: () => mockGetAllDisplays(),
  },
}));

vi.mock('@/main/capture/area-selector', () => ({
  startAreaSelection: (...a: unknown[]) => mockStartAreaSelection(...a),
  cancelAreaSelection: (...a: unknown[]) => mockCancelAreaSelection(...a),
  updateAreaSelection: (...a: unknown[]) => mockUpdateAreaSelection(...a),
  updateAreaSelectionCallbacks: (...a: unknown[]) =>
    mockUpdateAreaSelectionCallbacks(...a),
}));

vi.mock('@/main/capture/all-in-one/open-all-in-one.ts', () => ({
  showAllInOneControl: (...a: unknown[]) => mockShowAllInOneControl(...a),
  updateAllInOnePosition: (...a: unknown[]) => mockUpdateAllInOnePosition(...a),
  hideAllInOneControl: (...a: unknown[]) => mockHideAllInOneControl(...a),
  getCurrentAreaSelection: () => mockGetCurrentAreaSelection(),
  setAllInOneCallbacks: (...a: unknown[]) => mockSetAllInOneCallbacks(...a),
}));

vi.mock('@/main/capture/screenshot/capture-area.ts', () => ({
  captureArea: (...a: unknown[]) => mockCaptureArea(...a),
}));

vi.mock('@/main/capture/video/recording-control.ts', () => ({
  showPreRecordingControl: (...a: unknown[]) =>
    mockShowPreRecordingControl(...a),
  updateRecordingControlPosition: (...a: unknown[]) =>
    mockUpdateRecordingControlPosition(...a),
  hidePreRecordingControl: () => mockHidePreRecordingControl(),
  prewarmRecordingControlWindow: () => mockPrewarmRecordingControl(),
}));

vi.mock('@/main/capture/video/recorder.ts', () => ({
  prewarmRecorder: () => mockPrewarmRecorder(),
}));

vi.mock('@/main/capture/video/overlay.ts', () => ({
  prewarmOverlay: () => mockPrewarmOverlay(),
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
  updateConfig: (...a: unknown[]) => mockUpdateConfig(...a),
}));

describe('all-in-one orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetConfig.mockReturnValue({ allInOne: {} });
    mockUpdateAreaSelection.mockResolvedValue(true);
    mockGetAllDisplays.mockReturnValue([
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    ]);
  });

  it('init registers all-in-one callbacks', async () => {
    const { init } = await import('@/main/capture/all-in-one');
    init();
    expect(mockSetAllInOneCallbacks).toHaveBeenCalled();
  });

  it('startAllInOne calls startAreaSelection', async () => {
    mockStartAreaSelection.mockResolvedValue({ status: 'confirmed' });
    const startAllInOne = (await import('@/main/capture/all-in-one')).default;
    await startAllInOne();
    expect(mockStartAreaSelection).toHaveBeenCalled();
  });

  it('uses persisted area as preset when on display', async () => {
    mockGetConfig.mockReturnValue({
      allInOne: { lastArea: { x: 100, y: 100, width: 200, height: 200 } },
    });
    mockStartAreaSelection.mockResolvedValue({ status: 'confirmed' });
    const startAllInOne = (await import('@/main/capture/all-in-one')).default;
    await startAllInOne();
    const [opts] = mockStartAreaSelection.mock.calls[0];
    expect(opts.preset).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 200,
    });
  });

  it('skips persisted area when off all displays', async () => {
    mockGetConfig.mockReturnValue({
      allInOne: { lastArea: { x: 99999, y: 99999, width: 100, height: 100 } },
    });
    mockStartAreaSelection.mockResolvedValue({ status: 'confirmed' });
    const startAllInOne = (await import('@/main/capture/all-in-one')).default;
    await startAllInOne();
    const [opts] = mockStartAreaSelection.mock.calls[0];
    expect(opts.preset).toBeUndefined();
  });

  it('cleans up when area selection returns null', async () => {
    mockStartAreaSelection.mockResolvedValue(null);
    const startAllInOne = (await import('@/main/capture/all-in-one')).default;
    await startAllInOne();
    expect(mockHideAllInOneControl).toHaveBeenCalled();
  });

  it('onSelected persists area and shows control', async () => {
    mockStartAreaSelection.mockImplementation(
      async ({ onSelected }: { onSelected: (s: unknown) => void }) => {
        onSelected({
          status: 'selected',
          x: 10,
          y: 20,
          width: 100,
          height: 100,
        });
        return { status: 'selected' };
      }
    );
    const startAllInOne = (await import('@/main/capture/all-in-one')).default;
    await startAllInOne();
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      allInOne: { lastArea: { x: 10, y: 20, width: 100, height: 100 } },
    });
    expect(mockShowAllInOneControl).toHaveBeenCalled();
    expect(mockGlobalShortcutRegister).toHaveBeenCalledTimes(3);
  });

  it('onUpdate forwards bounds to update', async () => {
    mockStartAreaSelection.mockImplementation(
      async ({ onUpdate }: { onUpdate: (s: unknown) => void }) => {
        onUpdate({
          status: 'updated',
          x: 50,
          y: 60,
          width: 200,
          height: 100,
        });
        return { status: 'selected' };
      }
    );
    const startAllInOne = (await import('@/main/capture/all-in-one')).default;
    await startAllInOne();
    expect(mockUpdateAllInOnePosition).toHaveBeenCalledWith({
      x: 50,
      y: 60,
      width: 200,
      height: 100,
    });
  });

  it('onCancelled unregisters shortcuts and hides the control', async () => {
    mockStartAreaSelection.mockImplementation(
      async ({ onCancelled }: { onCancelled: () => void }) => {
        onCancelled();
        return null;
      }
    );
    const startAllInOne = (await import('@/main/capture/all-in-one')).default;
    await startAllInOne();
    expect(mockGlobalShortcutUnregister).toHaveBeenCalled();
    expect(mockHideAllInOneControl).toHaveBeenCalled();
  });

  describe('callbacks installed', () => {
    it('init installs handleScreenshotAction that captures', async () => {
      mockGetCurrentAreaSelection.mockReturnValue({
        x: 10,
        y: 20,
        width: 100,
        height: 100,
      });
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onScreenshot: () => Promise<void>;
      };
      await cbs.onScreenshot();
      expect(mockCaptureArea).toHaveBeenCalled();
    });

    it('handleScreenshotAction no-op when no area', async () => {
      mockGetCurrentAreaSelection.mockReturnValue(null);
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onScreenshot: () => Promise<void>;
      };
      await cbs.onScreenshot();
      expect(mockCaptureArea).not.toHaveBeenCalled();
    });

    it('handleScreenshotAction swallows captureArea errors', async () => {
      mockGetCurrentAreaSelection.mockReturnValue({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      mockCaptureArea.mockRejectedValue(new Error('boom'));
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onScreenshot: () => Promise<void>;
      };
      await expect(cbs.onScreenshot()).resolves.toBeUndefined();
    });

    it('handleRecordAction starts pre-recording flow', async () => {
      mockGetCurrentAreaSelection.mockReturnValue({
        x: 10,
        y: 20,
        width: 100,
        height: 100,
      });
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onRecord: () => void;
      };
      cbs.onRecord();
      expect(mockPrewarmRecordingControl).toHaveBeenCalled();
      expect(mockPrewarmRecorder).toHaveBeenCalled();
      expect(mockPrewarmOverlay).toHaveBeenCalled();
      expect(mockShowPreRecordingControl).toHaveBeenCalled();
      expect(mockUpdateAreaSelectionCallbacks).toHaveBeenCalled();
    });

    it('handleRecordAction no-op when no area', async () => {
      mockGetCurrentAreaSelection.mockReturnValue(null);
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onRecord: () => void;
      };
      cbs.onRecord();
      expect(mockPrewarmRecorder).not.toHaveBeenCalled();
    });

    it('handleUpdateSizeAction resizes the selector around current center', async () => {
      mockGetCurrentAreaSelection.mockReturnValue({
        x: 100,
        y: 100,
        width: 400,
        height: 200,
      });
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onUpdateSize: (s: { width: number; height: number }) => Promise<void>;
      };
      await cbs.onUpdateSize({ width: 200, height: 100 });
      const expectedBounds = { x: 200, y: 150, width: 200, height: 100 };
      expect(mockUpdateAreaSelection).toHaveBeenCalledWith(expectedBounds);
      expect(mockUpdateConfig).toHaveBeenCalledWith({
        allInOne: { lastArea: expectedBounds },
      });
      expect(mockUpdateAllInOnePosition).toHaveBeenCalledWith(expectedBounds);
    });

    it('handleUpdateSizeAction clamps size inside the active display', async () => {
      mockGetAllDisplays.mockReturnValue([
        { bounds: { x: 0, y: 0, width: 1000, height: 800 } },
      ]);
      mockGetCurrentAreaSelection.mockReturnValue({
        x: 900,
        y: 700,
        width: 80,
        height: 80,
      });
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onUpdateSize: (s: { width: number; height: number }) => Promise<void>;
      };
      await cbs.onUpdateSize({ width: 300, height: 300 });
      expect(mockUpdateAreaSelection).toHaveBeenCalledWith({
        x: 700,
        y: 500,
        width: 300,
        height: 300,
      });
    });

    it('handleUpdateSizeAction no-ops without current area', async () => {
      mockGetCurrentAreaSelection.mockReturnValue(null);
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onUpdateSize: (s: { width: number; height: number }) => Promise<void>;
      };
      await cbs.onUpdateSize({ width: 200, height: 100 });
      expect(mockUpdateAreaSelection).not.toHaveBeenCalled();
    });

    it('handleUpdateSizeAction stops when selector update fails', async () => {
      mockGetCurrentAreaSelection.mockReturnValue({
        x: 100,
        y: 100,
        width: 400,
        height: 200,
      });
      mockUpdateAreaSelection.mockResolvedValue(false);
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onUpdateSize: (s: { width: number; height: number }) => Promise<void>;
      };
      await cbs.onUpdateSize({ width: 200, height: 100 });
      expect(mockUpdateConfig).not.toHaveBeenCalled();
      expect(mockUpdateAllInOnePosition).not.toHaveBeenCalled();
    });

    it('size editor callbacks suspend and restore shortcuts', async () => {
      mockGetCurrentAreaSelection.mockReturnValue({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onSizeEditorOpened: () => void;
        onSizeEditorClosed: () => void;
      };
      cbs.onSizeEditorOpened();
      cbs.onSizeEditorClosed();
      expect(mockGlobalShortcutUnregister).toHaveBeenCalled();
      expect(mockGlobalShortcutRegister).toHaveBeenCalledTimes(3);
    });

    it('record callback onUpdate updates control position', async () => {
      mockGetCurrentAreaSelection.mockReturnValue({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onRecord: () => void;
      };
      cbs.onRecord();
      const updateCallbacks = mockUpdateAreaSelectionCallbacks.mock
        .calls[0][0] as {
        onUpdate: (s: unknown) => void;
        onCancelled: () => void;
      };
      updateCallbacks.onUpdate({
        status: 'updated',
        x: 50,
        y: 60,
        width: 200,
        height: 100,
      });
      expect(mockUpdateRecordingControlPosition).toHaveBeenCalledWith({
        x: 50,
        y: 60,
        width: 200,
        height: 100,
      });
      updateCallbacks.onCancelled();
      expect(mockHidePreRecordingControl).toHaveBeenCalled();
    });

    it('handleCloseAction unregisters shortcuts and cancels selection', async () => {
      const { init } = await import('@/main/capture/all-in-one');
      init();
      const cbs = mockSetAllInOneCallbacks.mock.calls[0][0] as {
        onClose: () => void;
      };
      cbs.onClose();
      expect(mockCancelAreaSelection).toHaveBeenCalled();
      expect(mockHideAllInOneControl).toHaveBeenCalled();
    });
  });
});
