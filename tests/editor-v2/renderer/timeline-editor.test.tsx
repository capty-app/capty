import React, { act, useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCommandBindings } from '@/editor-v2/commands/bindings';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { createDefaultEditorWorkspace } from '@/editor-v2/persistence/workspace';
import TimelineEditor from '@/renderer/editor-v2/timeline/timeline-editor';
import EditorProvider from '@/renderer/editor-v2/store/editor-provider';
import { render, type RenderResult } from '../helpers/render';
import type { EditorProjectV2, EditorV2Workspace } from '@/types/editor-v2';

let rendered: RenderResult | null = null;

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Timeline',
    createdAt: '2026-09-01T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.image = {
    id: 'image',
    kind: 'image',
    name: 'Still',
    locator: { kind: 'managed', relativePath: 'media/image/still.png' },
    importedAt: '2026-09-01T00:00:00.000Z',
    width: 100,
    height: 100,
    orientation: 1,
    defaultStillDurationTicks: 360_000,
  };
  project.sequence.clips.clip = {
    id: 'clip',
    kind: 'image',
    trackId: 'video',
    assetId: 'image',
    name: 'Still',
    timelineStart: 0,
    timelineDuration: 360_000,
    sourceStart: 0,
    sourceDuration: 360_000,
    playbackRate: { numerator: 1, denominator: 1 },
    effects: [],
  };
  project.sequence.tracks.video.clipIds.push('clip');
  return project;
};

function Harness({
  onWorkspaceCommit,
  commandBindings = createDefaultCommandBindings('darwin'),
}: {
  onWorkspaceCommit: () => void;
  commandBindings?: ReturnType<typeof createDefaultCommandBindings>;
}) {
  const [workspace, setWorkspace] = useState(createDefaultEditorWorkspace);
  const [playheadTick, setPlayheadTick] = useState(180_000);
  const updateWorkspace = useCallback(
    (update: (workspace: EditorV2Workspace) => EditorV2Workspace) => {
      setWorkspace(current => update(current));
    },
    []
  );
  return (
    <EditorProvider initialDocument={createProject()}>
      <TimelineEditor
        projectToken="token"
        workspace={workspace}
        commandBindings={commandBindings}
        playheadTick={playheadTick}
        onPlayheadChange={setPlayheadTick}
        onWorkspaceChange={updateWorkspace}
        onWorkspaceCommit={onWorkspaceCommit}
        onCollapse={() => undefined}
      />
    </EditorProvider>
  );
}

beforeEach(() => {
  window.editorV2 = {
    getMediaStatus: vi.fn(() => new Promise(() => undefined)),
  } as unknown as Window['editorV2'];
});

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
});

describe('Editor V2 timeline', () => {
  it('adds arbitrary tracks and changes track output state', () => {
    rendered = render(<Harness onWorkspaceCommit={() => undefined} />);
    const addVideo = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Add video track"]'
    );
    act(() => addVideo?.click());
    expect(rendered.container.textContent).toContain('Video 2');

    const hideVideo = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Disable Video 1 output"]'
    );
    act(() => hideVideo?.click());
    expect(
      rendered.container.querySelector('[aria-label="Enable Video 1 output"]')
    ).not.toBeNull();
  });

  it('routes Ripple, delete, and undo keyboard equivalents through the registry', () => {
    const onWorkspaceCommit = vi.fn();
    rendered = render(<Harness onWorkspaceCommit={onWorkspaceCommit} />);
    const timeline = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Timeline"]'
    );
    const clip = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Still clip"]'
    );
    act(() => clip?.click());
    act(() => {
      timeline?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'r', bubbles: true })
      );
    });
    expect(
      rendered.container.querySelector('[aria-pressed="true"]')?.textContent
    ).toContain('Ripple');
    expect(onWorkspaceCommit).toHaveBeenCalled();

    act(() => {
      timeline?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })
      );
    });
    expect(
      rendered.container.querySelector('[aria-label="Still clip"]')
    ).toBeNull();
    act(() => {
      timeline?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          metaKey: true,
          bubbles: true,
        })
      );
    });
    expect(
      rendered.container.querySelector('[aria-label="Still clip"]')
    ).not.toBeNull();
  });

  it('uses configured bindings instead of replaced catalog defaults', () => {
    const bindings = createDefaultCommandBindings('darwin').map(binding =>
      binding.commandId === 'edit.toggle-ripple'
        ? { ...binding, chord: 'G' }
        : binding
    );
    rendered = render(
      <Harness onWorkspaceCommit={() => undefined} commandBindings={bindings} />
    );
    const timeline = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Timeline"]'
    );
    const ripple = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent?.includes('Ripple')
    );
    act(() => {
      timeline?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'r', bubbles: true })
      );
    });
    expect(ripple?.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      timeline?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'g', bubbles: true })
      );
    });
    expect(ripple?.getAttribute('aria-pressed')).toBe('true');
  });

  it('seeks from the ruler and exposes a draggable playhead', () => {
    rendered = render(<Harness onWorkspaceCommit={() => undefined} />);
    const ruler = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Timeline ruler"]'
    );
    const playhead = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Timeline playhead"]'
    );
    expect(ruler?.getAttribute('role')).toBe('slider');
    expect(playhead).not.toBeNull();
    act(() => {
      ruler?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true })
      );
    });
    expect(playhead?.getAttribute('style')).toContain('left: 500px');
  });
});
