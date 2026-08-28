import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockShowNotification = vi.fn();
const mockGetConfig = vi.fn();
const mockFsExistsSync = vi.fn();
const mockFsReadFileSync = vi.fn();
const mockClipboardWriteImage = vi.fn();
const mockCreateFromBuffer = vi.fn();

vi.mock('electron', () => ({
  clipboard: { writeImage: (...a: unknown[]) => mockClipboardWriteImage(...a) },
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

async function loadModule() {
  return import('@/main/capture/screenshot/capture-feedback');
}

describe('resolveCaptureOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns failed and notifies when exec reports an error', async () => {
    const { resolveCaptureOutcome } = await loadModule();
    const outcome = resolveCaptureOutcome(
      new Error('boom'),
      '',
      '/tmp/shot.png',
      true
    );
    expect(outcome).toBe('failed');
    expect(mockShowNotification).toHaveBeenCalledWith({
      title: 'Screenshot Failed',
      body: 'boom',
    });
  });

  it('returns failed and notifies with stderr even on a zero exit code', async () => {
    const { resolveCaptureOutcome } = await loadModule();
    const outcome = resolveCaptureOutcome(
      null,
      'screencapture: cannot write file to intended destination',
      '/tmp/shot.png',
      false
    );
    expect(outcome).toBe('failed');
    expect(mockShowNotification).toHaveBeenCalledWith({
      title: 'Screenshot Failed',
      body: 'screencapture: cannot write file to intended destination',
    });
  });

  it('returns captured when the file exists', async () => {
    mockFsExistsSync.mockReturnValue(true);
    const { resolveCaptureOutcome } = await loadModule();
    const outcome = resolveCaptureOutcome(null, '', '/tmp/shot.png', true);
    expect(outcome).toBe('captured');
    expect(mockShowNotification).not.toHaveBeenCalled();
  });

  it('treats a silent exit with no file as cancellation in interactive mode', async () => {
    mockFsExistsSync.mockReturnValue(false);
    const { resolveCaptureOutcome } = await loadModule();
    const outcome = resolveCaptureOutcome(null, '', '/tmp/shot.png', true);
    expect(outcome).toBe('cancelled');
    expect(mockShowNotification).not.toHaveBeenCalled();
  });

  it('treats a silent exit with no file as failure in non-interactive mode', async () => {
    mockFsExistsSync.mockReturnValue(false);
    const { resolveCaptureOutcome } = await loadModule();
    const outcome = resolveCaptureOutcome(null, '', '/tmp/shot.png', false);
    expect(outcome).toBe('failed');
    expect(mockShowNotification).toHaveBeenCalledWith({
      title: 'Screenshot Failed',
      body: 'The screen could not be captured.',
    });
  });
});

describe('copyScreenshotToClipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFsReadFileSync.mockReturnValue(Buffer.from('img'));
    mockCreateFromBuffer.mockReturnValue({ id: 'image' });
  });

  it('writes the image to the clipboard and notifies when enabled', async () => {
    mockGetConfig.mockReturnValue({
      general: { showCaptureNotifications: true },
    });
    const { copyScreenshotToClipboard } = await loadModule();
    copyScreenshotToClipboard('/tmp/shot.png');
    expect(mockClipboardWriteImage).toHaveBeenCalledWith({ id: 'image' });
    expect(mockShowNotification).toHaveBeenCalledWith({
      title: 'Copied to Clipboard',
      body: 'Screenshot copied to your clipboard',
    });
  });

  it('copies silently when capture notifications are disabled', async () => {
    mockGetConfig.mockReturnValue({
      general: { showCaptureNotifications: false },
    });
    const { copyScreenshotToClipboard } = await loadModule();
    copyScreenshotToClipboard('/tmp/shot.png');
    expect(mockClipboardWriteImage).toHaveBeenCalled();
    expect(mockShowNotification).not.toHaveBeenCalled();
  });
});
