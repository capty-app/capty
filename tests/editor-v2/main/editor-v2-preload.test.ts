import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const on = vi.fn();
const off = vi.fn();
const send = vi.fn();
const invoke = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { on, off, send, invoke },
}));

describe('Editor V2 preload', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await import('@/preload/editor-v2');
  });

  it('exposes only the typed Editor V2 capability', () => {
    expect(exposeInMainWorld).toHaveBeenCalledOnce();
    const [name, bridge] = exposeInMainWorld.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe('editorV2');
    expect(Object.keys(bridge).sort()).toEqual([
      'acknowledgeFlush',
      'createProject',
      'getMediaStatus',
      'importMedia',
      'onFlushRequest',
      'onLoad',
      'onLoadError',
      'onMutationUnfreeze',
      'relinkMedia',
      'reloadProject',
      'removeManagedMedia',
      'revealMedia',
      'saveProject',
      'saveProjectCopy',
      'saveWorkspace',
      'switchVersion',
    ]);
    expect(exposeInMainWorld).not.toHaveBeenCalledWith(
      'ipcRenderer',
      expect.anything()
    );
  });

  it('uses only approved channels and supports listener cleanup', async () => {
    const bridge = exposeInMainWorld.mock.calls[0][1] as {
      onLoad: (listener: () => void) => () => void;
      acknowledgeFlush: (value: unknown) => void;
      saveProject: (value: unknown) => Promise<unknown>;
      reloadProject: (value: unknown) => Promise<unknown>;
      saveProjectCopy: (value: unknown) => Promise<unknown>;
      createProject: (value: unknown) => Promise<unknown>;
      saveWorkspace: (value: unknown) => Promise<unknown>;
      importMedia: (value: unknown) => Promise<unknown>;
      getMediaStatus: (value: unknown) => Promise<unknown>;
      relinkMedia: (value: unknown) => Promise<unknown>;
      revealMedia: (value: unknown) => Promise<unknown>;
      removeManagedMedia: (value: unknown) => Promise<unknown>;
      switchVersion: (value: unknown) => Promise<unknown>;
    };
    const cleanup = bridge.onLoad(() => undefined);
    expect(on).toHaveBeenCalledWith(
      'editor-v2:project:load',
      expect.any(Function)
    );
    cleanup();
    expect(off).toHaveBeenCalledWith(
      'editor-v2:project:load',
      expect.any(Function)
    );
    bridge.acknowledgeFlush({ requestId: 'request' });
    expect(send).toHaveBeenCalledWith('editor-v2:project:flush-result', {
      requestId: 'request',
    });
    await bridge.saveProject({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:project:save', {
      projectToken: 'token',
    });
    await bridge.reloadProject({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:project:reload', {
      projectToken: 'token',
    });
    await bridge.saveProjectCopy({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:project:save-copy', {
      projectToken: 'token',
    });
    await bridge.createProject({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:project:create', {
      projectToken: 'token',
    });
    await bridge.saveWorkspace({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:workspace:save', {
      projectToken: 'token',
    });
    await bridge.importMedia({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:media:import', {
      projectToken: 'token',
    });
    await bridge.getMediaStatus({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:media:status', {
      projectToken: 'token',
    });
    await bridge.relinkMedia({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:media:relink', {
      projectToken: 'token',
    });
    await bridge.revealMedia({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:media:reveal', {
      projectToken: 'token',
    });
    await bridge.removeManagedMedia({ projectToken: 'token' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:media:remove-managed', {
      projectToken: 'token',
    });
    await bridge.switchVersion({ targetVersion: 'v1' });
    expect(invoke).toHaveBeenCalledWith('editor-v2:version:switch', {
      targetVersion: 'v1',
    });
  });
});
