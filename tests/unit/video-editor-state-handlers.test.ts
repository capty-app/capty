import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoEditorState } from '../../src/types/video-editor-state';
import { DEFAULT_EQUALIZER_SETTINGS } from '../../src/types/equalizer';

const ipcHandlers: Record<string, (...args: unknown[]) => unknown> = {};

const mockIpcMain = {
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    ipcHandlers[channel] = handler;
  }),
};

const mockFs = {
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
};

const mockGetWindowData = vi.fn(() => ({ filePath: '/project/video.cap' }));
const mockGetEditorStatePath = vi.fn(
  () => '/project/video.cap/editor-state.json'
);
const mockGenerateInitialEditorState = vi.fn();

function createState(
  overrides: Partial<VideoEditorState> = {}
): VideoEditorState {
  return {
    version: 1,
    savedAt: '2026-06-24T00:00:00.000Z',
    segments: [
      {
        id: 'video',
        originalStart: 0,
        originalEnd: 10,
        trimMinStart: 0,
        trimMaxEnd: 10,
      },
    ],
    cursorStyle: {} as VideoEditorState['cursorStyle'],
    cameraStyle: {} as VideoEditorState['cameraStyle'],
    keyboardStyle: {} as VideoEditorState['keyboardStyle'],
    subtitleStyle: {} as VideoEditorState['subtitleStyle'],
    audioStyle: {} as VideoEditorState['audioStyle'],
    zoomSegments: [],
    zoomSettings: {
      transitionInDuration: 0.2,
      transitionOutDuration: 0.2,
      easing: 'easeOut',
    },
    ui: {
      sidebarOpen: true,
      sidebarTab: 'cursor',
    },
    ...overrides,
  };
}

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
}));

vi.mock('fs', () => ({
  default: mockFs,
}));

vi.mock('../../src/main/capture/video/window-manager', () => ({
  getWindowData: mockGetWindowData,
}));

vi.mock('../../src/main/capture/video/recording-project', () => ({
  getEditorStatePath: mockGetEditorStatePath,
}));

vi.mock('../../src/main/capture/video/auto-zoom-generator', () => ({
  generateInitialEditorState: mockGenerateInitialEditorState,
}));

describe('video editor state handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(ipcHandlers).forEach(key => delete ipcHandlers[key]);
    mockGenerateInitialEditorState.mockResolvedValue(true);
  });

  it('preserves recordingType during reset', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        recordingType: 'ios-device',
      })
    );

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');

    registerStateHandlers();

    const resetHandler = ipcHandlers['video-editor:resetState'];

    const result = await resetHandler({ sender: { id: 1 } });

    expect(result).toBe(true);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(
      '/project/video.cap/editor-state.json'
    );
    expect(mockGenerateInitialEditorState).toHaveBeenCalledWith({
      projectPath: '/project/video.cap',
      recordingType: 'ios-device',
    });
  });

  it('resets state when recordingType is unavailable', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('invalid state file');
    });

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');

    registerStateHandlers();

    const resetHandler = ipcHandlers['video-editor:resetState'];

    const result = await resetHandler({ sender: { id: 1 } });

    expect(result).toBe(true);
    expect(mockGenerateInitialEditorState).toHaveBeenCalledWith({
      projectPath: '/project/video.cap',
      recordingType: undefined,
    });
  });

  it('saves state with valid drawing annotations', async () => {
    const state = createState({
      drawingSegments: [
        {
          id: 'drawing',
          startTime: 0,
          endTime: 3,
          canvasWidth: 100,
          canvasHeight: 100,
          annotations: [
            {
              id: 'pen',
              type: 'pen',
              points: [0, 0, 10, 10],
              stroke: '#ffffff',
              strokeWidth: 2,
            },
          ],
        },
      ],
    });

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');

    registerStateHandlers();

    const saveHandler = ipcHandlers['video-editor:saveState'];
    const result = await saveHandler({ sender: { id: 1 } }, state);

    expect(result).toBe(true);
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  it('rejects state with malformed drawing annotations', async () => {
    const state = createState({
      drawingSegments: [
        {
          id: 'drawing',
          startTime: 0,
          endTime: 3,
          canvasWidth: 100,
          canvasHeight: 100,
          annotations: [
            {
              id: 'pen',
              type: 'pen',
              stroke: '#ffffff',
              strokeWidth: 2,
            },
          ],
        },
      ],
    } as Partial<VideoEditorState>);

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');

    registerStateHandlers();

    const saveHandler = ipcHandlers['video-editor:saveState'];
    const result = await saveHandler({ sender: { id: 1 } }, state);

    expect(result).toBe(false);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('saves valid non-overlapping equalizer segments', async () => {
    const state = createState({
      equalizerSegments: [
        {
          ...DEFAULT_EQUALIZER_SETTINGS,
          id: 'equalizer-1',
          startTime: 0,
          endTime: 5,
        },
        {
          ...DEFAULT_EQUALIZER_SETTINGS,
          id: 'equalizer-2',
          startTime: 5,
          endTime: 10,
          mode: 'circular',
          source: 'mic-audio',
        },
      ],
    });

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');
    registerStateHandlers();

    const saveHandler = ipcHandlers['video-editor:saveState'];
    await expect(saveHandler({ sender: { id: 1 } }, state)).resolves.toBe(true);
  });

  it('saves canonical circular gesture geometry on widescreen video', async () => {
    const state = createState({
      equalizerSegments: [
        {
          ...DEFAULT_EQUALIZER_SETTINGS,
          mode: 'circular',
          id: 'equalizer-circular',
          startTime: 0,
          endTime: 10,
          x: 0.455,
          width: 0.09,
          height: 0.16,
        },
      ],
    });

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');
    registerStateHandlers();

    const saveHandler = ipcHandlers['video-editor:saveState'];
    await expect(saveHandler({ sender: { id: 1 } }, state)).resolves.toBe(true);
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  it('uses the configured frame rate for first-frame timeline validation', async () => {
    const state = createState({
      firstFrame: {
        enabled: true,
        imageData: 'data:image/png;base64,image',
        fit: 'cover',
      },
      exportSettings: {
        format: 'mp4',
        resolution: '1080p',
        qualityPreset: 'studio',
        frameRate: '30',
        openInFinder: false,
      },
      equalizerSegments: [
        {
          ...DEFAULT_EQUALIZER_SETTINGS,
          id: 'first-frame-equalizer',
          startTime: 0,
          endTime: 10 + 1 / 30,
        },
      ],
    });

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');
    registerStateHandlers();

    const saveHandler = ipcHandlers['video-editor:saveState'];
    await expect(saveHandler({ sender: { id: 1 } }, state)).resolves.toBe(true);
  });

  it('falls back consistently for a malformed saved frame rate', async () => {
    const state = createState({
      firstFrame: {
        enabled: true,
        imageData: 'data:image/png;base64,image',
        fit: 'cover',
      },
      exportSettings: {
        format: 'mp4',
        resolution: '1080p',
        qualityPreset: 'studio',
        frameRate: '30fps',
        openInFinder: false,
      },
      equalizerSegments: [
        {
          ...DEFAULT_EQUALIZER_SETTINGS,
          id: 'first-frame-equalizer',
          startTime: 0,
          endTime: 10 + 1 / 30,
        },
      ],
    } as unknown as Partial<VideoEditorState>);

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');
    registerStateHandlers();

    const saveHandler = ipcHandlers['video-editor:saveState'];
    await expect(saveHandler({ sender: { id: 1 } }, state)).resolves.toBe(
      false
    );
  });

  it.each([
    'invalid',
    [
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        id: 'equalizer-1',
        startTime: 0,
        endTime: 6,
      },
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        id: 'equalizer-2',
        startTime: 5,
        endTime: 9,
      },
    ],
    [
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        id: 'equalizer-1',
        startTime: 0,
        endTime: 11,
      },
    ],
    [
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        id: 'equalizer-1',
        startTime: 0,
        endTime: 5,
        opacity: Number.NaN,
      },
    ],
  ])('rejects malformed equalizer segment data', async equalizerSegments => {
    const state = createState({
      equalizerSegments:
        equalizerSegments as VideoEditorState['equalizerSegments'],
    });

    const { registerStateHandlers } =
      await import('../../src/main/capture/video/ipc/state-handlers');
    registerStateHandlers();

    const saveHandler = ipcHandlers['video-editor:saveState'];
    await expect(saveHandler({ sender: { id: 1 } }, state)).resolves.toBe(
      false
    );
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});
