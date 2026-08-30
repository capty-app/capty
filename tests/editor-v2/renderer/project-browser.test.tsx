import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import ProjectBrowser from '@/renderer/editor-v2/media/project-browser';
import EditorProvider from '@/renderer/editor-v2/store/editor-provider';
import { useEditorStore } from '@/renderer/editor-v2/store/use-editor-store';
import { render, type RenderResult } from '../helpers/render';
import type { EditorProjectV2, ImageMediaAsset } from '@/types/editor-v2';

let rendered: RenderResult | null = null;
const importMedia = vi.fn();
const getMediaStatus = vi.fn();
const relinkMedia = vi.fn();
const revealMedia = vi.fn();
const onRemoveManaged = vi.fn();

const linkedAsset: ImageMediaAsset = {
  id: 'linked',
  kind: 'image',
  name: 'Linked Image',
  locator: {
    kind: 'linked',
    absolutePath: '/Media/linked.png',
    fingerprint: { byteLength: 10, sha256: 'linked' },
  },
  importedAt: '2026-08-30T00:00:00.000Z',
  width: 100,
  height: 100,
  orientation: 1,
  defaultStillDurationTicks: 100,
};

const managedAsset: ImageMediaAsset = {
  ...linkedAsset,
  id: 'managed',
  name: 'Managed Image',
  locator: {
    kind: 'managed',
    relativePath: 'media/managed/image.png',
  },
};

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.linked = linkedAsset;
  project.assets.managed = managedAsset;
  return project;
};

function Harness() {
  const store = useEditorStore();
  return (
    <>
      <ProjectBrowser
        projectToken="token"
        onRemoveManaged={onRemoveManaged}
        onMediaOperationStart={() => () => undefined}
        operationsFrozen={false}
      />
      <button onClick={store.undo}>Undo</button>
    </>
  );
}

beforeEach(() => {
  getMediaStatus.mockImplementation(async ({ assetId }) => ({
    status: 'resolved',
    asset: {
      assetId,
      availability: assetId === 'linked' ? 'missing' : 'available',
    },
  }));
  revealMedia.mockResolvedValue({ status: 'revealed' });
  window.editorV2 = {
    importMedia,
    getMediaStatus,
    relinkMedia,
    revealMedia,
  } as unknown as Window['editorV2'];
});

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
  vi.clearAllMocks();
});

const click = async (label: string) => {
  const button = [...rendered!.container.querySelectorAll('button')].find(
    candidate =>
      candidate.textContent?.includes(label) ||
      candidate.getAttribute('aria-label')?.includes(label)
  );
  expect(button).toBeDefined();
  await act(async () => {
    button?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('Editor V2 project browser', () => {
  it('imports managed copies by default and keeps link in place explicit', async () => {
    const imported = { ...managedAsset, id: 'imported', name: 'Imported' };
    importMedia.mockResolvedValue({
      status: 'imported',
      asset: imported,
      media: { assetId: imported.id, availability: 'available' },
    });
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );

    await click('Import');
    expect(importMedia).toHaveBeenCalledWith({
      projectToken: 'token',
      policy: 'copy',
    });
    expect(rendered.container.textContent).toContain('Imported');
    await click('Undo');
    expect(rendered.container.textContent).toContain('Imported');

    await click('Link in Place');
    expect(importMedia).toHaveBeenLastCalledWith({
      projectToken: 'token',
      policy: 'link',
    });
  });

  it('removes linked references through undo and delegates managed deletion', async () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await click('Remove Linked Image');
    expect(rendered.container.textContent).not.toContain('Linked Image');
    await click('Undo');
    expect(rendered.container.textContent).toContain('Linked Image');

    await click('Remove Managed Image');
    expect(onRemoveManaged).toHaveBeenCalledWith('managed');
  });

  it('surfaces thumbnail and waveform cache warnings', async () => {
    getMediaStatus.mockImplementation(async ({ assetId }) => ({
      status: 'resolved',
      asset: {
        assetId,
        availability: 'available',
        cacheWarning:
          assetId === 'managed' ? 'Thumbnail generation failed' : undefined,
      },
    }));
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rendered.container.textContent).toContain(
      'Thumbnail generation failed'
    );
  });

  it('blocks overlapping media mutations while managed removal is pending', async () => {
    let finishRemoval: (() => void) | null = null;
    onRemoveManaged.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishRemoval = resolve;
        })
    );
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await click('Remove Managed Image');
    const importButton = [
      ...rendered.container.querySelectorAll('button'),
    ].find(button => button.textContent?.includes('Import'));
    const linkedRemoveButton = [
      ...rendered.container.querySelectorAll('button'),
    ].find(button =>
      button.getAttribute('aria-label')?.includes('Remove Linked Image')
    );
    const managedRemoveButton = [
      ...rendered.container.querySelectorAll('button'),
    ].find(button =>
      button.getAttribute('aria-label')?.includes('Remove Managed Image')
    );
    expect(importButton?.disabled).toBe(true);
    expect(linkedRemoveButton?.disabled).toBe(true);
    expect(managedRemoveButton?.disabled).toBe(true);
    act(() => {
      importButton?.click();
      linkedRemoveButton?.click();
      managedRemoveButton?.click();
    });
    expect(importMedia).not.toHaveBeenCalled();
    expect(onRemoveManaged).toHaveBeenCalledOnce();

    await act(async () => {
      finishRemoval?.();
      await Promise.resolve();
    });
    expect(importButton?.disabled).toBe(false);
  });

  it('relinks missing media and reveals assets without exposing paths', async () => {
    relinkMedia.mockResolvedValue({
      status: 'relinked',
      asset: {
        ...linkedAsset,
        locator: {
          kind: 'linked',
          absolutePath: '/Media/relinked.png',
          fingerprint: { byteLength: 20, sha256: 'relinked' },
        },
      },
      media: { assetId: 'linked', availability: 'available' },
    });
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await click('Relink Linked Image');
    expect(relinkMedia).toHaveBeenCalledWith({
      projectToken: 'token',
      assetId: 'linked',
    });
    await click('Reveal Linked Image');
    expect(revealMedia).toHaveBeenCalledWith({
      projectToken: 'token',
      assetId: 'linked',
    });
    expect(rendered.container.textContent).not.toContain('/Media/');
  });
});
