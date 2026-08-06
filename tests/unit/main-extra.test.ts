import { describe, it, expect, vi, beforeEach } from 'vitest';

type AppEventHandler = (...args: unknown[]) => void | Promise<void>;
const appEventHandlers: Record<string, AppEventHandler> = {};

const mockSettingsConfig = { general: { hideMenuBarIcon: false } };

const mockApp = {
  getVersion: () => '1.0.0',
  getPath: (name: string) => `/mock/${name}`,
  whenReady: () => Promise.resolve(),
  on: vi.fn((event: string, handler: AppEventHandler) => {
    appEventHandlers[event] = handler;
  }),
  quit: vi.fn(),
  isPackaged: false,
  requestSingleInstanceLock: () => true,
};

vi.mock('electron', () => ({
  app: mockApp,
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: vi.fn(),
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      scaleFactor: 2,
      workAreaSize: { width: 1920, height: 1080 },
    })),
  },
}));

const mockMenuInit = vi.fn(() => Promise.resolve());
const mockMenuRebuildTray = vi.fn();
vi.mock('@/main/menu/index.ts', () => ({
  init: mockMenuInit,
  rebuildTrayMenu: mockMenuRebuildTray,
}));

const mockSettings = {
  init: vi.fn(),
  needsOnboarding: vi.fn(() => false),
  getConfig: vi.fn(() => mockSettingsConfig),
  updateConfig: vi.fn(),
};
vi.mock('@/main/settings/index.ts', () => mockSettings);
vi.mock('@/main/settings', () => mockSettings);

const mockShortcuts = { init: vi.fn() };
vi.mock('@/main/system/shortcuts', () => mockShortcuts);
vi.mock('@/main/system/shortcuts.ts', () => mockShortcuts);

const mockHistory = { init: vi.fn() };
vi.mock('@/main/history', () => mockHistory);

const mockLicense = {
  init: vi.fn(() => Promise.resolve()),
  shouldBlockApp: vi.fn(() => false),
  generateDeviceFingerprint: vi.fn(() => 'fp'),
};
vi.mock('@/main/license/index.ts', () => mockLicense);

const mockUpdate = {
  init: vi.fn(),
  handleAppUpdate: vi.fn(() => Promise.resolve()),
};
vi.mock('@/main/update/index.ts', () => mockUpdate);

const mockPermissions = { initPermissionsIPC: vi.fn() };
vi.mock('@/main/system/permissions.ts', () => mockPermissions);

const mockCloud = { init: vi.fn() };
vi.mock('@/main/cloud/index.ts', () => mockCloud);

const mockCapture = { init: vi.fn(), resetScreenCaptureCache: vi.fn() };
vi.mock('@/main/capture', () => mockCapture);

const mockActivation = {
  init: vi.fn(),
  setOnActivatedCallback: vi.fn(),
  createActivationWindow: vi.fn(),
};
vi.mock('@/main/activation', () => mockActivation);

const mockOnboarding = {
  init: vi.fn(),
  showOnboardingOrRun: vi.fn(async (cb: () => Promise<void>) => {
    await cb();
  }),
};
vi.mock('@/main/onboarding', () => mockOnboarding);

const mockLegal = { init: vi.fn() };
vi.mock('@/main/legal', () => mockLegal);

const mockAllInOne = { init: vi.fn(), default: vi.fn() };
vi.mock('@/main/capture/all-in-one', () => mockAllInOne);

const mockDaemon = { daemon: { start: vi.fn(() => Promise.resolve()) } };
vi.mock('@/main/daemon', () => mockDaemon);

const mockPreferences = { init: vi.fn() };
vi.mock('@/main/system/preferences.ts', () => mockPreferences);

const mockCreateVideoEditorWindow = vi.fn();
vi.mock('@/main/capture/video/video-editor', () => ({
  createVideoEditorWindow: mockCreateVideoEditorWindow,
}));

const mockBufferImage = vi.fn();
const mockFlushPending = vi.fn();
const mockQueueImage = vi.fn();
vi.mock('@/main/capture/screenshot/image-open-batcher', () => ({
  bufferImageFile: mockBufferImage,
  flushPendingImages: mockFlushPending,
  queueImageFile: mockQueueImage,
}));

describe('main.ts extra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.keys(appEventHandlers).forEach(k => delete appEventHandlers[k]);
    mockSettingsConfig.general.hideMenuBarIcon = false;
    delete process.env.HOME;
  });

  it('sets HOME env var if missing', async () => {
    delete process.env.HOME;
    await import('@/main/main');
    expect(process.env.HOME).toBe('/mock/home');
  });

  it('handles open-file for .capty projects (before ready)', async () => {
    await import('@/main/main');
    const openHandler = appEventHandlers['open-file'];
    expect(openHandler).toBeDefined();
    const fakeEvent = { preventDefault: vi.fn() };
    openHandler!(fakeEvent, '/p/My.capty');
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    // before app ready, should not create window
    expect(mockCreateVideoEditorWindow).not.toHaveBeenCalled();
  });

  it('handles open-file for image files (before ready buffers)', async () => {
    await import('@/main/main');
    const openHandler = appEventHandlers['open-file'];
    const fakeEvent = { preventDefault: vi.fn() };
    openHandler!(fakeEvent, '/p/image.png');
    expect(mockBufferImage).toHaveBeenCalledWith('/p/image.png');
  });

  it('ignores unsupported file extensions', async () => {
    await import('@/main/main');
    const openHandler = appEventHandlers['open-file'];
    const fakeEvent = { preventDefault: vi.fn() };
    openHandler!(fakeEvent, '/p/document.pdf');
    expect(mockCreateVideoEditorWindow).not.toHaveBeenCalled();
    expect(mockBufferImage).not.toHaveBeenCalled();
  });

  it('activate event restores menu bar when no visible windows', async () => {
    mockSettingsConfig.general.hideMenuBarIcon = true;
    await import('@/main/main');
    const handler = appEventHandlers['activate'];
    expect(handler).toBeDefined();
    handler!(null, false);
    expect(mockSettings.updateConfig).toHaveBeenCalled();
  });

  it('activate event does nothing when has visible windows', async () => {
    mockSettingsConfig.general.hideMenuBarIcon = true;
    await import('@/main/main');
    const handler = appEventHandlers['activate'];
    handler!(null, true);
    expect(mockSettings.updateConfig).not.toHaveBeenCalled();
  });

  it('window-all-closed quits app on non-darwin', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    await import('@/main/main');
    const handler = appEventHandlers['window-all-closed'];
    handler!();
    expect(mockApp.quit).toHaveBeenCalled();
    Object.defineProperty(process, 'platform', { value: original });
  });

  it('window-all-closed stays running on darwin', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    await import('@/main/main');
    mockApp.quit.mockClear();
    const handler = appEventHandlers['window-all-closed'];
    handler!();
    expect(mockApp.quit).not.toHaveBeenCalled();
    Object.defineProperty(process, 'platform', { value: original });
  });
});
