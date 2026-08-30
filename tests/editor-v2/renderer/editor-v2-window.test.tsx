import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { createDefaultEditorWorkspace } from '@/editor-v2/persistence/workspace';
import EditorV2Window from '@/renderer/editor-v2/window/editor-v2-window';
import { render, type RenderResult } from '../helpers/render';
import type {
  EditorV2Bridge,
  EditorV2FlushRequest,
  EditorV2LoadErrorPayload,
  EditorV2LoadPayload,
} from '@/types/editor-v2';

let rendered: RenderResult | null = null;
let loadListener: ((payload: EditorV2LoadPayload) => void) | null = null;
let loadErrorListener: ((payload: EditorV2LoadErrorPayload) => void) | null =
  null;
let flushListener: ((request: EditorV2FlushRequest) => void) | null = null;
const saveProject = vi.fn();
const reloadProject = vi.fn();
const saveProjectCopy = vi.fn();
const saveWorkspace = vi.fn();
const createProject = vi.fn();
const importMedia = vi.fn();
const getMediaStatus = vi.fn();
const relinkMedia = vi.fn();
const revealMedia = vi.fn();
const removeManagedMedia = vi.fn();
const acknowledgeFlush = vi.fn();
const switchVersion = vi.fn();

const payload: EditorV2LoadPayload = {
  projectToken: 'token',
  displayName: 'Project',
  displayPath: '/Projects/Project.capty',
  project: createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video-track',
    audioTrackId: 'audio-track',
  }),
  workspace: createDefaultEditorWorkspace(),
  canSwitchEditorVersion: true,
  requiresProjectCreation: false,
  mediaRecoveryWarnings: [],
};

beforeEach(() => {
  vi.useFakeTimers();
  loadListener = null;
  loadErrorListener = null;
  flushListener = null;
  saveProject.mockResolvedValue({ status: 'saved', revision: 1 });
  reloadProject.mockResolvedValue({ status: 'cancelled' });
  saveProjectCopy.mockResolvedValue({ status: 'cancelled' });
  saveWorkspace.mockResolvedValue({ status: 'saved', revision: 1 });
  createProject.mockResolvedValue({ status: 'cancelled' });
  getMediaStatus.mockResolvedValue({ status: 'failed', error: 'Unavailable' });
  switchVersion.mockResolvedValue({ status: 'switched' });
  const bridge: EditorV2Bridge = {
    onLoad: listener => {
      loadListener = listener;
      return () => {
        loadListener = null;
      };
    },
    onLoadError: listener => {
      loadErrorListener = listener;
      return () => {
        loadErrorListener = null;
      };
    },
    onFlushRequest: listener => {
      flushListener = listener;
      return () => {
        flushListener = null;
      };
    },
    onMutationUnfreeze: () => () => undefined,
    acknowledgeFlush,
    saveProject,
    reloadProject,
    saveProjectCopy,
    createProject,
    saveWorkspace,
    importMedia,
    getMediaStatus,
    relinkMedia,
    revealMedia,
    removeManagedMedia,
    switchVersion,
  };
  window.editorV2 = bridge;
});

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Editor V2 window', () => {
  it('blocks standalone editing until Create Capty Project succeeds', async () => {
    const standalonePayload = {
      ...payload,
      displayName: 'Source',
      displayPath: '/Media/source.mov',
      requiresProjectCreation: true,
    };
    createProject.mockResolvedValue({
      status: 'created',
      project: { ...payload.project, revision: 1 },
      displayName: 'Source',
      displayPath: '/Media/Source.capty',
    });
    rendered = render(<EditorV2Window />);
    act(() => loadListener?.(standalonePayload));
    expect(rendered.container.textContent).toContain(
      'Create a Capty project to continue'
    );
    const create = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent?.includes('Create with Copy')
    );
    await act(async () => {
      create?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectToken: 'token',
        policy: 'copy',
      })
    );
    expect(rendered.container.textContent).not.toContain(
      'Create a Capty project to continue'
    );
    expect(rendered.container.textContent).toContain('/Media/Source.capty');
  });

  it('surfaces managed-media recovery warnings from project open', () => {
    rendered = render(<EditorV2Window />);
    act(() =>
      loadListener?.({
        ...payload,
        mediaRecoveryWarnings: ['Media cleanup will retry after reopen'],
      })
    );

    expect(rendered.container.textContent).toContain(
      'Media cleanup will retry after reopen'
    );
  });

  it('renders project open failures instead of waiting indefinitely', () => {
    rendered = render(<EditorV2Window />);
    act(() => loadErrorListener?.({ error: 'Project is corrupt' }));

    expect(rendered.container.textContent).toContain('Project is corrupt');
    expect(rendered.container.textContent).not.toContain('Opening Editor V2');
  });

  it('loads once and persists dock workspace changes', async () => {
    rendered = render(<EditorV2Window />);
    act(() => loadListener?.(payload));
    const collapse = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent?.includes('Collapse browser')
    );
    act(() => collapse?.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(saveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        projectToken: 'token',
        expectedRevision: 0,
        workspace: expect.objectContaining({
          leftDock: expect.objectContaining({ collapsed: true }),
        }),
      })
    );
  });

  it('waits for an in-flight media import before acknowledging close flush', async () => {
    let resolveImport:
      | ((value: Awaited<ReturnType<EditorV2Bridge['importMedia']>>) => void)
      | null = null;
    importMedia.mockReturnValue(
      new Promise(resolve => {
        resolveImport = resolve;
      })
    );
    rendered = render(<EditorV2Window />);
    act(() => loadListener?.(payload));
    const importButton = [
      ...rendered.container.querySelectorAll('button'),
    ].find(button => button.textContent?.includes('Import'));
    act(() => importButton?.click());
    act(() => flushListener?.({ requestId: 'flush-media' }));
    expect(acknowledgeFlush).not.toHaveBeenCalled();

    await act(async () => {
      resolveImport?.({
        status: 'imported',
        asset: {
          id: 'managed',
          kind: 'image',
          name: 'Managed',
          locator: {
            kind: 'managed',
            relativePath: 'media/managed/image.png',
          },
          importedAt: '2026-08-30T00:00:00.000Z',
          width: 100,
          height: 100,
          orientation: 1,
          defaultStillDurationTicks: 360_000,
        },
        media: { assetId: 'managed', availability: 'available' },
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(saveProject).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({
          assets: expect.objectContaining({ managed: expect.any(Object) }),
        }),
      })
    );
    expect(acknowledgeFlush).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'flush-media', status: 'flushed' })
    );
  });

  it('persists mutations made during an in-flight save before flush acknowledgment', async () => {
    let resolveFirstSave:
      ((value: { status: 'saved'; revision: number }) => void) | null = null;
    const firstSave = new Promise<{ status: 'saved'; revision: number }>(
      resolve => {
        resolveFirstSave = resolve;
      }
    );
    saveWorkspace
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValueOnce({ status: 'saved', revision: 2 });
    rendered = render(<EditorV2Window />);
    act(() => loadListener?.(payload));
    const findButton = (label: string) =>
      [...rendered!.container.querySelectorAll('button')].find(button =>
        button.textContent?.includes(label)
      );
    act(() => findButton('Collapse browser')?.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(saveWorkspace).toHaveBeenCalledOnce();

    act(() => findButton('Collapse inspector')?.click());
    act(() => flushListener?.({ requestId: 'flush-in-flight' }));
    expect(acknowledgeFlush).not.toHaveBeenCalled();
    await act(async () => {
      resolveFirstSave?.({ status: 'saved', revision: 1 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveWorkspace).toHaveBeenCalledTimes(2);
    expect(saveWorkspace.mock.calls[1][0]).toMatchObject({
      expectedRevision: 1,
      workspace: {
        leftDock: expect.objectContaining({ collapsed: true }),
        rightDock: expect.objectContaining({ collapsed: true }),
      },
    });
    expect(acknowledgeFlush).toHaveBeenCalledWith({
      requestId: 'flush-in-flight',
      status: 'flushed',
      projectRevision: 0,
      workspaceRevision: 2,
    });
  });

  it('acknowledges switch flush only after pending workspace persistence', async () => {
    rendered = render(<EditorV2Window />);
    act(() => loadListener?.(payload));
    const collapse = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent?.includes('Collapse browser')
    );
    act(() => collapse?.click());
    await act(async () => {
      flushListener?.({ requestId: 'flush-1' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveWorkspace).toHaveBeenCalledOnce();
    expect(acknowledgeFlush).toHaveBeenCalledWith({
      requestId: 'flush-1',
      status: 'flushed',
      projectRevision: 0,
      workspaceRevision: 1,
    });
  });
});
