import { ipcMain } from 'electron';
import fs from 'fs';
import { getMediaPathForSender } from '../media-sources';
import type { VideoEditorMediaSource } from '@/types/video';

const MAX_FILE_RANGE_SIZE = 64 * 1024 * 1024;

function isVideoEditorMediaSource(
  source: unknown
): source is VideoEditorMediaSource {
  return source === 'video' || source === 'camera';
}

function resolveMediaPath(senderId: number, source: unknown): string | null {
  if (!isVideoEditorMediaSource(source)) return null;
  return getMediaPathForSender(senderId, source);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function registerFileHandlers(): void {
  ipcMain.handle(
    'video-editor:delete-temp-file',
    async (
      _,
      { filePath }: { filePath: string }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'video-editor:media:get-size',
    async (
      event,
      { source }: { source: unknown }
    ): Promise<{ success: boolean; size?: number; error?: string }> => {
      const filePath = resolveMediaPath(event.sender.id, source);
      if (!filePath) {
        return { success: false, error: 'Media source is unavailable' };
      }

      let fileHandle: fs.promises.FileHandle | null = null;
      try {
        fileHandle = await fs.promises.open(filePath, 'r');
        const stats = await fileHandle.stat();
        if (!stats.isFile()) {
          return {
            success: false,
            error: 'Media source is not a regular file',
          };
        }
        return { success: true, size: stats.size };
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      } finally {
        await fileHandle?.close().catch(() => {});
      }
    }
  );

  ipcMain.handle(
    'video-editor:media:read-range',
    async (
      event,
      { source, start, end }: { source: unknown; start: unknown; end: unknown }
    ): Promise<{ success: boolean; bytes?: Uint8Array; error?: string }> => {
      if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end <= start ||
        end - start > MAX_FILE_RANGE_SIZE
      ) {
        return { success: false, error: 'Invalid file range' };
      }

      const filePath = resolveMediaPath(event.sender.id, source);
      if (!filePath) {
        return { success: false, error: 'Media source is unavailable' };
      }

      let fileHandle: fs.promises.FileHandle | null = null;
      try {
        fileHandle = await fs.promises.open(filePath, 'r');
        const stats = await fileHandle.stat();
        if (!stats.isFile() || end > stats.size) {
          return {
            success: false,
            error: 'File range is outside media source',
          };
        }

        const length = end - start;
        const bytes = new Uint8Array(length);
        const { bytesRead } = await fileHandle.read(bytes, 0, length, start);
        if (bytesRead !== length) {
          return {
            success: false,
            error: 'Media source could not be fully read',
          };
        }

        return { success: true, bytes };
      } catch (error) {
        return { success: false, error: getErrorMessage(error) };
      } finally {
        await fileHandle?.close().catch(() => {});
      }
    }
  );

  ipcMain.handle(
    'file:write-buffer',
    async (
      _,
      { path, buffer }: { path: string; buffer: Uint8Array }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await fs.promises.writeFile(path, buffer);
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'file:rename',
    async (
      _,
      { oldPath, newPath }: { oldPath: string; newPath: string }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await fs.promises.rename(oldPath, newPath);
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );
}
