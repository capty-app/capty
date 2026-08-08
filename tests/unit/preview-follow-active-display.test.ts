import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const CURSOR_ON_ONE = { x: 100, y: 10 };
const CURSOR_ON_TWO = { x: 2500, y: 10 };

let displays: MockDisplay[] = [DISPLAY_ONE, DISPLAY_TWO];
let cursorPoint = { ...CURSOR_ON_ONE };
let stackedCount = 0;

const mockDaemonCall = vi.fn(() => Promise.resolve(undefined));
const mockDaemonOnEvent = vi.fn();
const mockDaemonOffEvent = vi.fn();
const mockGetConfig = vi.fn();
const mockSetPreviewConfigListener = vi.fn();
const mockOnRelocate = vi.fn();

function displayNearestPoint(point: { x: number; y: number }): MockDisplay {
  return (
    displays.find(
      display =>
        point.x >= display.workArea.x &&
        point.x < display.workArea.x + display.workArea.width
    ) ?? displays[0]
  );
}

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => displays,
    getCursorScreenPoint: () => cursorPoint,
    getDisplayNearestPoint: (point: { x: number; y: number }) =>
      displayNearestPoint(point),
  },
}));

vi.mock('@/main/daemon', () => ({
  daemon: {
    call: (...a: unknown[]) => mockDaemonCall(...a),
    onEvent: (...a: unknown[]) => mockDaemonOnEvent(...a),
    offEvent: (...a: unknown[]) => mockDaemonOffEvent(...a),
  },
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
  setPreviewConfigListener: (...a: unknown[]) =>
    mockSetPreviewConfigListener(...a),
}));

function setFollowEnabled(followActiveDisplay: boolean): void {
  mockGetConfig.mockReturnValue({
    preview: { displayId: null, followActiveDisplay },
  });
}

async function initController() {
  const controller =
    await import('@/main/capture/capture-preview/follow-active-display');

  controller.initFollowActiveDisplay({
    getStackedCount: () => stackedCount,
    onRelocate: mockOnRelocate,
  });

  return controller;
}

function getDaemonEventHandler(): (event: string) => void {
  return mockDaemonOnEvent.mock.calls[0][0] as (event: string) => void;
}

function getPreviewConfigListener(): () => void {
  return mockSetPreviewConfigListener.mock.calls[0][0] as () => void;
}

describe('follow-active-display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    displays = [DISPLAY_ONE, DISPLAY_TWO];
    cursorPoint = { ...CURSOR_ON_ONE };
    stackedCount = 0;
    setFollowEnabled(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the monitor once while following with stacked previews', async () => {
    stackedCount = 1;
    const controller = await initController();

    expect(controller.syncFollowMonitor()).toBe(true);
    expect(mockDaemonCall).toHaveBeenCalledWith('active-display', 'start');
    expect(mockDaemonCall).toHaveBeenCalledTimes(1);

    expect(controller.syncFollowMonitor()).toBe(false);
    expect(mockDaemonCall).toHaveBeenCalledTimes(1);
  });

  it('stops the monitor once no stacked preview is left', async () => {
    stackedCount = 1;
    const controller = await initController();
    controller.syncFollowMonitor();
    mockDaemonCall.mockClear();

    stackedCount = 0;

    expect(controller.syncFollowMonitor()).toBe(true);
    expect(mockDaemonCall).toHaveBeenCalledWith('active-display', 'stop');
    expect(mockDaemonCall).toHaveBeenCalledTimes(1);
  });

  it('stops the monitor and resolves no display once following is disabled', async () => {
    stackedCount = 1;
    const controller = await initController();
    controller.syncFollowMonitor();
    mockDaemonCall.mockClear();

    setFollowEnabled(false);

    expect(controller.syncFollowMonitor()).toBe(true);
    expect(mockDaemonCall).toHaveBeenCalledWith('active-display', 'stop');
    expect(controller.getFollowDisplay()).toBeNull();
  });

  it('relocates only after the cursor dwells for the full delay', async () => {
    stackedCount = 1;
    const controller = await initController();
    controller.syncFollowMonitor();

    cursorPoint = { ...CURSOR_ON_TWO };
    getDaemonEventHandler()('active-display:changed');

    vi.advanceTimersByTime(299);
    expect(mockOnRelocate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockOnRelocate).toHaveBeenCalledTimes(1);
  });

  it('does not relocate when the cursor sweeps to another display and back', async () => {
    stackedCount = 1;
    const controller = await initController();
    controller.syncFollowMonitor();
    const handleDaemonEvent = getDaemonEventHandler();

    cursorPoint = { ...CURSOR_ON_TWO };
    handleDaemonEvent('active-display:changed');

    vi.advanceTimersByTime(200);
    cursorPoint = { ...CURSOR_ON_ONE };
    handleDaemonEvent('active-display:changed');

    vi.advanceTimersByTime(299);
    expect(mockOnRelocate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(701);
    expect(mockOnRelocate).not.toHaveBeenCalled();
  });

  it('tracks the dwelled display and relocates exactly once per change', async () => {
    stackedCount = 1;
    const controller = await initController();
    controller.syncFollowMonitor();
    const handleDaemonEvent = getDaemonEventHandler();

    cursorPoint = { ...CURSOR_ON_TWO };
    handleDaemonEvent('active-display:changed');
    vi.advanceTimersByTime(300);

    expect(mockOnRelocate).toHaveBeenCalledTimes(1);
    expect(controller.getFollowDisplay()).toEqual(DISPLAY_TWO);

    handleDaemonEvent('active-display:changed');
    vi.advanceTimersByTime(300);

    expect(mockOnRelocate).toHaveBeenCalledTimes(1);
  });

  it('resolves the display under the cursor while the monitor is not running', async () => {
    const controller = await initController();

    cursorPoint = { ...CURSOR_ON_ONE };
    expect(controller.getFollowDisplay()).toEqual(DISPLAY_ONE);

    cursorPoint = { ...CURSOR_ON_TWO };
    expect(controller.getFollowDisplay()).toEqual(DISPLAY_TWO);
  });

  it('keeps resolving the tracked display until the cursor dwells elsewhere', async () => {
    stackedCount = 1;
    const controller = await initController();
    controller.syncFollowMonitor();

    cursorPoint = { ...CURSOR_ON_TWO };
    getDaemonEventHandler()('active-display:changed');
    vi.advanceTimersByTime(300);

    cursorPoint = { ...CURSOR_ON_ONE };

    expect(controller.getFollowDisplay()).toEqual(DISPLAY_TWO);
  });

  it('relocates when a preview write turns following on', async () => {
    setFollowEnabled(false);
    stackedCount = 1;
    await initController();

    setFollowEnabled(true);
    getPreviewConfigListener()();

    expect(mockDaemonCall).toHaveBeenCalledWith('active-display', 'start');
    expect(mockOnRelocate).toHaveBeenCalledTimes(1);
  });

  it('retries the monitor after a failed start', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    stackedCount = 1;
    const controller = await initController();
    mockDaemonCall.mockImplementationOnce(() =>
      Promise.reject(new Error('start failed'))
    );

    expect(controller.syncFollowMonitor()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.syncFollowMonitor()).toBe(true);
    expect(mockDaemonCall).toHaveBeenNthCalledWith(
      2,
      'active-display',
      'start'
    );

    consoleError.mockRestore();
  });

  it('does not relocate when a preview write leaves the follow state unchanged', async () => {
    setFollowEnabled(false);
    stackedCount = 1;
    await initController();

    getPreviewConfigListener()();

    expect(mockOnRelocate).not.toHaveBeenCalled();
    expect(mockDaemonCall).not.toHaveBeenCalled();
  });

  it('re-issues start when the daemon becomes ready while monitoring', async () => {
    stackedCount = 1;
    const controller = await initController();
    controller.syncFollowMonitor();
    mockDaemonCall.mockClear();

    getDaemonEventHandler()('system:ready');

    expect(mockDaemonCall).toHaveBeenCalledWith('active-display', 'start');
  });

  it('re-resolves the cursor display after the daemon becomes ready again', async () => {
    stackedCount = 1;
    const controller = await initController();
    controller.syncFollowMonitor();

    cursorPoint = { ...CURSOR_ON_TWO };
    getDaemonEventHandler()('system:ready');
    vi.advanceTimersByTime(300);

    expect(mockOnRelocate).toHaveBeenCalledTimes(1);
    expect(controller.getFollowDisplay()).toEqual(DISPLAY_TWO);
  });
});
