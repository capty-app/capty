import { describe, expect, it, vi } from 'vitest';

const existsSync = vi.fn(() => true);
const send = vi.fn();
let didFinishLoad: (() => void) | null = null;
const browserWindows: MockBrowserWindow[] = [];

class MockBrowserWindow {
  webContents = {
    id: browserWindows.length + 1,
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'did-finish-load') didFinishLoad = listener;
    }),
    send,
  };
  loadFile = vi.fn();
  loadURL = vi.fn();
  show = vi.fn();
  focus = vi.fn();
  once = vi.fn();
  on = vi.fn();
  isDestroyed = vi.fn(() => false);

  constructor(_options: Record<string, unknown>) {
    browserWindows.push(this);
  }
}

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  app: { focus: vi.fn() },
  screen: {
    getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
  },
  dialog: { showOpenDialog: vi.fn() },
}));
vi.mock('fs', () => ({
  default: { existsSync },
  existsSync,
}));
vi.mock('@/main/utils/env', () => ({ isDev: false, devServerUrl: undefined }));
vi.mock('@/main/utils/dock', () => ({ registerDockWindow: vi.fn() }));
vi.mock('@/main/editor-v2/project/project-service', () => ({
  EditorProjectService: class {},
}));
vi.mock('@/main/editor-v2/project/legacy-media-probe', () => ({
  LegacyFfmpegProbeService: class {},
}));

describe('packaged editor routing guard', () => {
  it('keeps V1 as default, hides the switch, and rejects explicit V2', async () => {
    const { createVideoEditorWindow } =
      await import('@/main/capture/video/window-manager');
    const v1 = createVideoEditorWindow('/Project.capty');
    expect(v1).toBeDefined();
    didFinishLoad?.();
    expect(send).toHaveBeenCalledWith('load', {
      type: 'video-editor',
      params: {
        filePath: '/Project.capty/recording.mov',
        canSwitchEditorVersion: false,
      },
    });
    expect(
      createVideoEditorWindow('/Another.capty', { editorVersion: 'v2' })
    ).toBeUndefined();
    expect(browserWindows).toHaveLength(1);
  });
});
