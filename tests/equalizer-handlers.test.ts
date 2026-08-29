import { EventEmitter } from 'events';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  getWindowData: vi.fn(),
  analyzeEqualizerAudio: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
    on: mocks.on,
  },
}));

vi.mock('@/main/capture/video/window-manager', () => ({
  getWindowData: mocks.getWindowData,
}));

vi.mock('@/main/capture/video/equalizer-analysis', () => ({
  analyzeEqualizerAudio: mocks.analyzeEqualizerAudio,
}));

import {
  registerEqualizerHandlers,
  resolveEqualizerAudioPath,
} from '@/main/capture/video/ipc/equalizer-handlers';
import type { AudioAnalysisData } from '@/types/equalizer';

const temporaryDirectories: string[] = [];
const EMPTY_ANALYSIS: AudioAnalysisData = {
  frameRate: 24,
  spectrumBandCount: 24,
  waveformPointCount: 32,
  duration: 0,
  frames: new Int8Array(),
};

async function createProject(): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-project-'));
  temporaryDirectories.push(parent);
  const projectPath = path.join(parent, 'recording.capty');
  await fs.mkdir(path.join(projectPath, 'music'), { recursive: true });
  await fs.writeFile(path.join(projectPath, 'recording.mov'), 'video');
  await fs.writeFile(path.join(projectPath, 'music', 'track.mp3'), 'audio');
  return projectPath;
}

function setProjectWindowData(projectPath: string): void {
  mocks.getWindowData.mockReturnValue({
    filePath: projectPath,
    mediaPaths: {
      video: path.join(projectPath, 'recording.mov'),
      camera: null,
      identities: {
        video: { device: 1, inode: 2 },
        camera: null,
      },
    },
  });
}

interface TestSender extends EventEmitter {
  id: number;
  send: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
}

function createSender(id: number): TestSender {
  const sender = new EventEmitter() as TestSender;
  sender.id = id;
  sender.send = vi.fn();
  sender.isDestroyed = () => false;
  return sender;
}

function getRegisteredListener(
  channel: string
): (...args: unknown[]) => unknown {
  const registration = mocks.on.mock.calls.find(call => call[0] === channel);
  if (!registration) throw new Error(`Missing listener for ${channel}`);
  return registration[1] as (...args: unknown[]) => unknown;
}

beforeEach(() => {
  mocks.handle.mockClear();
  mocks.on.mockClear();
  mocks.getWindowData.mockReset();
  mocks.analyzeEqualizerAudio.mockReset();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('equalizer audio path resolution', () => {
  it('resolves only project-owned recording and music sources', async () => {
    const projectPath = await createProject();
    setProjectWindowData(projectPath);

    const recordingPath = await resolveEqualizerAudioPath(1, {
      type: 'system',
    });
    const musicPath = await resolveEqualizerAudioPath(1, {
      type: 'music',
      fileName: 'track.mp3',
    });
    const traversalPath = await resolveEqualizerAudioPath(1, {
      type: 'music',
      fileName: '../track.mp3',
    });

    expect(recordingPath).toBe(
      await fs.realpath(path.join(projectPath, 'recording.mov'))
    );
    expect(musicPath).toBe(
      await fs.realpath(path.join(projectPath, 'music', 'track.mp3'))
    );
    expect(traversalPath).toBeNull();
  });

  it('rejects sidecar and music symlinks that leave the project folder', async () => {
    const projectPath = await createProject();
    const outsidePath = path.join(path.dirname(projectPath), 'outside.mp3');
    await fs.writeFile(outsidePath, 'audio');
    await fs.symlink(outsidePath, path.join(projectPath, 'system.m4a'));
    await fs.symlink(outsidePath, path.join(projectPath, 'mic.m4a'));
    await fs.symlink(
      outsidePath,
      path.join(projectPath, 'music', 'outside.mp3')
    );
    setProjectWindowData(projectPath);

    await expect(
      resolveEqualizerAudioPath(1, {
        type: 'music',
        fileName: 'outside.mp3',
      })
    ).resolves.toBeNull();
    await expect(
      resolveEqualizerAudioPath(1, { type: 'system' })
    ).resolves.toBe(await fs.realpath(path.join(projectPath, 'recording.mov')));
    await expect(
      resolveEqualizerAudioPath(1, { type: 'mic' })
    ).resolves.toBeNull();
  });
});

describe('equalizer analysis IPC', () => {
  it('cancels a running FFmpeg analysis by request ID', async () => {
    const projectPath = await createProject();
    const sender = createSender(7);
    setProjectWindowData(projectPath);
    mocks.analyzeEqualizerAudio.mockImplementation(
      (_inputPath: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('Audio analysis cancelled');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );
    registerEqualizerHandlers();
    const analyze = getRegisteredListener('video-editor:equalizer:analyze');
    const cancel = getRegisteredListener('video-editor:equalizer:cancel');

    const response = analyze(
      { sender },
      { requestId: 'request-1', source: { type: 'system' } }
    ) as Promise<void>;
    await vi.waitFor(() =>
      expect(mocks.analyzeEqualizerAudio).toHaveBeenCalled()
    );
    cancel({ sender }, { requestId: 'request-1' });

    await response;
    expect(sender.send).toHaveBeenCalledWith(
      'video-editor:equalizer:analyze:response',
      {
        requestId: 'request-1',
        result: {
          success: false,
          error: 'Audio analysis cancelled',
        },
      }
    );
  });

  it('limits analysis concurrency in the main process', async () => {
    const projectPath = await createProject();
    const sender = createSender(8);
    const resolvers: Array<(analysis: AudioAnalysisData) => void> = [];
    setProjectWindowData(projectPath);
    mocks.analyzeEqualizerAudio.mockImplementation(
      () =>
        new Promise<AudioAnalysisData>(resolve => {
          resolvers.push(resolve);
        })
    );
    registerEqualizerHandlers();
    const analyze = getRegisteredListener('video-editor:equalizer:analyze');

    const requests = [1, 2, 3].map(
      index =>
        analyze(
          { sender },
          { requestId: `request-${index}`, source: { type: 'system' } }
        ) as Promise<void>
    );

    await vi.waitFor(() =>
      expect(mocks.analyzeEqualizerAudio).toHaveBeenCalledTimes(2)
    );
    resolvers[0](EMPTY_ANALYSIS);
    await vi.waitFor(() =>
      expect(mocks.analyzeEqualizerAudio).toHaveBeenCalledTimes(3)
    );
    resolvers[1](EMPTY_ANALYSIS);
    resolvers[2](EMPTY_ANALYSIS);

    await Promise.all(requests);
    expect(sender.send).toHaveBeenCalledTimes(3);
    expect(sender.send).toHaveBeenCalledWith(
      'video-editor:equalizer:analyze:response',
      expect.objectContaining({
        result: { success: true, analysis: EMPTY_ANALYSIS },
      })
    );
  });

  it('ignores a cancel request without a payload', () => {
    registerEqualizerHandlers();
    const cancel = getRegisteredListener('video-editor:equalizer:cancel');

    expect(() => cancel({ sender: createSender(9) })).not.toThrow();
  });
});
