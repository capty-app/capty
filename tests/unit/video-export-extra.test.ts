import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => unknown;
const ipcHandle: Record<string, Handler> = {};

const mockExistsSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockProbeVideo = vi.fn();
const mockClipboardWriteBuffer = vi.fn();
const mockLoadCursorData = vi.fn();
const mockLoadCameraData = vi.fn();
const mockResolveVideoMediaPaths = vi.fn((videoPath: string) => ({
  video: videoPath,
  camera: '/p/camera.mov',
  identities: {
    video: { device: 1, inode: 2 },
    camera: { device: 1, inode: 3 },
  },
}));
const mockSetMediaPathsForSender = vi.fn();
const mockDeleteMediaPathsForSender = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (e: string, h: Handler) => {
      ipcHandle[e] = h;
    },
  },
  clipboard: {
    writeBuffer: (...a: unknown[]) => mockClipboardWriteBuffer(...a),
  },
  app: { getPath: () => '/tmp' },
}));

vi.mock('fs', () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}));

vi.mock('@/main/utils/ffmpeg', () => ({
  probeVideo: (...a: unknown[]) => mockProbeVideo(...a),
}));

vi.mock('@/main/capture/video/recording-project', () => ({
  isRecordingProject: (p: string) => p.includes('.capty'),
  getRecordingVideoPath: (p: string) =>
    p.includes('.capty') ? `${p}/recording.mov` : p,
  getSystemAudioPath: (p: string) => `${p}.system.m4a`,
  getMicAudioPath: (p: string) => `${p}.mic.m4a`,
  getEditorStatePath: (p: string) =>
    p.includes('.capty') ? `${p}/state.json` : null,
}));

vi.mock('@/main/capture/video/cursor-data', () => ({
  loadCursorData: (...a: unknown[]) => mockLoadCursorData(...a),
}));

vi.mock('@/main/capture/video/camera-data', () => ({
  loadCameraData: (...a: unknown[]) => mockLoadCameraData(...a),
}));

vi.mock('@/main/capture/video/media-sources', () => ({
  resolveVideoMediaPaths: (...a: unknown[]) =>
    mockResolveVideoMediaPaths(...(a as [string])),
  setMediaPathsForSender: (...a: unknown[]) => mockSetMediaPathsForSender(...a),
  deleteMediaPathsForSender: (...a: unknown[]) =>
    mockDeleteMediaPathsForSender(...a),
}));

describe('capture-preview video-export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    Object.keys(ipcHandle).forEach(k => delete ipcHandle[k]);
  });

  describe('load-export-data', () => {
    it('returns null when probe fails', async () => {
      mockProbeVideo.mockResolvedValue(null);
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/video.mov');
      const result = await ipcHandle['capture-preview:load-export-data']({
        sender: { id: 1 },
      });
      expect(result).toBeNull();
    });

    it('returns payload with paths when files exist', async () => {
      mockProbeVideo.mockResolvedValue({
        metadata: { width: 1920, height: 1080, duration: 10 },
        hasAudio: false,
      });
      mockLoadCursorData.mockResolvedValue({ events: [] });
      mockLoadCameraData.mockResolvedValue({ videoFile: 'camera.mov' });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          segments: [{ id: 's1' }],
          zoomSegments: [],
          zoomSettings: { enabled: true },
        })
      );
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/Rec.capty');
      const result = (await ipcHandle['capture-preview:load-export-data']({
        sender: { id: 1 },
      })) as Record<string, unknown>;
      expect(result.videoPath).toBe('/p/Rec.capty/recording.mov');
      expect(result.cameraVideoPath).toBe('/p/camera.mov');
    });

    it('hasEmbeddedAudio when no separate audio files', async () => {
      mockProbeVideo.mockResolvedValue({
        metadata: {},
        hasAudio: true,
      });
      mockLoadCursorData.mockResolvedValue(null);
      mockLoadCameraData.mockResolvedValue(null);
      mockExistsSync.mockReturnValue(false);
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/video.mov');
      const result = (await ipcHandle['capture-preview:load-export-data']({
        sender: { id: 1 },
      })) as Record<string, unknown>;
      expect(result.hasEmbeddedAudio).toBe(true);
    });

    it('treats invalid editor state JSON as null', async () => {
      mockProbeVideo.mockResolvedValue({
        metadata: {},
        hasAudio: false,
      });
      mockLoadCursorData.mockResolvedValue(null);
      mockLoadCameraData.mockResolvedValue(null);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not-json');
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/Rec.capty');
      const result = (await ipcHandle['capture-preview:load-export-data']({
        sender: { id: 1 },
      })) as Record<string, unknown>;
      expect(result.segments).toBeNull();
    });
  });

  describe('get-export-output-path', () => {
    it('returns temp path with timestamp', async () => {
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/video.mov');
      const result = ipcHandle['capture-preview:get-export-output-path']();
      expect(result).toMatch(/^\/tmp\/capty-clipboard-.*\.mp4$/);
    });
  });

  describe('copy-video-to-clipboard', () => {
    it('returns false when output missing', async () => {
      mockExistsSync.mockReturnValue(false);
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/video.mov');
      const result = await ipcHandle['capture-preview:copy-video-to-clipboard'](
        {},
        '/p/out.mp4'
      );
      expect(result).toBe(false);
    });

    it('writes file URL buffer to clipboard', async () => {
      mockExistsSync.mockReturnValue(true);
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/video.mov');
      const result = await ipcHandle['capture-preview:copy-video-to-clipboard'](
        {},
        '/p/out.mp4'
      );
      expect(result).toBe(true);
      expect(mockClipboardWriteBuffer).toHaveBeenCalledWith(
        'public.file-url',
        expect.any(Buffer)
      );
    });

    it('schedules cleanup that unlinks file', async () => {
      mockExistsSync.mockReturnValue(true);
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/video.mov');
      await ipcHandle['capture-preview:copy-video-to-clipboard'](
        {},
        '/p/out.mp4'
      );
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(mockUnlinkSync).toHaveBeenCalledWith('/p/out.mp4');
    });

    it('returns false when clipboard.writeBuffer throws', async () => {
      mockExistsSync.mockReturnValue(true);
      mockClipboardWriteBuffer.mockImplementation(() => {
        throw new Error('clipboard busy');
      });
      const { registerPreviewExportIpc } =
        await import('@/main/capture/capture-preview/video-export');
      registerPreviewExportIpc(() => '/p/video.mov');
      const result = await ipcHandle['capture-preview:copy-video-to-clipboard'](
        {},
        '/p/out.mp4'
      );
      expect(result).toBe(false);
    });
  });
});
