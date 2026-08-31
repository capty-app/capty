import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => unknown;
const ipcOnHandlers: Record<string, Handler> = {};
const ipcHandleHandlers: Record<string, Handler> = {};

const mockIpcOn = vi.fn((event: string, h: Handler) => {
  ipcOnHandlers[event] = h;
});
const mockIpcHandle = vi.fn((event: string, h: Handler) => {
  ipcHandleHandlers[event] = h;
});

const mockGetWindowData = vi.fn();
const mockGetMediaSourceForSender = vi.fn();
const mockShowMessageBox = vi.fn();
const mockGetHistoryPopover = vi.fn();
const mockUpdateHistoryItemPath = vi.fn();
const mockRekeyThumbnail = vi.fn();
const mockUpdateWindowFilePath = vi.fn();
const mockRenameRecordingProject = vi.fn();
const mockConfirmVideoDelete = vi.fn();
const mockDeleteVideo = vi.fn();
const mockExistsSync = vi.fn();
const mockStatSync = vi.fn();
const mockUnlink = vi.fn();
const mockWriteFile = vi.fn();
const mockRename = vi.fn();
const mockStat = vi.fn();
const mockOpen = vi.fn();
const mockProbeVideo = vi.fn();

async function sendCorrelatedRequest(
  channel: string,
  payload: Record<string, unknown>,
  senderId = 1
): Promise<{ responseChannel: string; result: unknown }> {
  const send = vi.fn();
  await ipcOnHandlers[channel](
    {
      sender: { id: senderId, send, isDestroyed: () => false },
    },
    { requestId: 'request-1', ...payload }
  );
  return {
    responseChannel: send.mock.calls[0][0] as string,
    result: (send.mock.calls[0][1] as { result: unknown }).result,
  };
}

vi.mock('electron', () => ({
  ipcMain: {
    on: (event: string, h: Handler) => mockIpcOn(event, h),
    handle: (event: string, h: Handler) => mockIpcHandle(event, h),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  dialog: {
    showMessageBox: (...a: unknown[]) => mockShowMessageBox(...a),
  },
}));

vi.mock('fs', () => ({
  default: {
    constants: { O_RDONLY: 0, O_NOFOLLOW: 1 },
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    statSync: (...a: unknown[]) => mockStatSync(...a),
    promises: {
      unlink: (...a: unknown[]) => mockUnlink(...a),
      writeFile: (...a: unknown[]) => mockWriteFile(...a),
      rename: (...a: unknown[]) => mockRename(...a),
      stat: (...a: unknown[]) => mockStat(...a),
      open: (...a: unknown[]) => mockOpen(...a),
    },
  },
  constants: { O_RDONLY: 0, O_NOFOLLOW: 1 },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  statSync: (...a: unknown[]) => mockStatSync(...a),
  promises: {
    unlink: (...a: unknown[]) => mockUnlink(...a),
    writeFile: (...a: unknown[]) => mockWriteFile(...a),
    rename: (...a: unknown[]) => mockRename(...a),
    stat: (...a: unknown[]) => mockStat(...a),
    open: (...a: unknown[]) => mockOpen(...a),
  },
}));

vi.mock('@/main/capture/video/window-manager', () => ({
  getWindowData: (...a: unknown[]) => mockGetWindowData(...a),
  updateWindowFilePath: (...a: unknown[]) => mockUpdateWindowFilePath(...a),
}));

vi.mock('@/main/capture/video/media-sources', () => ({
  getMediaSourceForSender: (...a: unknown[]) =>
    mockGetMediaSourceForSender(...a),
}));

vi.mock('@/main/capture/video/recording-project', () => ({
  renameRecordingProject: (...a: unknown[]) => mockRenameRecordingProject(...a),
  getProjectFolder: (p: string) =>
    p.endsWith('.capty') || p.includes('.capty/') ? '/Rec.capty' : null,
  getCameraVideoPath: (p: string) => p.replace(/\.[^.]+$/, '.camera.mov'),
}));

vi.mock('@/main/capture/video/delete-video', () => ({
  confirmVideoDelete: (...a: unknown[]) => mockConfirmVideoDelete(...a),
  deleteVideo: (...a: unknown[]) => mockDeleteVideo(...a),
}));

vi.mock('@/main/history', () => ({
  updateHistoryItemPath: (...a: unknown[]) => mockUpdateHistoryItemPath(...a),
}));

vi.mock('@/main/history/popover', () => ({
  getHistoryPopover: () => mockGetHistoryPopover(),
}));

vi.mock('@/main/utils/thumbnails', () => ({
  rekeyThumbnail: (...a: unknown[]) => mockRekeyThumbnail(...a),
}));

vi.mock('@/main/utils/ffmpeg', () => ({
  probeVideo: (...a: unknown[]) => mockProbeVideo(...a),
}));

describe('dialog handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcOnHandlers).forEach(k => delete ipcOnHandlers[k]);
    Object.keys(ipcHandleHandlers).forEach(k => delete ipcHandleHandlers[k]);
  });

  it('registers handlers', async () => {
    const { registerDialogHandlers } =
      await import('@/main/capture/video/ipc/dialog-handlers');
    registerDialogHandlers();
    expect(ipcOnHandlers['video-editor:close-confirmed']).toBeDefined();
    expect(ipcHandleHandlers['video-editor:confirmDelete']).toBeDefined();
    expect(ipcHandleHandlers['video-editor:confirmReset']).toBeDefined();
    expect(ipcOnHandlers['video-editor:delete']).toBeDefined();
  });

  it('close-confirmed closes the window', async () => {
    const close = vi.fn();
    mockGetWindowData.mockReturnValue({
      window: { isDestroyed: () => false, close },
      isClosingConfirmed: false,
    });
    const { registerDialogHandlers } =
      await import('@/main/capture/video/ipc/dialog-handlers');
    registerDialogHandlers();
    ipcOnHandlers['video-editor:close-confirmed']({ sender: { id: 1 } });
    expect(close).toHaveBeenCalled();
  });

  it('confirmDelete delegates to confirmVideoDelete', async () => {
    mockConfirmVideoDelete.mockResolvedValue(true);
    const { registerDialogHandlers } =
      await import('@/main/capture/video/ipc/dialog-handlers');
    registerDialogHandlers();
    expect(await ipcHandleHandlers['video-editor:confirmDelete']()).toBe(true);
  });

  it('confirmReset returns true when user clicks Reset', async () => {
    mockShowMessageBox.mockResolvedValue({ response: 0 });
    const { registerDialogHandlers } =
      await import('@/main/capture/video/ipc/dialog-handlers');
    registerDialogHandlers();
    const result = await ipcHandleHandlers['video-editor:confirmReset']({
      sender: {},
    });
    expect(result).toBe(true);
  });

  it('confirmReset returns false on Cancel', async () => {
    mockShowMessageBox.mockResolvedValue({ response: 1 });
    const { registerDialogHandlers } =
      await import('@/main/capture/video/ipc/dialog-handlers');
    registerDialogHandlers();
    const result = await ipcHandleHandlers['video-editor:confirmReset']({
      sender: {},
    });
    expect(result).toBe(false);
  });

  it('delete closes window then deletes file', async () => {
    const close = vi.fn();
    mockGetWindowData.mockReturnValue({
      window: { isDestroyed: () => false, close },
      filePath: '/p/video.mov',
      isClosingConfirmed: false,
    });
    mockDeleteVideo.mockResolvedValue(true);
    const { registerDialogHandlers } =
      await import('@/main/capture/video/ipc/dialog-handlers');
    registerDialogHandlers();
    await ipcOnHandlers['video-editor:delete']({ sender: { id: 1 } });
    expect(close).toHaveBeenCalled();
    expect(mockDeleteVideo).toHaveBeenCalledWith('/p/video.mov');
  });

  it('delete is a no-op when window data missing', async () => {
    mockGetWindowData.mockReturnValue(undefined);
    const { registerDialogHandlers } =
      await import('@/main/capture/video/ipc/dialog-handlers');
    registerDialogHandlers();
    await ipcOnHandlers['video-editor:delete']({ sender: { id: 1 } });
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });
});

describe('metadata handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcHandleHandlers).forEach(k => delete ipcHandleHandlers[k]);
  });

  it('getVideoFileSize returns stats.size', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 12345 });
    const { registerMetadataHandlers } =
      await import('@/main/capture/video/ipc/metadata-handlers');
    registerMetadataHandlers();
    const result = await ipcHandleHandlers['video-editor:getVideoFileSize']({
      sender: { id: 1 },
    });
    expect(result).toBe(12345);
  });

  it('getVideoFileSize returns null when no data', async () => {
    mockGetWindowData.mockReturnValue(undefined);
    const { registerMetadataHandlers } =
      await import('@/main/capture/video/ipc/metadata-handlers');
    registerMetadataHandlers();
    const result = await ipcHandleHandlers['video-editor:getVideoFileSize']({
      sender: { id: 1 },
    });
    expect(result).toBeNull();
  });

  it('getVideoFileSize returns null on stat error', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockImplementation(() => {
      throw new Error('busy');
    });
    const { registerMetadataHandlers } =
      await import('@/main/capture/video/ipc/metadata-handlers');
    registerMetadataHandlers();
    const result = await ipcHandleHandlers['video-editor:getVideoFileSize']({
      sender: { id: 1 },
    });
    expect(result).toBeNull();
  });

  it('getVideoMetadata calls probeVideo', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    mockExistsSync.mockReturnValue(true);
    mockProbeVideo.mockResolvedValue({
      metadata: { duration: 10, width: 1920, height: 1080 },
    });
    const { registerMetadataHandlers } =
      await import('@/main/capture/video/ipc/metadata-handlers');
    registerMetadataHandlers();
    const result = await ipcHandleHandlers['video-editor:getVideoMetadata']({
      sender: { id: 1 },
    });
    expect(result).toEqual({ duration: 10, width: 1920, height: 1080 });
  });

  it('getVideoMetadata returns null when no data', async () => {
    mockGetWindowData.mockReturnValue(undefined);
    const { registerMetadataHandlers } =
      await import('@/main/capture/video/ipc/metadata-handlers');
    registerMetadataHandlers();
    const result = await ipcHandleHandlers['video-editor:getVideoMetadata']({
      sender: { id: 1 },
    });
    expect(result).toBeNull();
  });
});

describe('file handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetMediaSourceForSender.mockReset();
    Object.keys(ipcOnHandlers).forEach(k => delete ipcOnHandlers[k]);
    Object.keys(ipcHandleHandlers).forEach(k => delete ipcHandleHandlers[k]);
  });

  it('delete-temp-file unlinks existing file', async () => {
    mockExistsSync.mockReturnValue(true);
    mockUnlink.mockResolvedValue(undefined);
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();
    const result = await ipcHandleHandlers['video-editor:delete-temp-file'](
      {},
      { filePath: '/p/temp.mp4' }
    );
    expect(result).toEqual({ success: true });
    expect(mockUnlink).toHaveBeenCalledWith('/p/temp.mp4');
  });

  it('delete-temp-file skips missing file', async () => {
    mockExistsSync.mockReturnValue(false);
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();
    const result = await ipcHandleHandlers['video-editor:delete-temp-file'](
      {},
      { filePath: '/p/missing' }
    );
    expect(result).toEqual({ success: true });
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('delete-temp-file returns error on failure', async () => {
    mockExistsSync.mockReturnValue(true);
    mockUnlink.mockRejectedValue(new Error('locked'));
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();
    const result = (await ipcHandleHandlers['video-editor:delete-temp-file'](
      {},
      { filePath: '/p/temp.mp4' }
    )) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toBe('locked');
  });

  it('returns the registered editor video size', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    mockGetMediaSourceForSender.mockReturnValue({
      path: '/p/my #video.mp4',
      identity: { device: 1, inode: 2 },
    });
    mockOpen.mockResolvedValue({
      stat: vi.fn().mockResolvedValue({
        isFile: () => true,
        size: 4096,
        dev: 1,
        ino: 2,
      }),
      close,
    });
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();

    const response = await sendCorrelatedRequest(
      'video-editor:media:get-size',
      { source: 'video' }
    );

    expect(response).toEqual({
      responseChannel: 'video-editor:media:get-size:response',
      result: { success: true, size: 4096 },
    });
    expect(mockOpen).toHaveBeenCalledWith('/p/my #video.mp4', 1);
    expect(close).toHaveBeenCalledOnce();
  });

  it('reads only the requested bytes from the registered video', async () => {
    mockGetMediaSourceForSender.mockReturnValue({
      path: '/p/video.mp4',
      identity: { device: 1, inode: 2 },
    });
    const read = vi.fn(
      async (bytes: Uint8Array, offset: number, length: number) => {
        bytes.set([4, 5, 6], offset);
        return { bytesRead: length };
      }
    );
    const close = vi.fn().mockResolvedValue(undefined);
    mockOpen.mockResolvedValue({
      stat: vi.fn().mockResolvedValue({
        isFile: () => true,
        size: 10,
        dev: 1,
        ino: 2,
      }),
      read,
      close,
    });
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();

    const response = await sendCorrelatedRequest(
      'video-editor:media:read-range',
      { source: 'video', start: 2, end: 5 }
    );
    const result = response.result as {
      success: boolean;
      bytes: Uint8Array;
    };

    expect(result.success).toBe(true);
    expect(result.bytes).toEqual(new Uint8Array([4, 5, 6]));
    expect(read).toHaveBeenCalledWith(expect.any(Uint8Array), 0, 3, 2);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects replaced media sources', async () => {
    mockGetMediaSourceForSender.mockReturnValue({
      path: '/p/video.mp4',
      identity: { device: 1, inode: 2 },
    });
    mockOpen.mockResolvedValue({
      stat: vi.fn().mockResolvedValue({
        isFile: () => true,
        size: 10,
        dev: 1,
        ino: 3,
      }),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();

    const response = await sendCorrelatedRequest(
      'video-editor:media:read-range',
      { source: 'video', start: 0, end: 5 }
    );

    expect(response.result).toEqual({
      success: false,
      error: 'Media source changed after authorization',
    });
  });

  it('rejects unsafe media ranges before opening a file', async () => {
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();

    const response = await sendCorrelatedRequest(
      'video-editor:media:read-range',
      { source: 'video', start: -1, end: 5 }
    );

    expect(response.result).toEqual({
      success: false,
      error: 'Invalid file range',
    });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('rejects unavailable camera media sources', async () => {
    mockGetMediaSourceForSender.mockReturnValue(null);
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();

    const response = await sendCorrelatedRequest(
      'video-editor:media:get-size',
      { source: 'camera' }
    );

    expect(response.result).toEqual({
      success: false,
      error: 'Media source is unavailable',
    });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('rejects media reads from unregistered senders and unknown sources', async () => {
    mockGetMediaSourceForSender.mockReturnValue(null);
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();

    const unregistered = await sendCorrelatedRequest(
      'video-editor:media:get-size',
      { source: 'video' },
      9
    );
    const unknownSource = await sendCorrelatedRequest(
      'video-editor:media:get-size',
      { source: '/private/file' }
    );

    expect(unregistered.result).toEqual({
      success: false,
      error: 'Media source is unavailable',
    });
    expect(unknownSource.result).toEqual({
      success: false,
      error: 'Media source is unavailable',
    });
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('file:write-buffer writes buffer', async () => {
    mockWriteFile.mockResolvedValue(undefined);
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();
    const buf = new Uint8Array([1, 2, 3]);
    const result = await ipcHandleHandlers['file:write-buffer'](
      {},
      { path: '/p/out.bin', buffer: buf }
    );
    expect(result).toEqual({ success: true });
    expect(mockWriteFile).toHaveBeenCalledWith('/p/out.bin', buf);
  });

  it('file:write-buffer returns error', async () => {
    mockWriteFile.mockRejectedValue(new Error('disk full'));
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();
    const result = (await ipcHandleHandlers['file:write-buffer'](
      {},
      { path: '/p/x', buffer: new Uint8Array() }
    )) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toBe('disk full');
  });

  it('file:rename renames file', async () => {
    mockRename.mockResolvedValue(undefined);
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();
    const result = await ipcHandleHandlers['file:rename'](
      {},
      { oldPath: '/a', newPath: '/b' }
    );
    expect(result).toEqual({ success: true });
    expect(mockRename).toHaveBeenCalledWith('/a', '/b');
  });

  it('file:rename returns error', async () => {
    mockRename.mockRejectedValue(new Error('eexists'));
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    registerFileHandlers();
    const result = (await ipcHandleHandlers['file:rename'](
      {},
      { oldPath: '/a', newPath: '/b' }
    )) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toBe('eexists');
  });
});

describe('project handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcHandleHandlers).forEach(k => delete ipcHandleHandlers[k]);
  });

  it('rename returns "No active project" without window data', async () => {
    mockGetWindowData.mockReturnValue(undefined);
    const { registerProjectHandlers } =
      await import('@/main/capture/video/ipc/project-handlers');
    registerProjectHandlers();
    const result = (await ipcHandleHandlers['project:rename'](
      { sender: { id: 1 } },
      'NewName'
    )) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toBe('No active project');
  });

  it('rename returns "Not a recording project" for non-project files', async () => {
    mockGetWindowData.mockReturnValue({ filePath: '/p/video.mov' });
    const { registerProjectHandlers } =
      await import('@/main/capture/video/ipc/project-handlers');
    registerProjectHandlers();
    const result = (await ipcHandleHandlers['project:rename'](
      { sender: { id: 1 } },
      'NewName'
    )) as { success: boolean; error?: string };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not a recording project');
  });

  it('rename success syncs history, thumbnail, window path', async () => {
    mockGetWindowData.mockReturnValue({
      filePath: '/Rec.capty/recording.mov',
    });
    mockRenameRecordingProject.mockReturnValue({
      success: true,
      newProjectPath: '/Renamed.capty',
      newVideoPath: '/Renamed.capty/recording.mov',
    });
    mockGetHistoryPopover.mockReturnValue({
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    });
    const { registerProjectHandlers } =
      await import('@/main/capture/video/ipc/project-handlers');
    registerProjectHandlers();
    const result = await ipcHandleHandlers['project:rename'](
      { sender: { id: 1 } },
      'Renamed'
    );
    expect(mockUpdateHistoryItemPath).toHaveBeenCalledWith(
      '/Rec.capty/recording.mov',
      '/Renamed.capty/recording.mov'
    );
    expect(mockRekeyThumbnail).toHaveBeenCalled();
    expect(mockUpdateWindowFilePath).toHaveBeenCalled();
    expect((result as { success: boolean }).success).toBe(true);
  });

  it('rename success without popover does not throw', async () => {
    mockGetWindowData.mockReturnValue({
      filePath: '/Rec.capty/recording.mov',
    });
    mockRenameRecordingProject.mockReturnValue({
      success: true,
      newProjectPath: '/Renamed.capty',
      newVideoPath: '/Renamed.capty/recording.mov',
    });
    mockGetHistoryPopover.mockReturnValue(null);
    const { registerProjectHandlers } =
      await import('@/main/capture/video/ipc/project-handlers');
    registerProjectHandlers();
    const result = await ipcHandleHandlers['project:rename'](
      { sender: { id: 1 } },
      'Renamed'
    );
    expect((result as { success: boolean }).success).toBe(true);
  });

  it('rename failure is returned through', async () => {
    mockGetWindowData.mockReturnValue({
      filePath: '/Rec.capty/recording.mov',
    });
    mockRenameRecordingProject.mockReturnValue({
      success: false,
      newProjectPath: '/Rec.capty',
      newVideoPath: '/Rec.capty/recording.mov',
      error: 'busy',
    });
    const { registerProjectHandlers } =
      await import('@/main/capture/video/ipc/project-handlers');
    registerProjectHandlers();
    const result = (await ipcHandleHandlers['project:rename'](
      { sender: { id: 1 } },
      'Renamed'
    )) as { success: boolean };
    expect(result.success).toBe(false);
    expect(mockUpdateHistoryItemPath).not.toHaveBeenCalled();
  });
});
