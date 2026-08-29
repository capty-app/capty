import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
      listeners.set(channel, listener);
    }),
  },
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

beforeEach(() => {
  listeners.clear();
});

describe('sender-bound media identity', () => {
  it('rejects a file that replaces an authorized media source', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'capty-media-identity-')
    );
    temporaryDirectories.push(directory);
    const videoPath = path.join(directory, 'video.mov');
    const originalPath = path.join(directory, 'original.mov');
    const replacementPath = path.join(directory, 'replacement.txt');
    await fs.writeFile(videoPath, 'video');
    await fs.writeFile(replacementPath, 'private');

    const {
      resolveVideoMediaPaths,
      setMediaPathsForSender,
      deleteMediaPathsForSender,
    } = await import('@/main/capture/video/media-sources');
    const { registerFileHandlers } =
      await import('@/main/capture/video/ipc/file-handlers');
    const senderId = 42;
    setMediaPathsForSender(senderId, resolveVideoMediaPaths(videoPath));
    registerFileHandlers();

    await fs.rename(videoPath, originalPath);
    await fs.rename(replacementPath, videoPath);

    const send = vi.fn();
    const listener = listeners.get('video-editor:media:read-range');
    await listener?.(
      {
        sender: { id: senderId, send, isDestroyed: () => false },
      },
      {
        requestId: 'request-1',
        source: 'video',
        start: 0,
        end: 5,
      }
    );

    expect(send).toHaveBeenCalledWith(
      'video-editor:media:read-range:response',
      {
        requestId: 'request-1',
        result: {
          success: false,
          error: 'Media source changed after authorization',
        },
      }
    );
    deleteMediaPathsForSender(senderId);
  });
});
