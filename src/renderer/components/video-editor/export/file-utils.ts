import { CustomSource } from 'mediabunny';
import type { VideoEditorMediaSource } from '@/types/video';
import { CORRELATED_IPC_CHANNELS } from '@/types/ipc';
import { sendCorrelatedIpcRequest } from '@/renderer/utils/ipc-request';

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
      const result = await sendCorrelatedIpcRequest<
        { source: VideoEditorMediaSource },
        FileSizeResult
      >({
        requestChannel: CORRELATED_IPC_CHANNELS.mediaGetSize.request,
        responseChannel: CORRELATED_IPC_CHANNELS.mediaGetSize.response,
        payload: { source },
      });

      if (!result.success || result.size === undefined) {
        throw new Error(result.error ?? 'Failed to read media file size');
      }

      return result.size;
    },
    read: async (start, end) => {
      const result = await sendCorrelatedIpcRequest<
        { source: VideoEditorMediaSource; start: number; end: number },
        FileRangeResult
      >({
        requestChannel: CORRELATED_IPC_CHANNELS.mediaReadRange.request,
        responseChannel: CORRELATED_IPC_CHANNELS.mediaReadRange.response,
        payload: { source, start, end },
      });

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
