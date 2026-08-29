import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockRmSync = vi.fn();
const mockShowMessageBox = vi.fn();
const mockNotificationShow = vi.fn();
const mockGetFocusedWindow = vi.fn();
const mockGetHistoryItemByPath = vi.fn();
const mockDeleteHistoryItem = vi.fn();
const mockGetConfig = vi.fn();
const mockDeleteThumbnail = vi.fn();
const mockDeleteCursorData = vi.fn();
const mockDeleteCameraData = vi.fn();
const mockDeleteKeyboardData = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
    rmSync: (...a: unknown[]) => mockRmSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
  rmSync: (...a: unknown[]) => mockRmSync(...a),
}));

class MockNotification {
  static isSupported = () => true;
  constructor(_a: unknown) {
    void _a;
  }
  show() {
    mockNotificationShow();
  }
}

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: (...a: unknown[]) => mockShowMessageBox(...a),
  },
  Notification: MockNotification,
  BrowserWindow: {
    getFocusedWindow: () => mockGetFocusedWindow(),
  },
}));

vi.mock('@/main/history/index.ts', () => ({
  getHistoryItemByPath: (...a: unknown[]) => mockGetHistoryItemByPath(...a),
  deleteHistoryItem: (...a: unknown[]) => mockDeleteHistoryItem(...a),
}));

vi.mock('@/main/settings', () => ({
  getConfig: () => mockGetConfig(),
}));

vi.mock('@/main/utils/thumbnails.ts', () => ({
  deleteThumbnail: (...a: unknown[]) => mockDeleteThumbnail(...a),
}));

vi.mock('@/main/capture/video/cursor-data.ts', () => ({
  deleteCursorData: (...a: unknown[]) => mockDeleteCursorData(...a),
}));

vi.mock('@/main/capture/video/camera-data.ts', () => ({
  deleteCameraData: (...a: unknown[]) => mockDeleteCameraData(...a),
}));

vi.mock('@/main/capture/video/keyboard-data.ts', () => ({
  deleteKeyboardData: (...a: unknown[]) => mockDeleteKeyboardData(...a),
}));

describe('delete-video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetConfig.mockReturnValue({
      general: { showDeletionNotifications: true },
    });
    mockGetFocusedWindow.mockReturnValue(null);
  });

  describe('confirmVideoDelete', () => {
    it('returns true when user clicks Delete', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 1 });
      const { confirmVideoDelete } =
        await import('@/main/capture/video/delete-video');
      expect(await confirmVideoDelete()).toBe(true);
    });

    it('returns false when user clicks Cancel', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const { confirmVideoDelete } =
        await import('@/main/capture/video/delete-video');
      expect(await confirmVideoDelete()).toBe(false);
    });

    it('uses focused window when one exists', async () => {
      mockGetFocusedWindow.mockReturnValue({ id: 1 });
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const { confirmVideoDelete } =
        await import('@/main/capture/video/delete-video');
      await confirmVideoDelete();
      expect(mockShowMessageBox).toHaveBeenCalledWith(
        { id: 1 },
        expect.any(Object)
      );
    });
  });

  describe('deleteVideo', () => {
    it('returns false when no path provided', async () => {
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      expect(await deleteVideo('')).toBe(false);
    });

    it('delegates to history when item exists', async () => {
      mockGetHistoryItemByPath.mockReturnValue({ id: 'h1' });
      mockDeleteHistoryItem.mockResolvedValue(true);
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      expect(await deleteVideo('/p/video.mov')).toBe(true);
      expect(mockDeleteHistoryItem).toHaveBeenCalledWith('h1');
      expect(mockNotificationShow).toHaveBeenCalled();
    });

    it('skips notification when disabled in config', async () => {
      mockGetConfig.mockReturnValue({
        general: { showDeletionNotifications: false },
      });
      mockGetHistoryItemByPath.mockReturnValue({ id: 'h1' });
      mockDeleteHistoryItem.mockResolvedValue(true);
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      await deleteVideo('/p/video.mov');
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });

    it('deletes project folder when path is inside one', async () => {
      mockGetHistoryItemByPath.mockReturnValue(null);
      mockExistsSync.mockReturnValue(true);
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      const ok = await deleteVideo('/path/My.capty/recording.mov');
      expect(ok).toBe(true);
      expect(mockRmSync).toHaveBeenCalledWith('/path/My.capty', {
        recursive: true,
        force: true,
      });
    });

    it('returns false when project folder is missing', async () => {
      mockGetHistoryItemByPath.mockReturnValue(null);
      mockExistsSync.mockReturnValue(false);
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      expect(await deleteVideo('/path/Missing.capty/recording.mov')).toBe(
        false
      );
    });

    it('falls back to unlinking legacy video file', async () => {
      mockGetHistoryItemByPath.mockReturnValue(null);
      mockExistsSync.mockReturnValueOnce(true).mockReturnValue(false);
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      const result = await deleteVideo('/p/video.mov');
      expect(result).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalledWith('/p/video.mov');
      expect(mockDeleteCursorData).toHaveBeenCalledWith('/p/video.mov');
      expect(mockDeleteCameraData).toHaveBeenCalledWith('/p/video.mov');
      expect(mockDeleteKeyboardData).toHaveBeenCalledWith('/p/video.mov');
    });

    it('returns false when legacy file does not exist', async () => {
      mockGetHistoryItemByPath.mockReturnValue(null);
      mockExistsSync.mockReturnValue(false);
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      expect(await deleteVideo('/p/video.mov')).toBe(false);
    });

    it('shows error dialog on rm failure when enabled', async () => {
      mockGetHistoryItemByPath.mockReturnValue(null);
      mockExistsSync.mockReturnValue(true);
      mockRmSync.mockImplementation(() => {
        throw new Error('locked');
      });
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      expect(await deleteVideo('/path/My.capty/recording.mov')).toBe(false);
      expect(mockShowMessageBox).toHaveBeenCalled();
    });

    it('handles thrown error in history delete', async () => {
      mockGetHistoryItemByPath.mockImplementation(() => {
        throw new Error('history boom');
      });
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      expect(await deleteVideo('/p/video.mov')).toBe(false);
      expect(mockShowMessageBox).toHaveBeenCalled();
    });

    it('omits error dialog when showErrorDialog is false', async () => {
      mockGetHistoryItemByPath.mockImplementation(() => {
        throw new Error('boom');
      });
      const { deleteVideo } = await import('@/main/capture/video/delete-video');
      await deleteVideo('/p/video.mov', { showErrorDialog: false });
      expect(mockShowMessageBox).not.toHaveBeenCalled();
    });
  });
});
