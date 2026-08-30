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
const saveWorkspace = vi.fn();
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
};

beforeEach(() => {
  vi.useFakeTimers();
  loadListener = null;
  loadErrorListener = null;
  flushListener = null;
  saveWorkspace.mockResolvedValue({ status: 'saved', revision: 1 });
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
    acknowledgeFlush,
    saveWorkspace,
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
