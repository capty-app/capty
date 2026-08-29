import { ipcMain } from 'electron';
import fs from 'fs';
import type { IpcMainEvent } from 'electron';
import type { CorrelatedIpcResponse } from '@/types/ipc';
import {
  CORRELATED_IPC_CHANNELS,
  isValidCorrelatedIpcRequestId,
} from '@/types/ipc';
import type { VideoEditorMediaSource } from '@/types/video';
import {
  getMediaSourceForSender,
  type AuthorizedMediaSource,
} from '../media-sources';

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

const MAX_FILE_RANGE_SIZE = 64 * 1024 * 1024;

function isVideoEditorMediaSource(
  source: unknown
): source is VideoEditorMediaSource {
  return source === 'video' || source === 'camera';
}

function resolveMediaSource(
  senderId: number,
  source: unknown
): AuthorizedMediaSource | null {
  if (!isVideoEditorMediaSource(source)) return null;
  return getMediaSourceForSender(senderId, source);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function isAuthorizedSource(
  source: AuthorizedMediaSource,
  stats: fs.Stats
): boolean {
  return (
    stats.isFile() &&
    stats.dev === source.identity.device &&
    stats.ino === source.identity.inode
  );
}

function sendCorrelatedResponse<TResult>(
  event: IpcMainEvent,
  channel: string,
  requestId: string,
  result: TResult
): void {
  if (event.sender.isDestroyed()) return;
  const response: CorrelatedIpcResponse<TResult> = { requestId, result };
  event.sender.send(channel, response);
}

async function getMediaSize(
  senderId: number,
  sourceValue: unknown
): Promise<FileSizeResult> {
  const source = resolveMediaSource(senderId, sourceValue);
  if (!source) {
    return { success: false, error: 'Media source is unavailable' };
  }

  let fileHandle: fs.promises.FileHandle | null = null;
  try {
    fileHandle = await fs.promises.open(
      source.path,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
    );
    const stats = await fileHandle.stat();
    if (!isAuthorizedSource(source, stats)) {
      return {
        success: false,
        error: 'Media source changed after authorization',
      };
    }
    return { success: true, size: stats.size };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  } finally {
    await fileHandle?.close().catch(() => {});
  }
}

async function readMediaRange(
  senderId: number,
  sourceValue: unknown,
  start: unknown,
  end: unknown
): Promise<FileRangeResult> {
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

  const source = resolveMediaSource(senderId, sourceValue);
  if (!source) {
    return { success: false, error: 'Media source is unavailable' };
  }

  let fileHandle: fs.promises.FileHandle | null = null;
  try {
    fileHandle = await fs.promises.open(
      source.path,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
    );
    const stats = await fileHandle.stat();
    if (!isAuthorizedSource(source, stats)) {
      return {
        success: false,
        error: 'Media source changed after authorization',
      };
    }
    if (end > stats.size) {
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

  ipcMain.on(
    CORRELATED_IPC_CHANNELS.mediaGetSize.request,
    async (event, payload: { requestId?: unknown; source?: unknown } = {}) => {
      if (!isValidCorrelatedIpcRequestId(payload.requestId)) return;
      const result = await getMediaSize(event.sender.id, payload.source);
      sendCorrelatedResponse(
        event,
        CORRELATED_IPC_CHANNELS.mediaGetSize.response,
        payload.requestId,
        result
      );
    }
  );

  ipcMain.on(
    CORRELATED_IPC_CHANNELS.mediaReadRange.request,
    async (
      event,
      payload: {
        requestId?: unknown;
        source?: unknown;
        start?: unknown;
        end?: unknown;
      } = {}
    ) => {
      if (!isValidCorrelatedIpcRequestId(payload.requestId)) return;
      const result = await readMediaRange(
        event.sender.id,
        payload.source,
        payload.start,
        payload.end
      );
      sendCorrelatedResponse(
        event,
        CORRELATED_IPC_CHANNELS.mediaReadRange.response,
        payload.requestId,
        result
      );
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
