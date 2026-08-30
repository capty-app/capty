import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';

const handlers = new Map<
  string,
  (event: { sender: { id: number } }, request: never) => Promise<unknown>
>();
const showOpenDialog = vi.fn();
const showMessageBox = vi.fn();
const showItemInFolder = vi.fn();
const getWindowData = vi.fn();
const readActiveProject = vi.fn();
const runMediaOperation = vi.fn(
  async (_session: unknown, operation: () => Promise<unknown>) => operation()
);
const addActiveAsset = vi.fn();
const updateActiveAsset = vi.fn();
const removeManagedMedia = vi.fn();
const temporaryDirectories: string[] = [];

vi.mock('electron', () => ({
  dialog: { showOpenDialog, showMessageBox },
  ipcMain: {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  },
  shell: { showItemInFolder },
}));

vi.mock('@/main/utils/env', () => ({ isDev: true }));

vi.mock('@/main/capture/video/window-manager', () => ({
  editorProjectService: {
    readActiveProject,
    runMediaOperation,
    addActiveAsset,
    updateActiveAsset,
    removeManagedMedia,
  },
  getWindowData,
}));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  handlers.clear();
  getWindowData.mockReturnValue(undefined);
  const { registerEditorV2MediaHandlers } =
    await import('@/main/editor-v2/ipc/media-handlers');
  registerEditorV2MediaHandlers();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('Editor V2 media IPC sender policy', () => {
  it('requires destructive confirmation before managed removal', async () => {
    const session = {
      location: { kind: 'capty-package' },
    };
    getWindowData.mockReturnValue({
      editorVersion: 'v2',
      projectToken: 'token',
      projectSession: session,
      window: {},
    });
    showMessageBox.mockResolvedValue({ response: 0 });
    const result = await handlers.get('editor-v2:media:remove-managed')!(
      { sender: { id: 7 } },
      {
        projectToken: 'token',
        assetId: 'managed',
        expectedRevision: 2,
      } as never
    );
    expect(result).toEqual({ status: 'cancelled' });
    expect(removeManagedMedia).not.toHaveBeenCalled();
  });

  it('resolves unsaved in-memory assets from the active project view', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-media-ipc-'));
    temporaryDirectories.push(root);
    const packagePath = path.join(root, 'Legacy.capty');
    await fs.mkdir(packagePath);
    const project = createEmptyEditorProject({
      id: 'project',
      name: 'Legacy',
      createdAt: '2026-08-30T00:00:00.000Z',
      sequenceId: 'sequence',
      videoTrackId: 'video',
      audioTrackId: 'audio',
    });
    project.assets.unsaved = {
      id: 'unsaved',
      kind: 'image',
      name: 'Unsaved import',
      locator: {
        kind: 'managed',
        relativePath: 'media/unsaved/image.png',
      },
      importedAt: '2026-08-30T00:00:00.000Z',
      width: 100,
      height: 100,
      orientation: 1,
      defaultStillDurationTicks: 360_000,
    };
    const session = {
      location: { kind: 'capty-package', packagePath },
      linkedPathAuthorization: new Set<string>(),
    };
    getWindowData.mockReturnValue({
      editorVersion: 'v2',
      projectToken: 'token',
      projectSession: session,
      window: {},
    });
    readActiveProject.mockReturnValue(project);

    const result = await handlers.get('editor-v2:media:status')!(
      { sender: { id: 7 } },
      { projectToken: 'token', assetId: 'unsaved' } as never
    );

    expect(readActiveProject).toHaveBeenCalledWith(session);
    expect(result).toEqual({
      status: 'resolved',
      asset: { assetId: 'unsaved', availability: 'missing' },
    });
  });

  it('rejects invalid import policy before opening a file dialog', async () => {
    const session = { location: { kind: 'capty-package' } };
    getWindowData.mockReturnValue({
      editorVersion: 'v2',
      projectToken: 'token',
      projectSession: session,
      window: {},
    });

    const result = await handlers.get('editor-v2:media:import')!(
      { sender: { id: 7 } },
      { projectToken: 'token', policy: 'invalid' } as never
    );

    expect(result).toEqual({
      status: 'failed',
      error: 'Invalid media import policy',
    });
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  it('rejects every media capability from an unregistered sender', async () => {
    const event = { sender: { id: 99 } };
    for (const channel of [
      'editor-v2:media:import',
      'editor-v2:media:status',
      'editor-v2:media:relink',
      'editor-v2:media:reveal',
      'editor-v2:media:remove-managed',
    ]) {
      const result = await handlers.get(channel)!(event, {
        projectToken: 'forged',
        assetId: 'asset',
        policy: 'copy',
        expectedRevision: 1,
      } as never);
      expect(result).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('Unauthorized'),
      });
    }
    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(showItemInFolder).not.toHaveBeenCalled();
  });
});
