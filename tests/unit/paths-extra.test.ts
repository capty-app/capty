import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockStatSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
    statSync: (...a: unknown[]) => mockStatSync(...a),
  },
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  statSync: (...a: unknown[]) => mockStatSync(...a),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/home',
    getAppPath: () => '/app',
  },
}));

describe('paths extra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('ensureDirectoryExists', () => {
    it('creates directory when missing', async () => {
      mockExistsSync.mockReturnValue(false);
      const { ensureDirectoryExists } = await import('@/main/utils/paths');
      expect(ensureDirectoryExists('/p/new')).toBe('/p/new');
      expect(mockMkdirSync).toHaveBeenCalledWith('/p/new', { recursive: true });
    });

    it('returns existing directory', async () => {
      mockExistsSync.mockReturnValue(true);
      const { ensureDirectoryExists } = await import('@/main/utils/paths');
      ensureDirectoryExists('/p/existing');
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getPublicAssetPath', () => {
    it('returns dev path when it exists', async () => {
      mockExistsSync.mockImplementation((p: string) =>
        String(p).includes('/public/')
      );
      const { getPublicAssetPath } = await import('@/main/utils/paths');
      expect(getPublicAssetPath('icons/a.png')).toBe('/app/public/icons/a.png');
    });

    it('returns prod path when dev path missing', async () => {
      const originalResourcesPath = process.resourcesPath;
      process.resourcesPath = '/resources';
      mockExistsSync.mockImplementation((p: string) =>
        String(p).startsWith('/resources/')
      );
      const { getPublicAssetPath } = await import('@/main/utils/paths');
      expect(getPublicAssetPath('icons/a.png')).toBe('/resources/icons/a.png');
      process.resourcesPath = originalResourcesPath;
    });

    it('falls back to dev path when neither exists', async () => {
      mockExistsSync.mockReturnValue(false);
      const { getPublicAssetPath } = await import('@/main/utils/paths');
      expect(getPublicAssetPath('icons/a.png')).toBe('/app/public/icons/a.png');
    });
  });

  describe('getLicenseNoticesPath', () => {
    it('returns the repository notice path when it exists', async () => {
      mockExistsSync.mockImplementation((filePath: string) =>
        String(filePath).startsWith('/app/resources/licenses/')
      );
      const { getLicenseNoticesPath } = await import('@/main/utils/paths');

      expect(getLicenseNoticesPath()).toBe(
        '/app/resources/licenses/THIRD_PARTY_NOTICES.txt'
      );
    });

    it('returns the packaged notice path outside development', async () => {
      const originalResourcesPath = process.resourcesPath;
      process.resourcesPath = '/resources';
      mockExistsSync.mockReturnValue(false);
      const { getLicenseNoticesPath } = await import('@/main/utils/paths');

      expect(getLicenseNoticesPath()).toBe(
        '/resources/licenses/THIRD_PARTY_NOTICES.txt'
      );
      process.resourcesPath = originalResourcesPath;
    });
  });

  describe('isValidDirectory', () => {
    it('returns true when path is a directory', async () => {
      mockStatSync.mockReturnValue({ isDirectory: () => true });
      const { isValidDirectory } = await import('@/main/utils/paths');
      expect(isValidDirectory('/p/dir')).toBe(true);
    });

    it('returns false when path exists but is not a directory', async () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false });
      const { isValidDirectory } = await import('@/main/utils/paths');
      expect(isValidDirectory('/p/file.txt')).toBe(false);
    });

    it('uses parent when path stat throws', async () => {
      let call = 0;
      mockStatSync.mockImplementation(() => {
        call++;
        if (call === 1) throw new Error('ENOENT');
        return { isDirectory: () => true };
      });
      const { isValidDirectory } = await import('@/main/utils/paths');
      expect(isValidDirectory('/p/nope')).toBe(true);
    });

    it('returns false when parent also fails', async () => {
      mockStatSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const { isValidDirectory } = await import('@/main/utils/paths');
      expect(isValidDirectory('/p/nope')).toBe(false);
    });
  });
});
