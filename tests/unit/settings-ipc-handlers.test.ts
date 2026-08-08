import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => unknown;
const ipcHandle: Record<string, Handler> = {};

const mockIpcHandle = vi.fn((e: string, h: Handler) => {
  ipcHandle[e] = h;
});

const mockShowOpenDialog = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockStatSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockDaemonCall = vi.fn();

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '1.0.0',
    getPath: (name: string) => {
      const paths: Record<string, string> = {
        home: '/home',
        pictures: '/home/Pictures',
        videos: '/home/Movies',
        userData: '/home/.config/capty',
      };
      return paths[name] || '/tmp';
    },
  },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: vi.fn(),
  },
  dialog: {
    showOpenDialog: (...a: unknown[]) => mockShowOpenDialog(...a),
  },
  ipcMain: {
    on: vi.fn(),
    handle: (e: string, h: Handler) => mockIpcHandle(e, h),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
    statSync: (...a: unknown[]) => mockStatSync(...a),
    unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
  writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  statSync: (...a: unknown[]) => mockStatSync(...a),
  unlinkSync: (...a: unknown[]) => mockUnlinkSync(...a),
}));

vi.mock('@/main/daemon', () => ({
  daemon: { call: (...a: unknown[]) => mockDaemonCall(...a) },
}));

vi.mock('@/main/system/permissions', () => ({
  init: vi.fn(),
}));

describe('settings IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(ipcHandle).forEach(k => delete ipcHandle[k]);
    mockReadFileSync.mockReturnValue(Buffer.from('image-bytes'));
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isDirectory: () => true });
  });

  async function loadAndInit() {
    const m = await import('@/main/settings');
    m.init();
    return m;
  }

  describe('settings:get / update / reset', () => {
    it('returns current config', async () => {
      await loadAndInit();
      const result = ipcHandle['settings:get']();
      expect(result).toBeDefined();
    });

    it('updates config', async () => {
      await loadAndInit();
      const result = ipcHandle['settings:update'](
        {},
        { screenshot: { format: 'jpeg' } }
      );
      expect(
        (result as { screenshot: { format: string } }).screenshot.format
      ).toBe('jpeg');
    });

    it('resets to defaults', async () => {
      await loadAndInit();
      const result = ipcHandle['settings:reset']();
      expect(result).toBeDefined();
    });

    it('notifies the preview listener on reset', async () => {
      const m = await loadAndInit();
      const listener = vi.fn();
      m.setPreviewConfigListener(listener);

      const result = ipcHandle['settings:reset']();

      expect(listener).toHaveBeenCalledWith(result);
    });
  });

  describe('app:getVersion', () => {
    it('returns app version', async () => {
      await loadAndInit();
      const result = ipcHandle['app:getVersion']();
      expect(typeof result).toBe('string');
    });
  });

  describe('editor preferences', () => {
    it('getPreferences returns editor settings', async () => {
      await loadAndInit();
      const result = ipcHandle['editor:getPreferences']();
      expect(result).toBeDefined();
    });

    it('updatePreferences merges editor settings', async () => {
      await loadAndInit();
      const result = ipcHandle['editor:updatePreferences'](
        {},
        { showCursor: false }
      );
      expect(result).toBeDefined();
    });
  });

  describe('wallpaper handlers', () => {
    it('getSettings returns wallpaper config', async () => {
      await loadAndInit();
      const result = ipcHandle['wallpaper:getSettings']();
      expect(result).toBeDefined();
    });

    it('addBackground appends background', async () => {
      await loadAndInit();
      const bg = { id: 'bg1', type: 'color' as const, data: { color: '#fff' } };
      const result = ipcHandle['wallpaper:addBackground']({}, bg) as unknown[];
      expect(result.length).toBeGreaterThan(0);
    });

    it('updateBackground replaces matching id', async () => {
      await loadAndInit();
      const bg = { id: 'bg1', type: 'color' as const, data: { color: '#fff' } };
      ipcHandle['wallpaper:addBackground']({}, bg);
      const updated = {
        id: 'bg1',
        type: 'color' as const,
        data: { color: '#000' },
      };
      const result = ipcHandle['wallpaper:updateBackground'](
        {},
        updated
      ) as Array<{
        id: string;
        data: { color: string };
      }>;
      expect(result.find(b => b.id === 'bg1')?.data.color).toBe('#000');
    });

    it('updateBackground ignores unknown ids', async () => {
      await loadAndInit();
      const bg = {
        id: 'nope',
        type: 'color' as const,
        data: { color: '#000' },
      };
      const result = ipcHandle['wallpaper:updateBackground'](
        {},
        bg
      ) as unknown[];
      expect(result).toBeDefined();
    });

    it('deleteBackground removes by id', async () => {
      await loadAndInit();
      const bg = { id: 'bg2', type: 'color' as const, data: { color: '#fff' } };
      ipcHandle['wallpaper:addBackground']({}, bg);
      const result = ipcHandle['wallpaper:deleteBackground'](
        {},
        'bg2'
      ) as Array<{
        id: string;
      }>;
      expect(result.find(b => b.id === 'bg2')).toBeUndefined();
    });

    it('addPreset appends preset', async () => {
      await loadAndInit();
      const preset = { id: 'p1', name: 'My', backgroundId: 'bg1' };
      const result = ipcHandle['wallpaper:addPreset']({}, preset) as unknown[];
      expect(result.length).toBeGreaterThan(0);
    });

    it('updatePreset modifies matching preset', async () => {
      await loadAndInit();
      const preset = { id: 'p2', name: 'A', backgroundId: 'bg1' };
      ipcHandle['wallpaper:addPreset']({}, preset);
      const updated = { id: 'p2', name: 'B', backgroundId: 'bg1' };
      const result = ipcHandle['wallpaper:updatePreset']({}, updated) as Array<{
        id: string;
        name: string;
      }>;
      expect(result.find(p => p.id === 'p2')?.name).toBe('B');
    });

    it('updatePreset ignores unknown ids', async () => {
      await loadAndInit();
      const result = ipcHandle['wallpaper:updatePreset'](
        {},
        { id: 'missing', name: 'X', backgroundId: 'bg' }
      );
      expect(result).toBeDefined();
    });

    it('deletePreset removes by id', async () => {
      await loadAndInit();
      const preset = { id: 'p3', name: 'A', backgroundId: 'bg1' };
      ipcHandle['wallpaper:addPreset']({}, preset);
      const result = ipcHandle['wallpaper:deletePreset']({}, 'p3') as Array<{
        id: string;
      }>;
      expect(result.find(p => p.id === 'p3')).toBeUndefined();
    });

    it('selectImage returns null on cancel', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      await loadAndInit();
      const result = await ipcHandle['wallpaper:selectImage']();
      expect(result).toBeNull();
    });

    it('selectImage returns data URL on success', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/p/img.png'],
      });
      await loadAndInit();
      const result = (await ipcHandle['wallpaper:selectImage']()) as string;
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('selectImage handles SVG/JPEG/WebP MIME types', async () => {
      for (const ext of ['.svg', '.jpg', '.webp']) {
        mockShowOpenDialog.mockResolvedValue({
          canceled: false,
          filePaths: [`/p/img${ext}`],
        });
        await loadAndInit();
        const result = (await ipcHandle['wallpaper:selectImage']()) as string;
        expect(result).toMatch(/^data:image\//);
      }
    });

    it('selectImage returns null on error', async () => {
      mockShowOpenDialog.mockRejectedValue(new Error('boom'));
      await loadAndInit();
      const result = await ipcHandle['wallpaper:selectImage']();
      expect(result).toBeNull();
    });

    it('getDesktopWallpaper returns null when daemon returns null', async () => {
      mockDaemonCall.mockResolvedValue(null);
      await loadAndInit();
      const result = await ipcHandle['wallpaper:getDesktopWallpaper']();
      expect(result).toBeNull();
    });

    it('getDesktopWallpaper passes through data type', async () => {
      mockDaemonCall.mockResolvedValue({
        type: 'data',
        value: 'data:image/png;base64,abc',
      });
      await loadAndInit();
      const result = await ipcHandle['wallpaper:getDesktopWallpaper']();
      expect(result).toBe('data:image/png;base64,abc');
    });

    it('getDesktopWallpaper reads file path and returns data URL', async () => {
      mockDaemonCall.mockResolvedValue({
        type: 'path',
        value: '/p/wallpaper.heic',
      });
      mockExistsSync.mockReturnValue(true);
      await loadAndInit();
      const result = (await ipcHandle[
        'wallpaper:getDesktopWallpaper'
      ]()) as string;
      expect(result).toMatch(/^data:image\/heic;base64,/);
    });

    it('getDesktopWallpaper returns null when path file missing', async () => {
      mockDaemonCall.mockResolvedValue({
        type: 'path',
        value: '/p/missing.png',
      });
      mockExistsSync.mockReturnValue(false);
      await loadAndInit();
      const result = await ipcHandle['wallpaper:getDesktopWallpaper']();
      expect(result).toBeNull();
    });

    it('getDesktopWallpaper returns null on daemon error', async () => {
      mockDaemonCall.mockRejectedValue(new Error('boom'));
      await loadAndInit();
      const result = await ipcHandle['wallpaper:getDesktopWallpaper']();
      expect(result).toBeNull();
    });
  });

  describe('storage handlers', () => {
    it('selectPath returns null on cancel', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      await loadAndInit();
      const result = await ipcHandle['storage:selectPath']({}, 'screenshots');
      expect(result).toBeNull();
    });

    it('selectPath returns path on success', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/custom/screenshots'],
      });
      await loadAndInit();
      const result = (await ipcHandle['storage:selectPath'](
        {},
        'recordings'
      )) as { path?: string; error?: string } | null;
      expect(result?.path).toBe('/custom/screenshots');
    });

    it('selectPath returns error when not a directory', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/p'],
      });
      mockStatSync.mockReturnValue({ isDirectory: () => false });
      await loadAndInit();
      const result = (await ipcHandle['storage:selectPath'](
        {},
        'screenshots'
      )) as {
        error?: string;
      };
      expect(result.error).toBeDefined();
    });

    it('validatePattern delegates to filename generator', async () => {
      await loadAndInit();
      const result = ipcHandle['storage:validatePattern']({}, 'Pattern');
      expect(result).toBeDefined();
    });

    it('previewFilename generates filename', async () => {
      await loadAndInit();
      const result = ipcHandle['storage:previewFilename'](
        {},
        '{date}',
        'Screenshot'
      );
      expect(typeof result).toBe('string');
    });

    it('getTokens returns available tokens', async () => {
      await loadAndInit();
      const result = ipcHandle['storage:getTokens']() as unknown[];
      expect(Array.isArray(result)).toBe(true);
    });

    it('getDefaultPaths returns default paths', async () => {
      await loadAndInit();
      const result = ipcHandle['storage:getDefaultPaths']() as {
        screenshots: string;
        recordings: string;
      };
      expect(result.screenshots).toContain('Capty');
      expect(result.recordings).toContain('Capty');
    });
  });

  describe('cursor:selectImage', () => {
    it('returns null on cancel', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      await loadAndInit();
      const result = await ipcHandle['cursor:selectImage']();
      expect(result).toBeNull();
    });

    it('returns data URL on success', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/p/cursor.gif'],
      });
      await loadAndInit();
      const result = (await ipcHandle['cursor:selectImage']()) as string;
      expect(result).toMatch(/^data:image\/gif;base64,/);
    });

    it('returns null on error', async () => {
      mockShowOpenDialog.mockRejectedValue(new Error('boom'));
      await loadAndInit();
      const result = await ipcHandle['cursor:selectImage']();
      expect(result).toBeNull();
    });
  });
});
