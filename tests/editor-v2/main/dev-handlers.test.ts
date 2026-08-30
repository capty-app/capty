import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorV2FlushResult } from '@/types/editor-v2';

interface TestEvent {
  sender: { id: number };
}

interface TestWindowData {
  editorVersion: 'v1' | 'v2';
  projectToken: string;
  projectLocation: {
    kind: 'capty-package';
    packagePath: string;
    format: 'hybrid';
    v1RecordingPath: string;
  };
  window: {
    isDestroyed: () => boolean;
    once: typeof windowOnce;
    removeListener: typeof removeWindowListener;
    webContents: {
      send: typeof send;
      once: typeof webContentsOnce;
      removeListener: typeof removeWebContentsListener;
    };
  };
}

type TestHandler = (
  event: TestEvent,
  request: Record<string, unknown>
) => Promise<unknown>;
type TestListener = (event: TestEvent, result: EditorV2FlushResult) => void;

const handlers: Record<string, TestHandler> = {};
const listeners: Record<string, TestListener> = {};
const send = vi.fn();
const windowOnce = vi.fn();
const removeWindowListener = vi.fn();
const webContentsOnce = vi.fn();
const removeWebContentsListener = vi.fn();
const recreateVideoEditorWindow = vi.fn();
const saveWorkspace = vi.fn();
let mockIsDev = true;
let windowData: TestWindowData | undefined;

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: TestHandler) => {
      handlers[channel] = handler;
    }),
    on: vi.fn((channel: string, listener: TestListener) => {
      listeners[channel] = listener;
    }),
  },
}));

vi.mock('@/main/utils/env', () => ({
  get isDev() {
    return mockIsDev;
  },
}));

vi.mock('@/main/capture/video/window-manager', () => ({
  editorProjectService: { saveWorkspace },
  getWindowData: vi.fn(() => windowData),
  recreateVideoEditorWindow,
}));

const event: TestEvent = { sender: { id: 7 } };

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mockIsDev = true;
  Object.keys(handlers).forEach(key => delete handlers[key]);
  Object.keys(listeners).forEach(key => delete listeners[key]);
  windowData = {
    editorVersion: 'v1',
    projectToken: 'token',
    projectLocation: {
      kind: 'capty-package',
      packagePath: '/Project.capty',
      format: 'hybrid',
      v1RecordingPath: '/Project.capty/recording.mov',
    },
    window: {
      isDestroyed: () => false,
      once: windowOnce,
      removeListener: removeWindowListener,
      webContents: {
        send,
        once: webContentsOnce,
        removeListener: removeWebContentsListener,
      },
    },
  };
  recreateVideoEditorWindow.mockResolvedValue({});
  const { registerEditorV2DevHandlers } =
    await import('@/main/editor-v2/ipc/dev-handlers');
  registerEditorV2DevHandlers();
});

describe('Editor V2 development handlers', () => {
  it('flushes V1 before recreating the window for V2', async () => {
    const pending = handlers['editor-v2:version:switch'](event, {
      targetVersion: 'v2',
    });
    expect(send).toHaveBeenCalledWith(
      'video-editor:switch-flush-request',
      expect.objectContaining({ requestId: expect.any(String) })
    );
    const request = send.mock.calls[0][1] as { requestId: string };
    listeners['video-editor:switch-flush-result'](event, {
      requestId: request.requestId,
      status: 'flushed',
      projectRevision: 0,
      workspaceRevision: 0,
    });

    await expect(pending).resolves.toEqual({ status: 'switched' });
    expect(recreateVideoEditorWindow).toHaveBeenCalledWith(7, 'v2');
  });

  it('cancels switching when the renderer becomes unavailable during flush', async () => {
    const pending = handlers['editor-v2:version:switch'](event, {
      targetVersion: 'v2',
    });
    const goneListener = webContentsOnce.mock.calls.find(
      call => call[0] === 'render-process-gone'
    )?.[1] as (() => void) | undefined;
    goneListener?.();

    await expect(pending).resolves.toEqual({
      status: 'cancelled',
      error: 'Editor renderer became unavailable during save',
    });
    expect(recreateVideoEditorWindow).not.toHaveBeenCalled();
    expect(removeWindowListener).toHaveBeenCalledWith(
      'closed',
      expect.any(Function)
    );
  });

  it('cancels switching when renderer flush fails', async () => {
    const pending = handlers['editor-v2:version:switch'](event, {
      targetVersion: 'v2',
    });
    const request = send.mock.calls[0][1] as { requestId: string };
    listeners['video-editor:switch-flush-result'](event, {
      requestId: request.requestId,
      status: 'failed',
      projectRevision: 0,
      workspaceRevision: 0,
      error: 'save failed',
    });

    await expect(pending).resolves.toEqual({
      status: 'cancelled',
      error: 'save failed',
    });
    expect(recreateVideoEditorWindow).not.toHaveBeenCalled();
  });

  it('rejects switch and workspace capabilities outside development', async () => {
    mockIsDev = false;
    await expect(
      handlers['editor-v2:version:switch'](event, { targetVersion: 'v2' })
    ).resolves.toEqual({
      status: 'cancelled',
      error: 'Editor switching is development-only',
    });
    await expect(
      handlers['editor-v2:workspace:save'](event, {
        projectToken: 'token',
        expectedRevision: 0,
        workspace: {},
      })
    ).resolves.toEqual({
      status: 'failed',
      error: 'Unauthorized Editor V2 workspace save',
    });
  });

  it('rejects workspace saves from the wrong project token', async () => {
    if (!windowData) return;
    windowData.editorVersion = 'v2';
    await expect(
      handlers['editor-v2:workspace:save'](event, {
        projectToken: 'wrong-token',
        expectedRevision: 0,
        workspace: {},
      })
    ).resolves.toEqual({
      status: 'failed',
      error: 'Unauthorized Editor V2 workspace save',
    });
    expect(saveWorkspace).not.toHaveBeenCalled();
  });
});
