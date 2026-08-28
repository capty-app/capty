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

describe('scanQRCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetConfig.mockReturnValue({ screenshot: { hideDesktopIcons: false } });
    mockIsDesktopIconsSupported.mockReturnValue(true);
  });

  it('copies detected QR payload', async () => {
    mockFsExistsSync.mockReturnValue(true);
    mockDaemonCall.mockResolvedValue({ payload: 'https://example.com' });
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const scan = (await import('@/main/capture/qrcode')).default;
    await scan();
    await flush();
    expect(mockClipboardWriteText).toHaveBeenCalledWith('https://example.com');
    expect(mockNotificationShow).toHaveBeenCalled();
  });

  it('notifies when no QR detected', async () => {
    mockFsExistsSync.mockReturnValue(true);
    mockDaemonCall.mockResolvedValue({ payload: '' });
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const scan = (await import('@/main/capture/qrcode')).default;
    await scan();
    await flush();
    expect(mockClipboardWriteText).not.toHaveBeenCalled();
    expect(mockNotificationShow).toHaveBeenCalled();
  });

  it('bails on screencapture error', async () => {
    mockExec.mockImplementation((_c, cb) => cb(new Error('cap fail'), '', ''));
    const scan = (await import('@/main/capture/qrcode')).default;
    await scan();
    await flush();
    expect(mockDaemonCall).not.toHaveBeenCalled();
  });

  it('bails on stderr', async () => {
    mockExec.mockImplementation((_c, cb) => cb(null, '', 'err'));
    const scan = (await import('@/main/capture/qrcode')).default;
    await scan();
    await flush();
    expect(mockDaemonCall).not.toHaveBeenCalled();
  });

  it('bails when temp file missing', async () => {
    mockFsExistsSync.mockReturnValue(false);
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const scan = (await import('@/main/capture/qrcode')).default;
    await scan();
    await flush();
    expect(mockDaemonCall).not.toHaveBeenCalled();
  });

  it('shows failure notification on daemon error', async () => {
    mockFsExistsSync.mockReturnValue(true);
    mockDaemonCall.mockRejectedValue(new Error('qr crash'));
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const scan = (await import('@/main/capture/qrcode')).default;
    await scan();
    await flush();
    expect(mockNotificationShow).toHaveBeenCalled();
  });

  it('hides and restores desktop icons when enabled', async () => {
    mockGetConfig.mockReturnValue({ screenshot: { hideDesktopIcons: true } });
    mockFsExistsSync.mockReturnValue(true);
    mockDaemonCall.mockResolvedValue({ payload: 'x' });
    mockExec.mockImplementation((_c, cb) => cb(null, '', ''));
    const scan = (await import('@/main/capture/qrcode')).default;
    await scan();
    await flush();
    expect(mockHideDesktopIcons).toHaveBeenCalledWith('capture');
    expect(mockShowDesktopIcons).toHaveBeenCalledWith('capture');
  });
});
