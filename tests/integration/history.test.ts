import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import type { HistoryItem, EditorState } from '@/types/history';

// Mock file system (sync)
const mockFs = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  mkdirSync: mockFs.mkdirSync,
  readFileSync: mockFs.readFileSync,
  writeFileSync: mockFsPromises.writeFile,
  unlinkSync: mockFs.unlinkSync,
}));

// Mock file system (async)
const mockFsPromises = {
  readFile: vi.fn(() => Promise.resolve('[]')),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
  unlink: vi.fn(() => Promise.resolve()),
};

vi.mock('fs/promises', () => ({
  default: mockFsPromises,
  readFile: mockFsPromises.readFile,
  writeFile: mockFsPromises.writeFile,
  mkdir: mockFsPromises.mkdir,
  unlink: mockFsPromises.unlink,
}));

// Mock Electron
const mockDialog = {
  showMessageBox: vi.fn(),
};

const mockIpcMain = {
  handle: vi.fn(),
  on: vi.fn(),
};

const mockApp = {
  getPath: vi.fn((name: string) => {
    const paths: Record<string, string> = {
      home: '/mock/home',
      temp: '/mock/tmp',
    };
    return paths[name] || `/mock/${name}`;
  }),
};

const mockBrowserWindow = {
  fromWebContents: vi.fn(() => null),
};

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  app: mockApp,
  dialog: mockDialog,
  BrowserWindow: mockBrowserWindow,
}));

// Mock utils/paths
vi.mock('@/main/utils/paths', () => ({
  getConfigDir: vi.fn(() => '/mock/home/.config/capty-dev'),
  getHistoryFilePath: vi.fn(() => '/mock/home/.config/capty-dev/history.json'),
}));

// Mock config module
vi.mock('@/main/settings', () => ({
  getConfig: vi.fn(() => ({
    history: {
      enabled: true,
      maxItems: 100,
    },
  })),
}));

// Mock thumbnails utils
vi.mock('@/main/utils/thumbnails', () => ({
  getThumbnail: vi
    .fn()
    .mockResolvedValue({ base64: 'mock-base64', cached: true }),
  deleteThumbnail: vi.fn(),
  clearAllThumbnails: vi.fn(),
}));

describe('History Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default mock behavior - empty history
    mockFs.existsSync.mockReturnValue(false);
    mockFsPromises.readFile.mockResolvedValue('[]');
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('loadHistory', () => {
    it('should return empty array when history file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadHistory } = await import('@/main/history');
      const history = await loadHistory();

      expect(history).toEqual([]);
    });

    it('should load history from file when it exists', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { loadHistory } = await import('@/main/history');
      const history = await loadHistory();

      expect(history).toEqual(mockHistory);
      expect(mockFsPromises.readFile).toHaveBeenCalledWith(
        '/mock/home/.config/capty-dev/history.json',
        'utf-8'
      );
    });

    it('should filter out items with missing files', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/existing/file.png',
          type: 'screenshot',
          editorState: null,
        },
        {
          id: 'test-2',
          timestamp: Date.now(),
          originalPath: '/missing/file.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/mock/home/.config/capty-dev/history.json') return true;
        if (path === '/existing/file.png') return true;
        return false;
      });
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { loadHistory } = await import('@/main/history');
      const history = await loadHistory();

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('test-1');
    });

    it('should add type to legacy items without type field', async () => {
      const legacyHistory = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/mock/home/.config/capty-dev/history.json') return true;
        if (path === '/test/screenshot.png') return true;
        return false;
      });
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(legacyHistory));

      const { loadHistory } = await import('@/main/history');
      const history = await loadHistory();

      expect(history[0].type).toBe('screenshot');
    });

    it('should return empty array on parse error', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue('invalid json');

      const { loadHistory } = await import('@/main/history');
      const history = await loadHistory();

      expect(history).toEqual([]);
    });
  });

  describe('addToHistory', () => {
    it('should add screenshot to history', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const { addToHistory } = await import('@/main/history');
      const item = await addToHistory('/test/screenshot.png', 'screenshot');

      expect(item).toBeDefined();
      expect(item?.type).toBe('screenshot');
      expect(item?.originalPath).toBe('/test/screenshot.png');
      expect(item?.editorState).toBeNull();
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('should add video to history with duration', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const { addToHistory } = await import('@/main/history');
      const item = await addToHistory('/test/video.mov', 'video', 120);

      expect(item).toBeDefined();
      expect(item?.type).toBe('video');
      expect(item?.duration).toBe(120);
    });

    it('should return null when history is disabled', async () => {
      // Need to mock getConfig before importing history module
      vi.doMock('@/main/settings', () => ({
        getConfig: vi.fn(() => ({
          history: { enabled: false, maxItems: 100 },
        })),
      }));

      // Reset modules to get fresh history module that reads new config
      vi.resetModules();

      // Re-mock fs modules after reset
      vi.doMock('fs', () => ({
        default: mockFs,
        existsSync: mockFs.existsSync,
        mkdirSync: mockFs.mkdirSync,
        readFileSync: mockFs.readFileSync,
        writeFileSync: mockFsPromises.writeFile,
        unlinkSync: mockFs.unlinkSync,
      }));
      vi.doMock('fs/promises', () => ({
        default: mockFsPromises,
        readFile: mockFsPromises.readFile,
        writeFile: mockFsPromises.writeFile,
        mkdir: mockFsPromises.mkdir,
        unlink: mockFsPromises.unlink,
      }));
      vi.doMock('@/main/utils/paths', () => ({
        getConfigDir: vi.fn(() => '/mock/home/.config/capty-dev'),
        getHistoryFilePath: vi.fn(
          () => '/mock/home/.config/capty-dev/history.json'
        ),
      }));
      vi.doMock('@/main/utils/thumbnails', () => ({
        getThumbnail: vi
          .fn()
          .mockResolvedValue({ base64: 'mock-base64', cached: true }),
        deleteThumbnail: vi.fn(),
        clearAllThumbnails: vi.fn(),
      }));

      const { addToHistory } = await import('@/main/history');
      mockFs.existsSync.mockReturnValue(true);
      const item = await addToHistory('/test/screenshot.png');

      expect(item).toBeNull();
    });

    it('should create config directory if it does not exist', async () => {
      vi.resetModules();
      mockFs.existsSync.mockImplementation((path: string) => {
        // Return false for config dir but true for file path
        if (path === '/mock/home/.config/capty-dev') return false;
        if (path === '/test/screenshot.png') return true;
        return false;
      });

      const { loadHistory, addToHistory } = await import('@/main/history');
      await loadHistory(); // Need to load first to initialize the module
      await addToHistory('/test/screenshot.png');

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        '/mock/home/.config/capty-dev',
        { recursive: true }
      );
    });

    it('should prune old items when exceeding max items', async () => {
      // Mock config with small max
      vi.doMock('@/main/settings', () => ({
        getConfig: vi.fn(() => ({
          history: { enabled: true, maxItems: 2 },
        })),
      }));
      vi.resetModules();

      // Load existing history with 2 items
      const existingHistory: HistoryItem[] = [
        {
          id: 'old-1',
          timestamp: Date.now() - 2000,
          originalPath: '/old/file1.png',
          type: 'screenshot',
          editorState: null,
        },
        {
          id: 'old-2',
          timestamp: Date.now() - 1000,
          originalPath: '/old/file2.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockImplementation((path: string) => {
        if (path === '/mock/home/.config/capty-dev/history.json') return true;
        if (path.startsWith('/old/')) return true;
        if (path === '/new/file.png') return true;
        return false;
      });
      mockFsPromises.readFile.mockResolvedValue(
        JSON.stringify(existingHistory)
      );

      const { loadHistory, addToHistory } = await import('@/main/history');
      await loadHistory();

      await addToHistory('/new/file.png');

      // Should have deleted one of the old files (the last one in array, which is old-2)
      // History works as a queue - new items added to front, old items removed from end
      expect(mockFs.unlinkSync).toHaveBeenCalled();
      const deletedPath = mockFs.unlinkSync.mock.calls[0][0];
      expect(['/old/file1.png', '/old/file2.png']).toContain(deletedPath);
    });

    it('should generate unique IDs for each item', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const { addToHistory } = await import('@/main/history');
      const item1 = await addToHistory('/test/screenshot1.png');
      const item2 = await addToHistory('/test/screenshot2.png');

      expect(item1?.id).toBeDefined();
      expect(item2?.id).toBeDefined();
      expect(item1?.id).not.toBe(item2?.id);
    });
  });

  describe('updateHistoryItem', () => {
    it('should update editor state for existing item', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { loadHistory, updateHistoryItem } = await import('@/main/history');
      await loadHistory();

      const editorState: EditorState = {
        annotations: [],
        wallpaper: {
          gradient: null,
          backgroundImage: null,
          backgroundBlur: 0,
          padding: 32,
          corners: 12,
          shadow: 24,
          windowFrame: { style: 'none' },
        },
      };

      const updated = await updateHistoryItem('test-1', editorState);

      expect(updated).toBeDefined();
      expect(updated?.editorState).toEqual(editorState);
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('should return null for non-existent item', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadHistory, updateHistoryItem } = await import('@/main/history');
      await loadHistory();

      const editorState: EditorState = {
        annotations: [],
        wallpaper: {
          gradient: null,
          backgroundImage: null,
          backgroundBlur: 0,
          padding: 32,
          corners: 12,
          shadow: 24,
          windowFrame: { style: 'none' },
        },
      };

      const updated = await updateHistoryItem('non-existent', editorState);

      expect(updated).toBeNull();
    });
  });

  describe('updateHistoryItemByPath', () => {
    it('should update item by file path', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { loadHistory, updateHistoryItemByPath } =
        await import('@/main/history');
      await loadHistory();

      const editorState: EditorState = {
        annotations: [],
        wallpaper: {
          gradient: null,
          backgroundImage: null,
          backgroundBlur: 0,
          padding: 32,
          corners: 12,
          shadow: 24,
          windowFrame: { style: 'none' },
        },
      };

      const updated = await updateHistoryItemByPath(
        '/test/screenshot.png',
        editorState
      );

      expect(updated).toBeDefined();
      expect(updated?.editorState).toEqual(editorState);
    });

    it('should return null when path not found', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadHistory, updateHistoryItemByPath } =
        await import('@/main/history');
      await loadHistory();

      const editorState: EditorState = {
        annotations: [],
        wallpaper: {
          gradient: null,
          backgroundImage: null,
          backgroundBlur: 0,
          padding: 32,
          corners: 12,
          shadow: 24,
          windowFrame: { style: 'none' },
        },
      };

      const updated = await updateHistoryItemByPath(
        '/non/existent.png',
        editorState
      );

      expect(updated).toBeNull();
    });
  });

  describe('deleteHistoryItem', () => {
    it('should delete item and its file', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { deleteThumbnail } = await import('@/main/utils/thumbnails');
      const { loadHistory, deleteHistoryItem } = await import('@/main/history');
      await loadHistory();

      const result = await deleteHistoryItem('test-1');

      expect(result).toBe(true);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/test/screenshot.png');
      expect(deleteThumbnail).toHaveBeenCalledWith('/test/screenshot.png');
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('should delete video and mouse data file', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/video.mov',
          type: 'video',
          editorState: null,
          duration: 60,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { loadHistory, deleteHistoryItem } = await import('@/main/history');
      await loadHistory();

      await deleteHistoryItem('test-1');

      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/test/video.mov');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/test/video.mouse.json');
    });

    it('should return false for non-existent item', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadHistory, deleteHistoryItem } = await import('@/main/history');
      await loadHistory();

      const result = await deleteHistoryItem('non-existent');

      expect(result).toBe(false);
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should handle file deletion errors gracefully', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { loadHistory, deleteHistoryItem } = await import('@/main/history');
      await loadHistory();

      // Should not throw - just log and continue
      await expect(deleteHistoryItem('test-1')).resolves.not.toThrow();
    });
  });

  describe('clearHistory', () => {
    it('should delete all items and files', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot1.png',
          type: 'screenshot',
          editorState: null,
        },
        {
          id: 'test-2',
          timestamp: Date.now(),
          originalPath: '/test/screenshot2.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { clearAllThumbnails } = await import('@/main/utils/thumbnails');
      const { loadHistory, clearHistory } = await import('@/main/history');
      await loadHistory();

      await clearHistory();

      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/test/screenshot1.png');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/test/screenshot2.png');
      expect(clearAllThumbnails).toHaveBeenCalled();
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/mock/home/.config/capty-dev/history.json',
        '[]',
        'utf-8'
      );
    });
  });

  describe('getHistory', () => {
    it('should return current history items', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { loadHistory, getHistory } = await import('@/main/history');
      await loadHistory();

      const history = getHistory();

      expect(history).toEqual(mockHistory);
    });
  });

  describe('getHistoryItem', () => {
    it('should return item by ID', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { loadHistory, getHistoryItem } = await import('@/main/history');
      await loadHistory();

      const item = getHistoryItem('test-1');

      expect(item).toEqual(mockHistory[0]);
    });

    it('should return null for non-existent ID', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadHistory, getHistoryItem } = await import('@/main/history');
      await loadHistory();

      const item = getHistoryItem('non-existent');

      expect(item).toBeNull();
    });
  });

  describe('getHistoryItemByPath', () => {
    it('should return item by file path', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { loadHistory, getHistoryItemByPath } =
        await import('@/main/history');
      await loadHistory();

      const item = getHistoryItemByPath('/test/screenshot.png');

      expect(item).toEqual(mockHistory[0]);
    });

    it('should return null for non-existent path', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { loadHistory, getHistoryItemByPath } =
        await import('@/main/history');
      await loadHistory();

      const item = getHistoryItemByPath('/non/existent.png');

      expect(item).toBeNull();
    });
  });

  describe('init', () => {
    let ipcHandlers: Record<string, (...args: unknown[]) => unknown>;

    beforeEach(() => {
      ipcHandlers = {};
      mockIpcMain.handle.mockImplementation(
        (channel: string, handler: (...args: unknown[]) => unknown) => {
          ipcHandlers[channel] = handler;
        }
      );
    });

    it('should register all IPC handlers', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/history');
      init();

      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'history:get',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'history:getItem',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'history:delete',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'history:confirmClear',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'history:clear',
        expect.any(Function)
      );
      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'history:getThumbnail',
        expect.any(Function)
      );
    });

    it('should handle history:get IPC call', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { init, loadHistory } = await import('@/main/history');
      await loadHistory();
      init();

      const handler = ipcHandlers['history:get'];
      const result = handler();

      expect(result).toEqual(mockHistory);
    });

    it('should handle history:getItem IPC call', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { init, loadHistory } = await import('@/main/history');
      await loadHistory();
      init();

      const handler = ipcHandlers['history:getItem'];
      const result = handler({}, 'test-1');

      expect(result).toEqual(mockHistory[0]);
    });

    it('should handle history:delete IPC call', async () => {
      const mockHistory: HistoryItem[] = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          originalPath: '/test/screenshot.png',
          type: 'screenshot',
          editorState: null,
        },
      ];

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const { init, loadHistory } = await import('@/main/history');
      await loadHistory();
      init();

      const handler = ipcHandlers['history:delete'];
      const result = await handler({}, 'test-1');

      expect(result).toBe(true);
    });

    it('should handle history:confirmClear IPC call - user confirms', async () => {
      mockDialog.showMessageBox.mockResolvedValue({ response: 0 }); // 0 = Clear History

      const { init } = await import('@/main/history');
      init();

      const mockEvent = { sender: {} };
      const handler = ipcHandlers['history:confirmClear'];
      const result = await handler(mockEvent);

      expect(result).toBe(true);
      expect(mockDialog.showMessageBox).toHaveBeenCalledWith({
        type: 'warning',
        title: 'Clear History',
        message: 'Are you sure you want to clear all history?',
        detail:
          'This will permanently delete all screenshots and videos from your history. This action cannot be undone.',
        buttons: ['Clear History', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
      });
    });

    it('should handle history:confirmClear IPC call - user cancels', async () => {
      mockDialog.showMessageBox.mockResolvedValue({ response: 1 }); // 1 = Cancel

      const { init } = await import('@/main/history');
      init();

      const mockEvent = { sender: {} };
      const handler = ipcHandlers['history:confirmClear'];
      const result = await handler(mockEvent);

      expect(result).toBe(false);
    });

    it('should handle history:clear IPC call', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const { init } = await import('@/main/history');
      init();

      const handler = ipcHandlers['history:clear'];
      const result = await handler();

      expect(result).toBe(true);
    });

    it('should handle history:getThumbnail IPC call', async () => {
      const { getThumbnail } = await import('@/main/utils/thumbnails');
      vi.mocked(getThumbnail).mockResolvedValue({
        base64: 'mock-thumbnail-base64',
        cached: true,
      });

      const { init } = await import('@/main/history');
      init();

      const handler = ipcHandlers['history:getThumbnail'];
      const result = await handler({}, '/test/screenshot.png', 'screenshot');

      expect(getThumbnail).toHaveBeenCalledWith(
        '/test/screenshot.png',
        'screenshot'
      );
      expect(result).toBe('mock-thumbnail-base64');
    });

    it('uses a V2-only visual asset with package-root thumbnail identity', async () => {
      const project = createEmptyEditorProject({
        id: 'project',
        name: 'V2',
        createdAt: '2026-08-30T00:00:00.000Z',
        sequenceId: 'sequence',
        videoTrackId: 'video-track',
        audioTrackId: 'audio-track',
      });
      project.assets.image = {
        id: 'image',
        kind: 'image',
        name: 'Image',
        locator: { kind: 'managed', relativePath: 'media/image/source.png' },
        importedAt: '2026-08-30T00:00:00.000Z',
        width: 100,
        height: 100,
        orientation: 1,
        defaultStillDurationTicks: 360_000,
      };
      project.sequence.durationTicks = 360_000;
      project.sequence.clips.clip = {
        id: 'clip',
        kind: 'image',
        trackId: 'video-track',
        assetId: 'image',
        name: 'Image',
        timelineStart: 0,
        timelineDuration: 360_000,
        sourceStart: 0,
        sourceDuration: 360_000,
        playbackRate: { numerator: 1, denominator: 1 },
        opacity: 1,
        transform: {
          positionX: 0,
          positionY: 0,
          scaleX: 1,
          scaleY: 1,
          rotationDegrees: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        effects: [],
      };
      const videoTrack = project.sequence.tracks['video-track'];
      if (videoTrack.kind !== 'video') return;
      videoTrack.clipIds.push('clip');
      mockFs.existsSync.mockImplementation(
        filePath => filePath === '/test/V2.capty/media/image/source.png'
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify(project));
      const { getThumbnail } = await import('@/main/utils/thumbnails');
      const { init } = await import('@/main/history');
      init();

      const handler = ipcHandlers['history:getThumbnail'];
      await handler({}, '/test/V2.capty', 'video');

      expect(getThumbnail).toHaveBeenCalledWith(
        '/test/V2.capty/media/image/source.png',
        'screenshot',
        '/test/V2.capty'
      );
    });

    it('should handle history:getThumbnail IPC call - returns null when no thumbnail', async () => {
      const { getThumbnail } = await import('@/main/utils/thumbnails');
      vi.mocked(getThumbnail).mockResolvedValue({
        base64: null,
        cached: false,
      });

      const { init } = await import('@/main/history');
      init();

      const handler = ipcHandlers['history:getThumbnail'];
      const result = await handler({}, '/test/nonexistent.png', 'screenshot');

      expect(result).toBeNull();
    });
  });
});
