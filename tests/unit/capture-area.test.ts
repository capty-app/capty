import { describe, it, expect, vi, beforeEach } from 'vitest';

type ExecCallback = (
  error: Error | null,
  stdout: string,
  stderr: string
) => void;
const mockExec = vi.fn<(command: string, callback: ExecCallback) => void>();
const mockClipboardWriteImage = vi.fn();
const mockCreateFromBuffer = vi.fn(() => ({ image: true }));
const mockGetConfig = vi.fn();
const mockShowNotification = vi.fn();
const mockAddToHistory = vi.fn();
const mockGenerateScreenshotPath = vi.fn(() => '/path/Screenshot.png');
const mockShowCapturePreview = vi.fn();
const mockOpenScreenshotEditor = vi.fn();
const mockFsExistsSync = vi.fn();
const mockFsReadFileSync = vi.fn(() => Buffer.from('image-bytes'));

vi.mock('child_process', () => ({
  exec: (cmd: string, cb: ExecCallback) => mockExec(cmd, cb),
}));

vi.mock('electron', () => ({
  clipboard: {
    writeImage: (...a: unknown[]) => mockClipboardWriteImage(...a),
  },
  nativeImage: {
    createFromBuffer: (...a: unknown[]) => mockCreateFromBuffer(...a),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockFsExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockFsReadFileSync(...a),
  },
  existsSync: (...a: unknown[]) => mockFsExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockFsReadFileSync(...a),
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
}));

vi.mock('@/main/utils/notifications', () => ({
  showNotification: (...a: unknown[]) => mockShowNotification(...a),
}));

vi.mock('@/main/history', () => ({
  addToHistory: (...a: unknown[]) => mockAddToHistory(...a),
}));

vi.mock('@/main/capture/screenshot/utils.ts', () => ({
  generateScreenshotPath: () => mockGenerateScreenshotPath(),
}));

vi.mock('@/main/capture/capture-preview', () => ({
  showCapturePreview: (...a: unknown[]) => mockShowCapturePreview(...a),
}));

vi.mock('@/main/capture/screenshot/open-editor', () => ({
  openScreenshotEditor: (...a: unknown[]) => mockOpenScreenshotEditor(...a),
}));

describe('captureArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetConfig.mockReturnValue({
      general: { playSoundOnScreenshot: true },
      screenshot: { captureToClipboard: false, showPreview: false },
    });
    mockFsExistsSync.mockReturnValue(true);
    mockAddToHistory.mockResolvedValue({ id: 'h1' });
  });

  it('rejects invalid area (missing dimensions)', async () => {
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    const result = await captureArea({ status: 'confirmed' } as never);
    expect(result).toBeNull();
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('runs screencapture with -R bounds and opens editor by default', async () => {
    mockExec.mockImplementation((cmd, cb) => {
      expect(cmd).toContain('screencapture');
      expect(cmd).toContain('-R 10,20,800,600');
      expect(cmd).toContain('-t png');
      cb(null, '', '');
    });
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    const result = await captureArea({
      status: 'confirmed',
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    });
    expect(result).toBe('/path/Screenshot.png');
    expect(mockOpenScreenshotEditor).toHaveBeenCalledWith(
      '/path/Screenshot.png',
      'h1'
    );
  });

  it('omits sound (-x) when playSoundOnScreenshot is true', async () => {
    mockExec.mockImplementation((cmd, cb) => {
      expect(cmd).not.toContain('-x');
      cb(null, '', '');
    });
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    await captureArea({
      status: 'confirmed',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
  });

  it('passes -x to disable sound when playSoundOnScreenshot is false', async () => {
    mockGetConfig.mockReturnValue({
      general: { playSoundOnScreenshot: false },
      screenshot: { captureToClipboard: false, showPreview: false },
    });
    mockExec.mockImplementation((cmd, cb) => {
      expect(cmd).toContain('-x');
      cb(null, '', '');
    });
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    await captureArea({
      status: 'confirmed',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
  });

  it('rejects on exec error', async () => {
    mockExec.mockImplementation((_c, cb) => cb(new Error('cap fail'), '', ''));
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    await expect(
      captureArea({
        status: 'confirmed',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      })
    ).rejects.toThrow('cap fail');
  });

  it('returns null when screenshot file is missing', async () => {
    mockFsExistsSync.mockReturnValue(false);
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    const result = await captureArea({
      status: 'confirmed',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(result).toBeNull();
  });

  it('writes image to clipboard when captureToClipboard is enabled', async () => {
    mockGetConfig.mockReturnValue({
      general: { playSoundOnScreenshot: true },
      screenshot: { captureToClipboard: true, showPreview: true },
    });
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    await captureArea({
      status: 'confirmed',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(mockClipboardWriteImage).toHaveBeenCalled();
    expect(mockShowCapturePreview).not.toHaveBeenCalled();
  });

  it('shows preview when configured', async () => {
    mockGetConfig.mockReturnValue({
      general: { playSoundOnScreenshot: true },
      screenshot: { captureToClipboard: false, showPreview: true },
    });
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    await captureArea({
      status: 'confirmed',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
    expect(mockShowCapturePreview).toHaveBeenCalledWith(
      '/path/Screenshot.png',
      'screenshot',
      'h1'
    );
  });

  it('calls onCaptured hook after successful capture', async () => {
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const onCaptured = vi.fn().mockResolvedValue(undefined);
    const { captureArea } =
      await import('@/main/capture/screenshot/capture-area');
    await captureArea(
      { status: 'confirmed', x: 0, y: 0, width: 10, height: 10 },
      { onCaptured }
    );
    expect(onCaptured).toHaveBeenCalled();
  });
});
