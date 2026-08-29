import { CustomSource } from 'mediabunny';
import type { VideoEditorMediaSource } from '@/types/video';

interface FileSizeResult {
  success: boolean;
  size?: number;
  error?: string;
}

interface FileRangeResult {
  success: boolean;
  bytes?: Uint8Array;
  error?: string;
}

export function createFileSource(source: VideoEditorMediaSource): CustomSource {
  return new CustomSource({
    getSize: async () => {
      const result = (await window.ipcRenderer.invoke(
        'video-editor:media:get-size',
        { source }
      )) as FileSizeResult;

      if (!result.success || result.size === undefined) {
        throw new Error(result.error ?? 'Failed to read media file size');
      }

      return result.size;
    },
    read: async (start, end) => {
      const result = (await window.ipcRenderer.invoke(
        'video-editor:media:read-range',
        {
          source,
          start,
          end,
        }
      )) as FileRangeResult;

      if (!result.success || !result.bytes) {
        throw new Error(result.error ?? 'Failed to read media file');
      }

      const bytes = new Uint8Array(result.bytes);
      if (bytes.byteLength !== end - start) {
        throw new Error('Media file changed while it was being read');
      }

      return bytes;
    },
    maxCacheSize: 8 * 1024 * 1024,
    prefetchProfile: 'fileSystem',
  });
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function writeBuffer(
  path: string,
  buffer: Uint8Array
): Promise<void> {
  await window.ipcRenderer.invoke('file:write-buffer', { path, buffer });
}
