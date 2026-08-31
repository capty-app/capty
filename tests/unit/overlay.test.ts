import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDaemonCall = vi.fn();

vi.mock('@/main/daemon', () => ({
  daemon: { call: (...args: unknown[]) => mockDaemonCall(...args) },
}));

describe('recording overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('showRecordingOverlay calls daemon with bounds', async () => {
    mockDaemonCall.mockResolvedValue({});
    const { showRecordingOverlay } =
      await import('@/main/capture/video/overlay');
    await showRecordingOverlay(10, 20, 800, 600);
    expect(mockDaemonCall).toHaveBeenCalledWith('recording-overlay', 'show', {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    });
  });

  it('show survives daemon failure', async () => {
    mockDaemonCall.mockRejectedValue(new Error('boom'));
    const { showRecordingOverlay } =
      await import('@/main/capture/video/overlay');
    await expect(showRecordingOverlay(0, 0, 100, 100)).resolves.toBeUndefined();
  });

  it('hide always sends an idempotent cleanup request', async () => {
    mockDaemonCall.mockResolvedValue({});
    const { hideRecordingOverlay } =
      await import('@/main/capture/video/overlay');
    await hideRecordingOverlay();
    expect(mockDaemonCall).toHaveBeenCalledWith('recording-overlay', 'hide');
  });

  it('hide calls daemon after show', async () => {
    mockDaemonCall.mockResolvedValue({});
    const m = await import('@/main/capture/video/overlay');
    await m.showRecordingOverlay(0, 0, 100, 100);
    mockDaemonCall.mockClear();
    await m.hideRecordingOverlay();
    expect(mockDaemonCall).toHaveBeenCalledWith('recording-overlay', 'hide');
  });

  it('hide swallows daemon errors', async () => {
    mockDaemonCall
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('boom'));
    const m = await import('@/main/capture/video/overlay');
    await m.showRecordingOverlay(0, 0, 100, 100);
    await expect(m.hideRecordingOverlay()).resolves.toBeUndefined();
  });

  it('prewarmOverlay is a noop', async () => {
    const { prewarmOverlay } = await import('@/main/capture/video/overlay');
    await expect(prewarmOverlay()).resolves.toBeUndefined();
    expect(mockDaemonCall).not.toHaveBeenCalled();
  });
});
