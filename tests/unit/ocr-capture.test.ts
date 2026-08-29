import { describe, it, expect, vi, beforeEach } from 'vitest';

type ExecCallback = (
  error: Error | null,
  stdout: string,
  stderr: string
) => void;
const mockExec = vi.fn<(command: string, callback: ExecCallback) => void>();
const mockClipboardWriteText = vi.fn();
const mockNotificationShow = vi.fn();
const mockGetConfig = vi.fn();
const mockHideDesktopIcons = vi.fn();
const mockShowDesktopIcons = vi.fn();
const mockIsDesktopIconsSupported = vi.fn();
const mockDaemonCall = vi.fn();
const mockFsExistsSync = vi.fn();
const mockFsUnlinkSync = vi.fn();

vi.mock('child_process', () => ({
  exec: (cmd: string, cb: ExecCallback) => mockExec(cmd, cb),
}));

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
  app: { getPath: () => '/tmp' },
  clipboard: { writeText: (...a: unknown[]) => mockClipboardWriteText(...a) },
  Notification: MockNotification,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockFsExistsSync(...a),
    unlinkSync: (...a: unknown[]) => mockFsUnlinkSync(...a),
  },
  existsSync: (...a: unknown[]) => mockFsExistsSync(...a),
  unlinkSync: (...a: unknown[]) => mockFsUnlinkSync(...a),
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
}));

vi.mock('@/main/capture/desktop-icons', () => ({
  hideDesktopIcons: (...a: unknown[]) => mockHideDesktopIcons(...a),
  showDesktopIcons: (...a: unknown[]) => mockShowDesktopIcons(...a),
  isSupported: () => mockIsDesktopIconsSupported(),
}));

vi.mock('@/main/daemon', () => ({
  daemon: { call: (...a: unknown[]) => mockDaemonCall(...a) },
}));

async function flush(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

describe('captureText (OCR)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetConfig.mockReturnValue({ screenshot: { hideDesktopIcons: false } });
    mockIsDesktopIconsSupported.mockReturnValue(true);
  });

  it('writes detected text to clipboard and shows notification', async () => {
    mockFsExistsSync.mockReturnValue(true);
    mockDaemonCall.mockResolvedValue({ text: '  Hello world  ' });
    mockExec.mockImplementation((_cmd, cb) => cb(null, '', ''));
    const captureText = (await import('@/main/capture/ocr')).default;
    await captureText();
    await flush();
    expect(mockClipboardWriteText).toHaveBeenCalledWith('Hello world');
    expect(mockNotificationShow).toHaveBeenCalled();
    expect(mockFsUnlinkSync).toHaveBeenCalled();
  });

  it('notifies when no text detected', async () => {
    mockFsExistsSync.mockReturnValue(true);
    mockDaemonCall.mockResolvedValue({ text: '' });
    mockExec.mockImplementation((_cmd, cb) => cb(null, '', ''));
    const captureText = (await import('@/main/capture/ocr')).default;
    await captureText();
    await flush();
    expect(mockClipboardWriteText).not.toHaveBeenCalled();
    expect(mockNotificationShow).toHaveBeenCalled();
  });

  it('bails out when screencapture errors', async () => {
    mockExec.mockImplementation((_cmd, cb) =>
      cb(new Error('cap failed'), '', '')
    );
    const captureText = (await import('@/main/capture/ocr')).default;
    await captureText();
    await flush();
    expect(mockDaemonCall).not.toHaveBeenCalled();
  });

  it('bails out when screencapture has stderr', async () => {
    mockExec.mockImplementation((_cmd, cb) => cb(null, '', 'something wrong'));
    const captureText = (await import('@/main/capture/ocr')).default;
    await captureText();
    await flush();
    expect(mockDaemonCall).not.toHaveBeenCalled();
  });

  it('bails out when temp screenshot is missing', async () => {
    mockFsExistsSync.mockReturnValue(false);
    mockExec.mockImplementation((_cmd, cb) => cb(null, '', ''));
    const captureText = (await import('@/main/capture/ocr')).default;
    await captureText();
    await flush();
    expect(mockDaemonCall).not.toHaveBeenCalled();
  });

  it('shows failure notification on daemon error', async () => {
    mockFsExistsSync.mockReturnValue(true);
    mockDaemonCall.mockRejectedValue(new Error('ocr crash'));
    mockExec.mockImplementation((_cmd, cb) => cb(null, '', ''));
    const captureText = (await import('@/main/capture/ocr')).default;
    await captureText();
    await flush();
    expect(mockNotificationShow).toHaveBeenCalled();
  });

  it('hides and restores desktop icons when enabled', async () => {
    mockGetConfig.mockReturnValue({ screenshot: { hideDesktopIcons: true } });
    mockFsExistsSync.mockReturnValue(true);
    mockDaemonCall.mockResolvedValue({ text: 'x' });
    mockExec.mockImplementation((_cmd, cb) => cb(null, '', ''));
    const captureText = (await import('@/main/capture/ocr')).default;
    await captureText();
    await flush();
    expect(mockHideDesktopIcons).toHaveBeenCalledWith('capture');
    expect(mockShowDesktopIcons).toHaveBeenCalledWith('capture');
  });
});
