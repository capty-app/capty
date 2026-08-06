import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDaemonCall = vi.fn();
const mockShowOverlay = vi.fn();
const mockHideOverlay = vi.fn();
const mockShowTray = vi.fn();
const mockHideTray = vi.fn();
const mockEnsureDirectoryExists = vi.fn();
const mockIsValidDirectory = vi.fn();
const mockGetConfig = vi.fn();
const mockGenerateFilename = vi.fn();
const mockCreateProjectFolder = vi.fn();

vi.mock('electron', () => ({
  app: { getPath: () => '/Users/me/Movies' },
}));

vi.mock('@/main/daemon', () => ({
  daemon: { call: (...a: unknown[]) => mockDaemonCall(...a) },
}));

vi.mock('@/main/capture/video/overlay.ts', () => ({
  showRecordingOverlay: (...a: unknown[]) => mockShowOverlay(...a),
  hideRecordingOverlay: () => mockHideOverlay(),
}));

vi.mock('@/main/menu/recording-tray.ts', () => ({
  showRecordingTray: () => mockShowTray(),
  hideRecordingTray: () => mockHideTray(),
}));

vi.mock('@/main/utils/paths.ts', () => ({
  ensureDirectoryExists: (...a: unknown[]) => mockEnsureDirectoryExists(...a),
  isValidDirectory: (...a: unknown[]) => mockIsValidDirectory(...a),
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
}));

vi.mock('@/main/utils/filename-generator', () => ({
  generateFilename: (...a: unknown[]) => mockGenerateFilename(...a),
}));

vi.mock('@/main/capture/video/recording-project', () => ({
  createProjectFolder: (...a: unknown[]) => mockCreateProjectFolder(...a),
}));

describe('recorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockEnsureDirectoryExists.mockImplementation((p: string) => p);
    mockIsValidDirectory.mockReturnValue(false);
    mockGetConfig.mockReturnValue({
      storage: { namingPattern: 'Recording {date}' },
    });
    mockGenerateFilename.mockReturnValue('Recording 2025-01-01');
  });

  describe('paths/naming', () => {
    it('getRecordingsDir uses Videos/Capty by default', async () => {
      const { getRecordingsDir } =
        await import('@/main/capture/video/recorder');
      expect(getRecordingsDir()).toBe('/Users/me/Movies/Capty');
    });

    it('getRecordingsDir respects custom path when valid', async () => {
      mockIsValidDirectory.mockReturnValue(true);
      mockGetConfig.mockReturnValue({
        storage: { recordingsPath: '/custom/path' },
      });
      const { getRecordingsDir } =
        await import('@/main/capture/video/recorder');
      expect(getRecordingsDir()).toBe('/custom/path');
    });

    it('generateRecordingProjectName appends .capty extension', async () => {
      const { generateRecordingProjectName } =
        await import('@/main/capture/video/recorder');
      expect(generateRecordingProjectName()).toBe('Recording 2025-01-01.capty');
    });

    it('createRecordingProject delegates to createProjectFolder', async () => {
      mockCreateProjectFolder.mockReturnValue('/path/recording.mov');
      const { createRecordingProject } =
        await import('@/main/capture/video/recorder');
      const result = createRecordingProject();
      expect(result).toBe('/path/recording.mov');
      expect(mockCreateProjectFolder).toHaveBeenCalled();
    });

    it('generateRecordingExportName generates filename with extension', async () => {
      mockGenerateFilename.mockReturnValue('Recording 2025-01-01.mp4');
      const { generateRecordingExportName } =
        await import('@/main/capture/video/recorder');
      expect(generateRecordingExportName('mp4')).toBe(
        'Recording 2025-01-01.mp4'
      );
    });
  });

  describe('state getters', () => {
    it('starts idle', async () => {
      const m = await import('@/main/capture/video/recorder');
      expect(m.isRecording()).toBe(false);
      expect(m.isPaused()).toBe(false);
      expect(m.getRecordingState()).toBe('idle');
      expect(m.getRecordingDuration()).toBe(0);
      expect(m.getCurrentRecordingPath()).toBeNull();
    });
  });

  describe('startRecordingWithConfig', () => {
    it('starts recording and shows overlay for area recordings', async () => {
      mockDaemonCall.mockResolvedValue({ success: true, state: 'recording' });
      mockShowOverlay.mockResolvedValue(undefined);
      const m = await import('@/main/capture/video/recorder');
      const showControl = vi.fn();
      await m.startRecordingWithConfig(
        {
          x: 10,
          y: 20,
          width: 800,
          height: 600,
          outputPath: '/path/out.mov',
        },
        showControl
      );
      expect(showControl).toHaveBeenCalled();
      expect(mockShowOverlay).toHaveBeenCalledWith(10, 20, 800, 600);
      expect(mockShowTray).toHaveBeenCalled();
      expect(m.isRecording()).toBe(true);
    });

    it('does not show overlay for iOS recordings', async () => {
      mockDaemonCall.mockResolvedValue({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig(
        {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          iosDeviceId: 'ios-1',
          outputPath: '/out.mov',
        },
        vi.fn()
      );
      expect(mockShowOverlay).not.toHaveBeenCalled();
    });

    it('throws when daemon returns failure', async () => {
      mockDaemonCall.mockResolvedValue({
        success: false,
        message: 'bad config',
      });
      const m = await import('@/main/capture/video/recorder');
      await expect(
        m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn())
      ).rejects.toThrow('bad config');
    });
  });

  describe('pauseRecording', () => {
    it('returns early when not recording', async () => {
      mockDaemonCall.mockResolvedValue({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.pauseRecording();
      expect(mockDaemonCall).not.toHaveBeenCalled();
    });

    it('pauses when recording', async () => {
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn());
      mockDaemonCall.mockResolvedValueOnce({ success: true, duration: 12 });
      await m.pauseRecording();
      expect(m.getRecordingState()).toBe('paused');
      expect(m.getRecordingDuration()).toBe(12);
    });

    it('throws when daemon pauses fails', async () => {
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn());
      mockDaemonCall.mockResolvedValueOnce({
        success: false,
        message: 'fail',
      });
      await expect(m.pauseRecording()).rejects.toThrow('fail');
    });
  });

  describe('resumeRecording', () => {
    it('returns early when not paused', async () => {
      const m = await import('@/main/capture/video/recorder');
      await m.resumeRecording();
      expect(mockDaemonCall).not.toHaveBeenCalled();
    });

    it('resumes from paused state', async () => {
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn());
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      await m.pauseRecording();
      mockDaemonCall.mockResolvedValueOnce({ success: true, duration: 30 });
      await m.resumeRecording();
      expect(m.getRecordingState()).toBe('recording');
      expect(m.getRecordingDuration()).toBe(30);
    });
  });

  describe('stopRecording', () => {
    it('returns null when not recording', async () => {
      const m = await import('@/main/capture/video/recorder');
      const result = await m.stopRecording(vi.fn());
      expect(result).toBeNull();
    });

    it('stops recording and returns final path', async () => {
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn());
      mockDaemonCall.mockResolvedValueOnce({
        success: true,
        outputPath: '/final/out.mov',
      });
      const hideControl = vi.fn();
      const result = await m.stopRecording(hideControl);
      expect(result).toBe('/final/out.mov');
      expect(hideControl).toHaveBeenCalled();
      expect(mockHideOverlay).toHaveBeenCalled();
      expect(mockHideTray).toHaveBeenCalled();
      expect(m.getRecordingState()).toBe('idle');
    });

    it('hides the control before recording finalization completes', async () => {
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn());

      let resolveStop:
        | ((response: { success: boolean; outputPath: string }) => void)
        | undefined;
      mockDaemonCall.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveStop = resolve;
          })
      );

      const hideControl = vi.fn();
      const stopPromise = m.stopRecording(hideControl);

      expect(hideControl).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(resolveStop).toBeDefined();

      resolveStop?.({ success: true, outputPath: '/final/out.mov' });
      await expect(stopPromise).resolves.toBe('/final/out.mov');
    });

    it('throws on stop failure but still resets state', async () => {
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn());
      mockDaemonCall.mockResolvedValueOnce({
        success: false,
        message: 'stop fail',
      });
      await expect(m.stopRecording(vi.fn())).rejects.toThrow('stop fail');
      expect(m.getRecordingState()).toBe('idle');
    });
  });

  describe('quitRecorder', () => {
    it('hides overlay and tray and idles state', async () => {
      const m = await import('@/main/capture/video/recorder');
      await m.quitRecorder();
      expect(mockHideOverlay).toHaveBeenCalled();
      expect(mockHideTray).toHaveBeenCalled();
      expect(m.getRecordingState()).toBe('idle');
    });

    it('attempts to stop daemon when recording', async () => {
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn());
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      await m.quitRecorder();
      expect(mockDaemonCall).toHaveBeenCalledWith(
        'screen-recorder',
        'stop',
        undefined,
        5000
      );
    });

    it('swallows daemon errors during quit', async () => {
      mockDaemonCall.mockResolvedValueOnce({ success: true });
      const m = await import('@/main/capture/video/recorder');
      await m.startRecordingWithConfig({ outputPath: '/out.mov' }, vi.fn());
      mockDaemonCall.mockRejectedValueOnce(new Error('boom'));
      await expect(m.quitRecorder()).resolves.toBeUndefined();
    });
  });

  describe('prewarmRecorder', () => {
    it('calls daemon status', async () => {
      mockDaemonCall.mockResolvedValue({});
      const { prewarmRecorder } = await import('@/main/capture/video/recorder');
      await prewarmRecorder();
      expect(mockDaemonCall).toHaveBeenCalledWith(
        'screen-recorder',
        'status',
        undefined,
        5000
      );
    });

    it('swallows daemon errors', async () => {
      mockDaemonCall.mockRejectedValue(new Error('boom'));
      const { prewarmRecorder } = await import('@/main/capture/video/recorder');
      await expect(prewarmRecorder()).resolves.toBeUndefined();
    });
  });
});
