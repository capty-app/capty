import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock electron app with event handlers
type AppEventHandler = (...args: unknown[]) => void | Promise<void>;
const appEventHandlers: Record<string, AppEventHandler> = {};
let mockSingleInstanceLock = true;
const mockApp = {
  getVersion: vi.fn(() => '1.0.0'),
  getPath: vi.fn((name: string) => {
    const paths: Record<string, string> = {
      home: '/mock/home',
      userData: '/mock/home/.config/capty',
    };
    return paths[name] || `/mock/${name}`;
  }),
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn((event: string, handler: AppEventHandler) => {
    appEventHandlers[event] = handler;
  }),
  quit: vi.fn(),
  isPackaged: false,
  requestSingleInstanceLock: vi.fn(() => mockSingleInstanceLock),
};

vi.mock('electron', () => ({
  app: mockApp,
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      scaleFactor: 2,
      workAreaSize: { width: 1920, height: 1080 },
    })),
  },
}));

// Mock menu
const mockMenu = {
  init: vi.fn(() => Promise.resolve()),
};
vi.mock('@/main/menu/index.ts', () => mockMenu);

// Mock preferences
const mockPreferences = {
  init: vi.fn(),
};
vi.mock('@/main/system/preferences', () => mockPreferences);

// Mock config
const mockSettingsConfig = {
  general: {
    hideMenuBarIcon: false,
  },
};
const mockSettings = {
  init: vi.fn(),
  needsOnboarding: vi.fn(() => false),
  getConfig: vi.fn(() => mockSettingsConfig),
  updateConfig: vi.fn(),
};
vi.mock('@/main/settings/index.ts', () => mockSettings);
vi.mock('@/main/settings', () => mockSettings);

// Mock shortcuts
const mockShortcuts = {
  init: vi.fn(),
};
vi.mock('@/main/system/shortcuts', () => mockShortcuts);

// Mock history
const mockHistory = {
  init: vi.fn(),
};
vi.mock('@/main/history', () => mockHistory);

// Mock license
const mockLicense = {
  init: vi.fn(() => Promise.resolve()),
};
vi.mock('@/main/license/index.ts', () => mockLicense);

// Mock update
const mockUpdate = {
  init: vi.fn(),
  handleAppUpdate: vi.fn(() => Promise.resolve()),
};
vi.mock('@/main/update/index.ts', () => mockUpdate);

// Mock permissions
const mockPermissions = {
  initPermissionsIPC: vi.fn(),
};
vi.mock('@/main/system/permissions', () => mockPermissions);

// Mock cloud
const mockCloud = {
  init: vi.fn(),
};
vi.mock('@/main/cloud/index.ts', () => mockCloud);

// Mock capture
const mockCapture = {
  init: vi.fn(),
};
vi.mock('@/main/capture', () => mockCapture);

// Mock all-in-one
const mockAllInOne = {
  init: vi.fn(),
};
vi.mock('@/main/capture/all-in-one', () => mockAllInOne);

// Mock activation
const mockActivation = {
  createActivationWindow: vi.fn(),
  setOnActivatedCallback: vi.fn(),
  init: vi.fn(),
};
vi.mock('@/main/activation', () => mockActivation);

// Mock onboarding
const mockOnboarding = {
  init: vi.fn(),
  showOnboardingOrRun: vi.fn((cb: () => Promise<void>) => {
    // If needsOnboarding returns true, store callback but don't run it
    if (mockSettings.needsOnboarding()) {
      return Promise.resolve();
    }
    // Otherwise, run the callback immediately
    return cb();
  }),
};
vi.mock('@/main/onboarding', () => mockOnboarding);

const mockLegal = {
  init: vi.fn(),
};
vi.mock('@/main/legal', () => mockLegal);

describe('Main Process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(appEventHandlers).forEach(key => delete appEventHandlers[key]);

    // Reset mock return values
    mockSettings.needsOnboarding.mockReturnValue(false);
    mockApp.getVersion.mockReturnValue('1.0.0');
    mockSingleInstanceLock = true;
    mockSettingsConfig.general.hideMenuBarIcon = false;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('initializeModules', () => {
    it('should initialize license system first', async () => {
      await import('@/main/main');

      expect(mockLicense.init).toHaveBeenCalled();
    });

    it('should initialize settings', async () => {
      await import('@/main/main');

      expect(mockSettings.init).toHaveBeenCalled();
    });

    it('should initialize activation IPC', async () => {
      await import('@/main/main');

      expect(mockActivation.init).toHaveBeenCalled();
    });

    it('should initialize onboarding IPC', async () => {
      await import('@/main/main');

      expect(mockOnboarding.init).toHaveBeenCalled();
    });

    it('should initialize permissions IPC', async () => {
      await import('@/main/main');

      expect(mockPermissions.initPermissionsIPC).toHaveBeenCalled();
    });

    it('should initialize capture module', async () => {
      await import('@/main/main');

      expect(mockCapture.init).toHaveBeenCalled();
    });

    it('should initialize preferences', async () => {
      await import('@/main/main');

      expect(mockPreferences.init).toHaveBeenCalled();
    });

    it('should initialize cloud', async () => {
      await import('@/main/main');

      expect(mockCloud.init).toHaveBeenCalled();
    });

    it('should initialize all-in-one', async () => {
      await import('@/main/main');

      expect(mockAllInOne.init).toHaveBeenCalled();
    });

    it('should initialize legal IPC', async () => {
      await import('@/main/main');

      expect(mockLegal.init).toHaveBeenCalled();
    });

    it('should always call showOnboardingOrRun regardless of license', async () => {
      await import('@/main/main');

      expect(mockOnboarding.showOnboardingOrRun).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('initializeRuntimeModules', () => {
    it('should initialize shortcuts', async () => {
      await import('@/main/main');

      expect(mockShortcuts.init).toHaveBeenCalled();
    });

    it('should initialize menu', async () => {
      await import('@/main/main');

      expect(mockMenu.init).toHaveBeenCalled();
    });

    it('should initialize history', async () => {
      await import('@/main/main');

      expect(mockHistory.init).toHaveBeenCalled();
    });

    it('should initialize update system', async () => {
      await import('@/main/main');

      expect(mockUpdate.init).toHaveBeenCalled();
    });
  });

  describe('handleAppUpdate', () => {
    it('should be called after modules are initialized', async () => {
      await import('@/main/main');

      expect(mockUpdate.handleAppUpdate).toHaveBeenCalled();
    });
  });

  describe('window-all-closed event', () => {
    it('should register window-all-closed handler', async () => {
      await import('@/main/main');

      expect(mockApp.on).toHaveBeenCalledWith(
        'window-all-closed',
        expect.any(Function)
      );
    });

    it('should quit app on non-darwin platforms', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      await import('@/main/main');

      // Trigger the event handler
      const handler = appEventHandlers['window-all-closed'];
      if (handler) {
        handler();
      }

      expect(mockApp.quit).toHaveBeenCalled();

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should not quit app on darwin', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      // Clear previous calls
      mockApp.quit.mockClear();

      await import('@/main/main');

      // Trigger the event handler
      const handler = appEventHandlers['window-all-closed'];
      if (handler) {
        handler();
      }

      expect(mockApp.quit).not.toHaveBeenCalled();

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('app.whenReady', () => {
    it('should call whenReady on import', async () => {
      await import('@/main/main');

      expect(mockApp.whenReady).toHaveBeenCalled();
    });
  });

  describe('Single Instance Lock', () => {
    it('should request single instance lock on startup', async () => {
      await import('@/main/main');

      expect(mockApp.requestSingleInstanceLock).toHaveBeenCalled();
    });

    it('should quit app when another instance is already running', async () => {
      mockSingleInstanceLock = false;

      await import('@/main/main');

      expect(mockApp.quit).toHaveBeenCalled();
    });

    it('should register second-instance event handler', async () => {
      await import('@/main/main');

      expect(mockApp.on).toHaveBeenCalledWith(
        'second-instance',
        expect.any(Function)
      );
    });

    it('should restore menu bar icon on second instance when hidden', async () => {
      mockSettingsConfig.general.hideMenuBarIcon = true;

      await import('@/main/main');

      // Trigger the second-instance event handler
      const handler = appEventHandlers['second-instance'];
      if (handler) {
        handler();
      }

      // Should update config to show menu bar icon
      expect(mockSettings.updateConfig).toHaveBeenCalledWith({
        general: { ...mockSettingsConfig.general, hideMenuBarIcon: false },
      });

      // Should reinitialize menu
      expect(mockMenu.init).toHaveBeenCalled();
    });

    it('should not update config on second instance when menu bar is visible', async () => {
      mockSettingsConfig.general.hideMenuBarIcon = false;

      await import('@/main/main');

      // Clear mocks after initial import
      mockSettings.updateConfig.mockClear();
      mockMenu.init.mockClear();

      // Trigger the second-instance event handler
      const handler = appEventHandlers['second-instance'];
      if (handler) {
        handler();
      }

      // Should not update config since menu is already visible
      expect(mockSettings.updateConfig).not.toHaveBeenCalled();
    });
  });
});
