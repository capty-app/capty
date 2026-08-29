import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => unknown;
const ipcOn: Record<string, Handler> = {};
const ipcHandle: Record<string, Handler> = {};

const mockIpcOn = vi.fn((e: string, h: Handler) => {
  ipcOn[e] = h;
});
const mockIpcHandle = vi.fn((e: string, h: Handler) => {
  ipcHandle[e] = h;
});

const mockGetWindowData = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockReadFileAsync = vi.fn();
const mockWriteFileAsync = vi.fn();
const mockShowOpenDialog = vi.fn();
const mockShowSaveDialog = vi.fn();
const mockShellShowItemInFolder = vi.fn();
const mockNotificationShow = vi.fn();
const mockGenerateInitialEditorState = vi.fn();
const mockLoadCursorData = vi.fn();
const mockSaveCursorData = vi.fn();
const mockLoadCameraData = vi.fn();
const mockGetAbsoluteCameraVideoPath = vi.fn();
const mockLoadKeyboardData = vi.fn();
const mockConvertMp4ToGif = vi.fn();
const mockGetFFmpegPath = vi.fn(() => '/bin/ffmpeg');
const mockValidateCursorData = vi.fn();
const mockResolveSaveDialogPath = vi.fn(
  (_kind: unknown, fileName: string) => fileName
);
const mockRememberSaveDirectory = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    on: (e: string, h: Handler) => mockIpcOn(e, h),
    handle: (e: string, h: Handler) => mockIpcHandle(e, h),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ id: 1 })),
  },
  dialog: {
    showOpenDialog: (...a: unknown[]) => mockShowOpenDialog(...a),
    showSaveDialog: (...a: unknown[]) => mockShowSaveDialog(...a),
  },
  shell: {
    showItemInFolder: (...a: unknown[]) => mockShellShowItemInFolder(...a),
  },
  Notification: class {
    static isSupported = () => true;
    constructor(_a: unknown) {
      void _a;
    }
    show() {
      mockNotificationShow();
    }
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
    promises: {
      readFile: (...a: unknown[]) => mockReadFileAsync(...a),
      writeFile: (...a: unknown[]) => mockWriteFileAsync(...a),
    },
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
  promises: {
    readFile: (...a: unknown[]) => mockReadFileAsync(...a),
    writeFile: (...a: unknown[]) => mockWriteFileAsync(...a),
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: (...a: unknown[]) => mockReadFileAsync(...a),
    writeFile: (...a: unknown[]) => mockWriteFileAsync(...a),
  },
  readFile: (...a: unknown[]) => mockReadFileAsync(...a),
  writeFile: (...a: unknown[]) => mockWriteFileAsync(...a),
}));

vi.mock('@/main/capture/video/window-manager', () => ({
  getWindowData: (...a: unknown[]) => mockGetWindowData(...a),
}));

vi.mock('@/main/capture/video/auto-zoom-generator', () => ({
  generateInitialEditorState: (...a: unknown[]) =>
    mockGenerateInitialEditorState(...a),
}));

vi.mock('@/main/capture/video/recording-project', () => ({
  getEditorStatePath: (p: string) =>
    p.includes('.capty') ? `${p}/state.json` : null,
  getSystemAudioPath: (p: string) => `${p}.system.m4a`,
  getMicAudioPath: (p: string) => `${p}.mic.m4a`,
}));

vi.mock('@/main/capture/video/cursor-data', () => ({
  loadCursorData: (...a: unknown[]) => mockLoadCursorData(...a),
  saveCursorData: (...a: unknown[]) => mockSaveCursorData(...a),
}));

vi.mock('@/main/capture/video/camera-data', () => ({
  loadCameraData: (...a: unknown[]) => mockLoadCameraData(...a),
  getAbsoluteCameraVideoPath: (...a: unknown[]) =>
    mockGetAbsoluteCameraVideoPath(...a),
}));

vi.mock('@/main/capture/video/keyboard-data', () => ({
  loadKeyboardData: (...a: unknown[]) => mockLoadKeyboardData(...a),
}));

vi.mock('@/main/utils/save-location', () => ({
  resolveSaveDialogPath: (...a: unknown[]) => mockResolveSaveDialogPath(...a),
  rememberSaveDirectory: (...a: unknown[]) => mockRememberSaveDirectory(...a),
}));

vi.mock('@/main/utils/ffmpeg', () => ({
  convertMp4ToGif: (...a: unknown[]) => mockConvertMp4ToGif(...a),
  getFFmpegPath: () => mockGetFFmpegPath(),
}));

vi.mock('@/types/cursor', () => ({
  validateCursorData: (...a: unknown[]) => mockValidateCursorData(...a),
}));

describe('data handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcOn).forEach(k => delete ipcOn[k]);
    Object.keys(ipcHandle).forEach(k => delete ipcHandle[k]);
  });

  it('getVideoPath returns file path or null', async () => {
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    expect(ipcHandle['video-editor:getVideoPath']({ sender: { id: 1 } })).toBe(
      '/p/video.mov'
    );
    mockGetWindowData.mockReturnValue(undefined);
    expect(
      ipcHandle['video-editor:getVideoPath']({ sender: { id: 1 } })
    ).toBeNull();
  });

  it('getCursorData returns null when no window data', async () => {
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    mockGetWindowData.mockReturnValue(undefined);
    expect(
      await ipcHandle['video-editor:getCursorData']({ sender: { id: 1 } })
    ).toBeNull();
  });

  it('getCursorData loads cursor data', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockLoadCursorData.mockResolvedValue({ events: [] });
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = await ipcHandle['video-editor:getCursorData']({
      sender: { id: 1 },
    });
    expect(result).toEqual({ events: [] });
  });

  it('getCameraData returns null when no camera', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockLoadCameraData.mockResolvedValue(null);
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    expect(
      await ipcHandle['video-editor:getCameraData']({ sender: { id: 1 } })
    ).toBeNull();
  });

  it('getCameraData returns data + video path', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockLoadCameraData.mockResolvedValue({
      videoFile: 'camera.mov',
      meta: {},
    });
    mockGetAbsoluteCameraVideoPath.mockReturnValue('/p/camera.mov');
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = await ipcHandle['video-editor:getCameraData']({
      sender: { id: 1 },
    });
    expect(result).toEqual({
      cameraData: { videoFile: 'camera.mov', meta: {} },
      cameraVideoPath: '/p/camera.mov',
    });
  });

  it('getKeyboardData loads keyboard data', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockLoadKeyboardData.mockResolvedValue({ events: [] });
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = await ipcHandle['video-editor:getKeyboardData']({
      sender: { id: 1 },
    });
    expect(result).toEqual({ events: [] });
  });

  it('getAudioPaths returns null when no window data', async () => {
    mockGetWindowData.mockReturnValue(undefined);
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = await ipcHandle['video-editor:getAudioPaths']({
      sender: { id: 1 },
    });
    expect(result).toEqual({
      systemAudioPath: null,
      micAudioPath: null,
      hasEmbeddedAudio: false,
    });
  });

  it('getAudioPaths returns paths when files exist', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockExistsSync.mockReturnValue(true);
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = (await ipcHandle['video-editor:getAudioPaths']({
      sender: { id: 1 },
    })) as Record<string, unknown>;
    expect(result.systemAudioPath).toBe('/p/video.mov.system.m4a');
    expect(result.micAudioPath).toBe('/p/video.mov.mic.m4a');
  });

  it('saveCursorData returns error when no window data', async () => {
    mockGetWindowData.mockReturnValue(undefined);
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = await ipcHandle['video-editor:saveCursorData'](
      { sender: { id: 1 } },
      {}
    );
    expect((result as { success: boolean }).success).toBe(false);
  });

  it('saveCursorData rejects invalid data', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockValidateCursorData.mockReturnValue({ valid: false, error: 'bad' });
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = await ipcHandle['video-editor:saveCursorData'](
      { sender: { id: 1 } },
      {}
    );
    expect((result as { success: boolean; error?: string }).error).toBe('bad');
  });

  it('saveCursorData saves valid data', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockValidateCursorData.mockReturnValue({ valid: true });
    mockSaveCursorData.mockResolvedValue(undefined);
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = await ipcHandle['video-editor:saveCursorData'](
      { sender: { id: 1 } },
      {}
    );
    expect((result as { success: boolean }).success).toBe(true);
  });

  it('importCursorData returns error when cancelled', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const { registerDataHandlers } =
      await import('@/main/capture/video/ipc/data-handlers');
    registerDataHandlers();
    const result = await ipcHandle['video-editor:importCursorData']({
      sender: { id: 1 },
    });
    expect((result as { success: boolean }).success).toBe(false);
  });
});

describe('state handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcHandle).forEach(k => delete ipcHandle[k]);
  });

  it('getState returns null when no window data', async () => {
    mockGetWindowData.mockReturnValue(undefined);
    const { registerStateHandlers } =
      await import('@/main/capture/video/ipc/state-handlers');
    registerStateHandlers();
    expect(
      await ipcHandle['video-editor:getState']({ sender: { id: 1 } })
    ).toBeNull();
  });

  it('getState returns null when state file missing', async () => {
    mockGetWindowData.mockReturnValue({
      filePath: '/p/Rec.capty/recording.mov',
    });
    mockExistsSync.mockReturnValue(false);
    const { registerStateHandlers } =
      await import('@/main/capture/video/ipc/state-handlers');
    registerStateHandlers();
    expect(
      await ipcHandle['video-editor:getState']({ sender: { id: 1 } })
    ).toBeNull();
  });

  it('getState returns null when state is invalid', async () => {
    mockGetWindowData.mockReturnValue({
      filePath: '/p/Rec.capty/recording.mov',
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{}');
    const { registerStateHandlers } =
      await import('@/main/capture/video/ipc/state-handlers');
    registerStateHandlers();
    expect(
      await ipcHandle['video-editor:getState']({ sender: { id: 1 } })
    ).toBeNull();
  });

  it('saveState returns false when state is invalid', async () => {
    mockGetWindowData.mockReturnValue({
      filePath: '/p/Rec.capty/recording.mov',
    });
    const { registerStateHandlers } =
      await import('@/main/capture/video/ipc/state-handlers');
    registerStateHandlers();
    const result = await ipcHandle['video-editor:saveState'](
      { sender: { id: 1 } },
      {}
    );
    expect(result).toBe(false);
  });

  it('resetState returns false without window data', async () => {
    mockGetWindowData.mockReturnValue(undefined);
    const { registerStateHandlers } =
      await import('@/main/capture/video/ipc/state-handlers');
    registerStateHandlers();
    expect(
      await ipcHandle['video-editor:resetState']({ sender: { id: 1 } })
    ).toBe(false);
  });

  it('resetState unlinks file and regenerates', async () => {
    mockGetWindowData.mockReturnValue({
      filePath: '/p/Rec.capty/recording.mov',
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ recordingType: 'ios-device' })
    );
    mockGenerateInitialEditorState.mockResolvedValue(true);
    const { registerStateHandlers } =
      await import('@/main/capture/video/ipc/state-handlers');
    registerStateHandlers();
    const result = await ipcHandle['video-editor:resetState']({
      sender: { id: 1 },
    });
    expect(mockUnlinkSync).toHaveBeenCalled();
    expect(mockGenerateInitialEditorState).toHaveBeenCalled();
    expect(result).toBe(true);
  });
});

describe('export handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcHandle).forEach(k => delete ipcHandle[k]);
  });

  it('show-save-dialog returns canceled state', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true });
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    const result = await ipcHandle['video-editor:show-save-dialog'](
      { sender: {} },
      { defaultName: 'My', format: 'mp4' }
    );
    expect((result as { canceled: boolean }).canceled).toBe(true);
  });

  it('show-save-dialog uses gif filter for gif format', async () => {
    mockShowSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/p/x.gif',
    });
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    await ipcHandle['video-editor:show-save-dialog'](
      { sender: {} },
      { defaultName: 'My', format: 'gif' }
    );
    const [, opts] = mockShowSaveDialog.mock.calls[0];
    expect(opts.filters[0].extensions).toEqual(['gif']);
  });

  it('show-save-dialog defaults to the remembered video directory', async () => {
    mockResolveSaveDialogPath.mockReturnValueOnce('/Users/me/Desktop/My.mp4');
    mockShowSaveDialog.mockResolvedValue({ canceled: true });
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    await ipcHandle['video-editor:show-save-dialog'](
      { sender: {} },
      { defaultName: 'My.mp4', format: 'mp4' }
    );
    expect(mockResolveSaveDialogPath).toHaveBeenCalledWith('video', 'My.mp4');
    const [, opts] = mockShowSaveDialog.mock.calls[0];
    expect(opts.defaultPath).toBe('/Users/me/Desktop/My.mp4');
  });

  it('show-save-dialog persists the chosen directory', async () => {
    mockShowSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/Users/me/Desktop/My.mp4',
    });
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    await ipcHandle['video-editor:show-save-dialog'](
      { sender: {} },
      { defaultName: 'My.mp4', format: 'mp4' }
    );
    expect(mockRememberSaveDirectory).toHaveBeenCalledWith(
      'video',
      '/Users/me/Desktop/My.mp4'
    );
  });

  it('show-save-dialog does not persist when canceled', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true });
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    await ipcHandle['video-editor:show-save-dialog'](
      { sender: {} },
      { defaultName: 'My.mp4', format: 'mp4' }
    );
    expect(mockRememberSaveDirectory).not.toHaveBeenCalled();
  });

  it('save-export writes buffer to disk', async () => {
    mockWriteFileAsync.mockResolvedValue(undefined);
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    const result = await ipcHandle['video-editor:save-export'](
      {},
      { buffer: new Uint8Array([1, 2]), outputPath: '/p/out.mp4' }
    );
    expect(result).toEqual({ success: true });
  });

  it('save-export returns error on failure', async () => {
    mockWriteFileAsync.mockRejectedValue(new Error('disk full'));
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    const result = (await ipcHandle['video-editor:save-export'](
      {},
      { buffer: new Uint8Array(), outputPath: '/p/x' }
    )) as { success: boolean; error?: string };
    expect(result.error).toBe('disk full');
  });

  it('show-completion shows notification and reveals in finder', async () => {
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    await ipcHandle['video-export:show-completion'](
      {},
      { durationSeconds: 30, filePath: '/p/x.mp4', openInFinder: true }
    );
    expect(mockNotificationShow).toHaveBeenCalled();
    expect(mockShellShowItemInFolder).toHaveBeenCalledWith('/p/x.mp4');
  });

  it('show-completion formats long durations as minutes', async () => {
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    await ipcHandle['video-export:show-completion'](
      {},
      { durationSeconds: 125 }
    );
    expect(mockNotificationShow).toHaveBeenCalled();
  });

  it('convert-to-gif delegates to ffmpeg', async () => {
    mockConvertMp4ToGif.mockResolvedValue({
      success: true,
      outputPath: '/p/x.gif',
    });
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    const result = await ipcHandle['video-editor:convert-to-gif'](
      {},
      {
        inputPath: '/p/in.mp4',
        outputPath: '/p/out.gif',
        resolution: '720p',
        frameRate: '30',
      }
    );
    expect(result).toEqual({ success: true, outputPath: '/p/x.gif' });
  });

  it('convert-to-gif returns error on failure', async () => {
    mockConvertMp4ToGif.mockResolvedValue({
      success: false,
      message: 'bad input',
    });
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    const result = (await ipcHandle['video-editor:convert-to-gif'](
      {},
      {
        inputPath: '/p/in.mp4',
        outputPath: '/p/out.gif',
        resolution: '720p',
        frameRate: '30',
      }
    )) as { success: boolean; error?: string };
    expect(result.error).toBe('bad input');
  });

  it('convert-to-gif catches thrown errors', async () => {
    mockConvertMp4ToGif.mockRejectedValue(new Error('boom'));
    const { registerExportHandlers } =
      await import('@/main/capture/video/ipc/export-handlers');
    registerExportHandlers();
    const result = (await ipcHandle['video-editor:convert-to-gif'](
      {},
      {
        inputPath: '/p/in.mp4',
        outputPath: '/p/out.gif',
        resolution: '720p',
        frameRate: '30',
      }
    )) as { success: boolean; error?: string };
    expect(result.error).toBe('boom');
  });
});
