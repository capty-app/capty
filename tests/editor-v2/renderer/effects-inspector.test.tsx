import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import EffectsBrowser from '@/renderer/editor-v2/effects/effects-browser';
import SelectionInspector from '@/renderer/editor-v2/inspector/selection-inspector';
import EditorProvider from '@/renderer/editor-v2/store/editor-provider';
import { ProjectDataMutationProvider } from '@/renderer/editor-v2/store/project-data-mutation-context';
import { useEditorStore } from '@/renderer/editor-v2/store/use-editor-store';
import { render, type RenderResult } from '../helpers/render';
import type { EditorProjectV2 } from '@/types/editor-v2';

let rendered: RenderResult | null = null;

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Effects',
    createdAt: '2026-09-01T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.image = {
    id: 'image',
    kind: 'image',
    name: 'Image',
    locator: { kind: 'managed', relativePath: 'media/image/image.png' },
    importedAt: '2026-09-01T00:00:00.000Z',
    width: 1920,
    height: 1080,
    orientation: 1,
    defaultStillDurationTicks: 180_000,
  };
  project.sequence.clips.clip = {
    id: 'clip',
    kind: 'image',
    trackId: 'video',
    assetId: 'image',
    name: 'Image',
    timelineStart: 0,
    timelineDuration: 180_000,
    sourceStart: 0,
    sourceDuration: 180_000,
    playbackRate: { numerator: 1, denominator: 1 },
    effects: [],
  };
  project.sequence.tracks.video.clipIds.push('clip');
  return project;
};

const createCursorProject = (): EditorProjectV2 => {
  const project = createProject();
  const locator = {
    kind: 'v1-read-only' as const,
    relativePath: 'cursor.json',
    fingerprint: { byteLength: 100, sha256: 'cursor' },
  };
  project.assets.image = {
    id: 'image',
    kind: 'capty-recording',
    name: 'Recording',
    locator: {
      kind: 'legacy-package-read-only',
      relativePath: 'recording.mov',
      fingerprint: { byteLength: 100, sha256: 'recording' },
    },
    importedAt: '2026-09-01T00:00:00.000Z',
    durationTicks: 180_000,
    width: 1920,
    height: 1080,
    frameRate: { numerator: 30, denominator: 1 },
    videoStreams: [],
    audioStreams: [],
    sources: { cursor: { locator, recordingOffsetTicks: 0 } },
  };
  project.sequence.clips.clip = {
    ...project.sequence.clips.clip,
    kind: 'video',
    sourceStreamId: 'screen',
    effects: [
      {
        id: 'cursor-effect',
        kind: 'cursor',
        enabled: true,
        timeDomain: 'asset-source',
        data: locator,
        style: {
          size: 200,
          color: '#000000',
          borderColor: '#ffffff',
          borderWidth: 2,
          smoothing: 0.5,
          showClickHighlight: true,
          clickHighlightColor: 'rgba(255, 200, 0, 0.5)',
          clickHighlightRadius: 30,
          clickHighlightDuration: 15,
          hideOnIdle: false,
          hideOnIdleTimeout: 2,
          showTrail: false,
          trailLength: 10,
          trailOpacityDecay: 0.8,
          motionBlur: true,
          motionBlurStrength: 0.5,
        },
      },
    ],
  };
  return project;
};

function Harness() {
  const store = useEditorStore();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          store.setSelection({
            kind: 'clips',
            clipIds: ['clip'],
            primaryClipId: 'clip',
          })
        }
      >
        Select Clip
      </button>
      <button
        type="button"
        onClick={() => store.setSelection({ kind: 'asset', assetId: 'image' })}
      >
        Select Asset
      </button>
      <ProjectDataMutationProvider
        value={async operation => {
          const result = await operation(store.document.revision);
          if (result.status === 'updated')
            store.replaceFromDisk(result.project);
          return result;
        }}
      >
        <EffectsBrowser projectToken="token" />
        <SelectionInspector projectToken="token" />
      </ProjectDataMutationProvider>
    </div>
  );
}

beforeEach(() => {
  window.editorV2 = {
    readData: vi.fn(),
    writeData: vi.fn(),
    deleteData: vi.fn(),
    resetData: vi.fn(),
    importCursor: vi.fn(),
    importSubtitles: vi.fn(),
    generateSubtitles: vi.fn(),
  } as unknown as Window['editorV2'];
});

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
});

describe('Editor V2 effects and inspector', () => {
  it('searches, adds, selects, edits, and removes clip effects through commands', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    const buttons = () => [...rendered!.container.querySelectorAll('button')];
    act(() =>
      buttons()
        .find(button => button.textContent === 'Select Clip')
        ?.click()
    );
    const search = rendered.container.querySelector<HTMLInputElement>(
      '[placeholder="Search effects"]'
    );
    act(() => {
      if (!search) return;
      search.value = 'Transform';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() =>
      buttons()
        .find(button => button.textContent?.includes('Transform & Crop'))
        ?.click()
    );

    expect(rendered.container.textContent).toContain('Clip effect');
    const position = rendered.container.querySelector<HTMLInputElement>(
      '[aria-label="Position X"]'
    );
    act(() => {
      if (!position) return;
      position.value = '120';
      position.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(position?.value).toBe('120');

    act(() =>
      buttons()
        .find(button => button.textContent?.includes('Remove effect'))
        ?.click()
    );
    expect(rendered.container.textContent).toContain('Nothing selected');
  });

  it('adds a sequence drawing effect without a selected clip', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    const drawing = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent?.includes('Drawing & Redaction')
    );
    act(() => drawing?.click());
    expect(rendered.container.textContent).toContain('Canvas effect');
    expect(rendered.container.textContent).toContain(
      'Use direct manipulation in the viewer'
    );
  });

  it('configures canvas settings through the sequence inspector', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    const canvasSettings = [
      ...rendered.container.querySelectorAll('button'),
    ].find(button => button.textContent?.includes('Canvas & Aspect'));
    act(() => canvasSettings?.click());

    expect(
      rendered.container.querySelector('[aria-label="Canvas Width"]')
    ).not.toBeNull();
    expect(
      rendered.container.querySelector('[aria-label="Aspect Ratio"]')
    ).not.toBeNull();
    expect(
      rendered.container.querySelector('[aria-label="Canvas Color"]')
    ).not.toBeNull();
  });

  it('uses and removes an image asset as semantic First Frame', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    const buttons = () => [...rendered!.container.querySelectorAll('button')];
    act(() =>
      buttons()
        .find(button => button.textContent === 'Select Asset')
        ?.click()
    );
    act(() =>
      buttons()
        .find(button => button.textContent?.includes('Use as First Frame'))
        ?.click()
    );

    expect(rendered.container.textContent).toContain(
      'This image is semantic output pre-roll.'
    );
    expect(rendered.container.textContent).toContain(
      'Fixed to one frame at the active frame rate.'
    );
    act(() =>
      buttons()
        .find(button => button.textContent?.includes('Remove First Frame'))
        ?.click()
    );
    expect(rendered.container.textContent).toContain('Use as First Frame');
  });

  it('loads, edits, and saves cursor data through copy-on-write', async () => {
    const project = createCursorProject();
    const cursorData = {
      recordingArea: { width: 1920, height: 1080 },
      events: [{ timestamp: 0, x: 0.1, y: 0.2, type: 'move' as const }],
      meta: {
        startTime: '2026-09-01T00:00:00.000Z',
        duration: 1,
        sampleRate: 60,
      },
    };
    vi.mocked(window.editorV2.readData).mockResolvedValue({
      status: 'loaded',
      data: { kind: 'cursor', value: cursorData },
    });
    vi.mocked(window.editorV2.writeData).mockResolvedValue({
      status: 'updated',
      project: { ...project, revision: 1 },
      revision: 1,
    });
    rendered = render(
      <EditorProvider initialDocument={project}>
        <Harness />
      </EditorProvider>
    );
    const buttons = () => [...rendered!.container.querySelectorAll('button')];
    act(() =>
      buttons()
        .find(button => button.textContent === 'Select Clip')
        ?.click()
    );
    act(() =>
      buttons()
        .find(button => button.textContent?.trim() === 'cursor')
        ?.click()
    );
    await act(async () => {
      buttons()
        .find(button => button.textContent === 'Load')
        ?.click();
      await Promise.resolve();
    });
    const firstX = rendered.container.querySelector<HTMLInputElement>(
      '[aria-label="First Event X"]'
    );
    act(() => {
      if (!firstX) return;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set;
      valueSetter?.call(firstX, '0.15');
      firstX.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      buttons()
        .find(button => button.textContent === 'Save Copy')
        ?.click();
      await Promise.resolve();
    });

    expect(window.editorV2.writeData).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'image',
        kind: 'cursor',
        value: expect.objectContaining({
          value: expect.objectContaining({
            events: [expect.objectContaining({ x: 0.15 })],
          }),
        }),
      })
    );
  });

  it('imports cursor data through the dedicated V2 capability', async () => {
    const project = createCursorProject();
    vi.mocked(window.editorV2.importCursor).mockResolvedValue({
      status: 'updated',
      project: { ...project, revision: 1 },
      revision: 1,
    });
    rendered = render(
      <EditorProvider initialDocument={project}>
        <Harness />
      </EditorProvider>
    );
    const buttons = () => [...rendered!.container.querySelectorAll('button')];
    act(() =>
      buttons()
        .find(button => button.textContent === 'Select Clip')
        ?.click()
    );
    act(() =>
      buttons()
        .find(button => button.textContent?.trim() === 'cursor')
        ?.click()
    );
    await act(async () => {
      buttons()
        .find(button => button.textContent === 'Import Cursor')
        ?.click();
      await Promise.resolve();
    });

    expect(window.editorV2.importCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        projectToken: 'token',
        expectedRevision: 0,
        assetId: 'image',
        kind: 'cursor',
      })
    );
  });
});
