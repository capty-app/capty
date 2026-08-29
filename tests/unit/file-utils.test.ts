import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.stubGlobal('window', {
  ipcRenderer: {
    invoke: mockInvoke,
  },
});

describe('file-utils', () => {
  beforeEach(() => {
    vi.resetModules();
    mockInvoke.mockReset();
  });

  describe('createFileSource', () => {
    it('reads media through IPC without file URL fetches', async () => {
      mockInvoke.mockImplementation(
        (channel: string, payload: { start?: number; end?: number }) => {
          if (channel === 'video-editor:media:get-size') {
            return Promise.resolve({ success: true, size: 6 });
          }

          const length = (payload.end ?? 0) - (payload.start ?? 0);
          return Promise.resolve({
            success: true,
            bytes: new Uint8Array(length).fill(7),
          });
        }
      );

      const { createFileSource } =
        await import('@/renderer/components/video-editor/export/file-utils');
      const source = createFileSource('video');

      expect(await source.getSize()).toBe(6);
      const result = await source._read(1, 3, 0, 6);

      expect(result?.bytes).toEqual(new Uint8Array(6).fill(7));
      expect(mockInvoke).toHaveBeenCalledWith('video-editor:media:get-size', {
        source: 'video',
      });
      expect(mockInvoke).toHaveBeenCalledWith('video-editor:media:read-range', {
        source: 'video',
        start: 0,
        end: 6,
      });
      source._dispose();
    });

    it('surfaces media read failures', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'File missing' });

      const { createFileSource } =
        await import('@/renderer/components/video-editor/export/file-utils');
      const source = createFileSource('video');

      await expect(source.getSize()).rejects.toThrow('File missing');
      source._dispose();
    });
  });

  describe('loadImage', () => {
    it('should resolve with image on successful load', async () => {
      let capturedSrc = '';

      vi.stubGlobal(
        'Image',
        class {
          src = '';
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          constructor() {
            setTimeout(() => {
              capturedSrc = this.src;
              this.onload?.();
            }, 0);
          }
        }
      );

      const { loadImage } =
        await import('@/renderer/components/video-editor/export/file-utils');

      const result = await loadImage('data:image/png;base64,abc');
      expect(result).not.toBeNull();
      expect(capturedSrc).toBe('data:image/png;base64,abc');
    });

    it('should resolve with null on load error', async () => {
      vi.stubGlobal(
        'Image',
        class {
          src = '';
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          constructor() {
            setTimeout(() => {
              this.onerror?.();
            }, 0);
          }
        }
      );

      const { loadImage } =
        await import('@/renderer/components/video-editor/export/file-utils');

      const result = await loadImage('invalid-url');
      expect(result).toBeNull();
    });

    it('should set image src', async () => {
      let capturedSrc = '';

      vi.stubGlobal(
        'Image',
        class {
          private _src = '';
          get src() {
            return this._src;
          }
          set src(value: string) {
            this._src = value;
            capturedSrc = value;
          }
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          constructor() {
            setTimeout(() => {
              this.onload?.();
            }, 0);
          }
        }
      );

      const { loadImage } =
        await import('@/renderer/components/video-editor/export/file-utils');

      const testSrc = 'https://example.com/image.png';
      await loadImage(testSrc);

      expect(capturedSrc).toBe(testSrc);
    });
  });

  describe('writeBuffer', () => {
    it('should invoke file:write-buffer IPC with correct params', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const { writeBuffer } =
        await import('@/renderer/components/video-editor/export/file-utils');

      const buffer = new Uint8Array([1, 2, 3, 4]);
      await writeBuffer('/path/to/output.mp4', buffer);

      expect(mockInvoke).toHaveBeenCalledWith('file:write-buffer', {
        path: '/path/to/output.mp4',
        buffer,
      });
    });

    it('should handle write errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Write failed'));

      const { writeBuffer } =
        await import('@/renderer/components/video-editor/export/file-utils');

      const buffer = new Uint8Array([1, 2, 3]);
      await expect(writeBuffer('/path/to/file.mp4', buffer)).rejects.toThrow(
        'Write failed'
      );
    });
  });
});
