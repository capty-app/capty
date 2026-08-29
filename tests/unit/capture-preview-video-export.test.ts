import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers: Record<string, (...args: unknown[]) => unknown> = {};

const mockIpcMain = {
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    ipcHandlers[channel] = handler;
  }),
};

const mockClipboard = {
  writeBuffer: vi.fn(),
};

const mockApp = {
  getPath: vi.fn(() => '/tmp'),
};

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockUnlinkSync = vi.fn();

const mockProbeVideo = vi.fn();
const mockGetRecordingVideoPath = vi.fn();
const mockGetSystemAudioPath = vi.fn();
const mockGetMicAudioPath = vi.fn();
const mockGetEditorStatePath = vi.fn();
const mockIsRecordingProject = vi.fn();
const mockLoadCursorData = vi.fn();
const mockLoadCameraData = vi.fn();
const mockResolveVideoMediaPaths = vi.fn();
const mockSetMediaPathsForSender = vi.fn();
const mockDeleteMediaPathsForSender = vi.fn();

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  clipboard: mockClipboard,
  app: mockApp,
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
}));

vi.mock('../../src/main/utils/ffmpeg', () => ({
  probeVideo: mockProbeVideo,
}));

vi.mock('../../src/main/capture/video/recording-project', () => ({
  getRecordingVideoPath: mockGetRecordingVideoPath,
  getSystemAudioPath: mockGetSystemAudioPath,
  getMicAudioPath: mockGetMicAudioPath,
  getEditorStatePath: mockGetEditorStatePath,
  isRecordingProject: mockIsRecordingProject,
}));

vi.mock('../../src/main/capture/video/cursor-data', () => ({
  loadCursorData: mockLoadCursorData,
}));

vi.mock('../../src/main/capture/video/camera-data', () => ({
  loadCameraData: mockLoadCameraData,
}));

vi.mock('../../src/main/capture/video/media-sources', () => ({
  resolveVideoMediaPaths: (...args: unknown[]) =>
    mockResolveVideoMediaPaths(...args),
  setMediaPathsForSender: (...args: unknown[]) =>
    mockSetMediaPathsForSender(...args),
  deleteMediaPathsForSender: (...args: unknown[]) =>
    mockDeleteMediaPathsForSender(...args),
}));

describe('capture preview video export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcHandlers).forEach(key => delete ipcHandlers[key]);

    mockIsRecordingProject.mockReturnValue(true);
    mockGetRecordingVideoPath.mockReturnValue('/project/video.cap/content.mp4');
    mockGetEditorStatePath.mockReturnValue('/project/video.cap/state.json');
    mockGetSystemAudioPath.mockReturnValue('/project/video.cap/system.aac');
    mockGetMicAudioPath.mockReturnValue('/project/video.cap/mic.aac');
    mockProbeVideo.mockResolvedValue({
      metadata: {
        width: 1920,
        height: 1080,
        duration: 12,
      },
      hasAudio: true,
    });
    mockLoadCursorData.mockResolvedValue(null);
    mockLoadCameraData.mockResolvedValue(null);
    mockResolveVideoMediaPaths.mockReturnValue({
      video: '/project/video.cap/content.mp4',
      camera: null,
      identities: {
        video: { device: 1, inode: 2 },
        camera: null,
      },
    });
  });

  it('includes timeline and zoom state in preview export payload', async () => {
    const segments = [
      {
        id: 'seg-1',
        originalStart: 0,
        originalEnd: 12,
        trimMinStart: 0,
        trimMaxEnd: 12,
      },
    ];
    const zoomSegments = [
      {
        id: 'zoom-1',
        startTime: 1,
        endTime: 4,
        zoomLevel: 1.5,
      },
    ];
    const zoomSettings = {
      transitionInDuration: 1.2,
      transitionOutDuration: 1.2,
      easing: 'ease-in-out' as const,
    };

    mockExistsSync.mockImplementation((targetPath: string) => {
      if (targetPath === '/project/video.cap/state.json') return true;
      if (targetPath === '/project/video.cap/system.aac') return false;
      if (targetPath === '/project/video.cap/mic.aac') return false;
      return true;
    });
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        segments,
        zoomSegments,
        zoomSettings,
        cursorStyle: { visible: true },
        cameraStyle: { visible: true },
        audioStyle: {
          systemAudioEnabled: true,
          micAudioEnabled: true,
          systemAudioVolume: 1,
          micAudioVolume: 1,
          keyboardSoundEnabled: false,
          keyboardSoundVolume: 0.7,
          keyboardSoundType: 'mechanical',
        },
      })
    );

    const { registerPreviewExportIpc } =
      await import('../../src/main/capture/capture-preview/video-export');

    registerPreviewExportIpc(() => '/project/video.cap');

    const handler = ipcHandlers['capture-preview:load-export-data'];
    const result = (await handler({ sender: { id: 7 } })) as {
      segments: typeof segments;
      zoomSegments: typeof zoomSegments;
      zoomSettings: typeof zoomSettings;
    };

    expect(result.segments).toEqual(segments);
    expect(result.zoomSegments).toEqual(zoomSegments);
    expect(result.zoomSettings).toEqual(zoomSettings);
    expect(mockResolveVideoMediaPaths).toHaveBeenCalledWith(
      '/project/video.cap/content.mp4'
    );
    expect(mockSetMediaPathsForSender).toHaveBeenCalledWith(7, {
      video: '/project/video.cap/content.mp4',
      camera: null,
      identities: {
        video: { device: 1, inode: 2 },
        camera: null,
      },
    });
  });

  it('rejects export data requests from unregistered preview senders', async () => {
    const { registerPreviewExportIpc } =
      await import('../../src/main/capture/capture-preview/video-export');

    registerPreviewExportIpc(() => null);

    const handler = ipcHandlers['capture-preview:load-export-data'];
    const result = await handler({ sender: { id: 99 } });

    expect(result).toBeNull();
    expect(mockDeleteMediaPathsForSender).toHaveBeenCalledWith(99);
    expect(mockResolveVideoMediaPaths).not.toHaveBeenCalled();
    expect(mockProbeVideo).not.toHaveBeenCalled();
  });

  it('returns null timeline fields when no editor state exists', async () => {
    mockExistsSync.mockImplementation((targetPath: string) => {
      if (targetPath === '/project/video.cap/state.json') return false;
      if (targetPath === '/project/video.cap/system.aac') return false;
      if (targetPath === '/project/video.cap/mic.aac') return false;
      return true;
    });

    const { registerPreviewExportIpc } =
      await import('../../src/main/capture/capture-preview/video-export');

    registerPreviewExportIpc(() => '/project/video.cap');

    const handler = ipcHandlers['capture-preview:load-export-data'];
    const result = (await handler({ sender: { id: 7 } })) as {
      segments: unknown;
      zoomSegments: unknown;
      zoomSettings: unknown;
    };

    expect(result.segments).toBeNull();
    expect(result.zoomSegments).toBeNull();
    expect(result.zoomSettings).toBeNull();
  });
});
