import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EditorProvider from '@/renderer/editor-v2/store/editor-provider';
import { useEditorAutosave } from '@/renderer/editor-v2/store/use-autosave';
import { useEditorStore } from '@/renderer/editor-v2/store/use-editor-store';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { render, type RenderResult } from '../../helpers/render';
import type { EditorCommand } from '@/editor-v2/commands/command';

let rendered: RenderResult | null = null;
const saveProject = vi.fn();

const createProject = () =>
  createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });

const renameCommand = (name: string): EditorCommand => ({
  id: 'project.rename',
  label: 'Rename project',
  apply(document) {
    const previousName = document.name;
    return {
      document: { ...document, name },
      affectedIds: [document.id],
      inverse: renameCommand(previousName),
    };
  },
});

function StoreHarness({ autosave = false }: { autosave?: boolean }) {
  const store = useEditorStore();
  const autosaveQueue = useEditorAutosave('token');
  return (
    <div>
      <span
        data-state
      >{`${store.document.name}:${store.mutationRevision}:${store.persistedMutationRevision}`}</span>
      <button onClick={() => store.execute(renameCommand('One'))}>One</button>
      <button
        onClick={() => {
          store.execute(renameCommand('Two'));
          store.execute(renameCommand('Three'));
        }}
      >
        Sequential
      </button>
      <button onClick={store.undo}>Undo</button>
      <button onClick={store.redo}>Redo</button>
      <button onClick={store.freeze}>Freeze</button>
      <button
        onClick={() => {
          store.beginTransaction();
          store.previewTransaction(renameCommand('Preview'));
        }}
      >
        Preview
      </button>
      <button onClick={() => store.commitTransaction('rename', 'Rename')}>
        Commit
      </button>
      <button onClick={store.cancelTransaction}>Cancel Transaction</button>
      <button
        disabled={!autosave}
        onClick={() => void autosaveQueue.flushProject()}
      >
        Flush
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  saveProject.mockResolvedValue({ status: 'saved', revision: 1 });
  window.editorV2 = {
    saveProject,
  } as unknown as Window['editorV2'];
});

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

const text = () =>
  rendered!.container.querySelector('[data-state]')!.textContent;
const click = (label: string) => {
  const button = [...rendered!.container.querySelectorAll('button')].find(
    candidate => candidate.textContent === label
  );
  act(() => button?.click());
};

describe('Editor V2 root store', () => {
  it('applies synchronous commands against the latest whole document', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <StoreHarness />
      </EditorProvider>
    );
    click('Sequential');
    expect(text()).toBe('Three:2:0');
    click('Undo');
    expect(text()).toBe('Two:3:0');
    click('Undo');
    expect(text()).toBe('Project:4:0');
    click('Redo');
    expect(text()).toBe('Two:5:0');
  });

  it('previews transactions without autosave and commits one history entry', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <StoreHarness />
      </EditorProvider>
    );
    click('Preview');
    expect(text()).toBe('Preview:0:0');
    click('Commit');
    expect(text()).toBe('Preview:1:0');
    click('Undo');
    expect(text()).toBe('Project:2:0');

    click('Preview');
    click('Cancel Transaction');
    expect(text()).toBe('Project:2:0');
  });

  it('freezes mutation dispatch during close flushing', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <StoreHarness />
      </EditorProvider>
    );
    click('Freeze');
    click('One');
    expect(text()).toBe('Project:0:0');
  });

  it('serializes a mutation queued during an active project save', async () => {
    let resolveFirst:
      ((result: { status: 'saved'; revision: number }) => void) | undefined;
    saveProject
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ status: 'saved', revision: 2 });
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <StoreHarness autosave />
      </EditorProvider>
    );
    click('One');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(saveProject).toHaveBeenCalledOnce();
    click('Sequential');
    await act(async () => {
      resolveFirst?.({ status: 'saved', revision: 1 });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveProject).toHaveBeenCalledTimes(2);
    expect(saveProject.mock.calls[1][0]).toMatchObject({
      expectedRevision: 1,
      project: { name: 'Three' },
    });
  });

  it('surfaces stale saves without advancing persisted mutations', async () => {
    saveProject.mockResolvedValueOnce({ status: 'stale', diskRevision: 9 });
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <StoreHarness autosave />
      </EditorProvider>
    );
    click('One');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    expect(text()).toBe('One:1:0');
  });
});
