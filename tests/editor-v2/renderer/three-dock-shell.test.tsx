import React, { act, useCallback, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { createDefaultEditorWorkspace } from '@/editor-v2/persistence/workspace';
import ThreeDockShell from '@/renderer/editor-v2/shell/three-dock-shell';
import { render, type RenderResult } from '../helpers/render';
import type { EditorV2Workspace } from '@/types/editor-v2';

let rendered: RenderResult | null = null;
const originalWindowHeight = window.innerHeight;

function Harness({ onCommit }: { onCommit: () => void }) {
  const [workspace, setWorkspace] = useState(createDefaultEditorWorkspace);
  const updateWorkspace = useCallback(
    (update: (workspace: EditorV2Workspace) => EditorV2Workspace) => {
      setWorkspace(current => update(current));
    },
    []
  );
  return (
    <ThreeDockShell
      displayName="Project"
      displayPath="/Projects/Project.capty"
      project={createEmptyEditorProject({
        id: 'project',
        name: 'Project',
        createdAt: '2026-08-30T00:00:00.000Z',
        sequenceId: 'sequence',
        videoTrackId: 'video-track',
        audioTrackId: 'audio-track',
      })}
      workspace={workspace}
      canSwitchVersion
      onWorkspaceChange={updateWorkspace}
      onWorkspaceCommit={onCommit}
      onSwitchVersion={() => undefined}
    />
  );
}

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: originalWindowHeight,
  });
});

describe('Three-Dock Precision shell', () => {
  it('mounts one browser, viewer, inspector, and timeline', () => {
    rendered = render(<Harness onCommit={() => undefined} />);
    expect(
      rendered.container.querySelectorAll('[aria-label="Project browser"]')
    ).toHaveLength(1);
    expect(
      rendered.container.querySelectorAll('[aria-label="Viewer"]')
    ).toHaveLength(1);
    expect(
      rendered.container.querySelectorAll('[aria-label="Inspector"]')
    ).toHaveLength(1);
    expect(
      rendered.container.querySelectorAll('[aria-label="Timeline"]')
    ).toHaveLength(1);
  });

  it('collapses and restores each dock while committing workspace changes', () => {
    const onCommit = vi.fn();
    rendered = render(<Harness onCommit={onCommit} />);
    const click = (label: string) => {
      const button = [...rendered!.container.querySelectorAll('button')].find(
        candidate => candidate.textContent?.includes(label)
      );
      expect(button).toBeDefined();
      act(() => button?.click());
    };

    click('Collapse browser');
    click('Collapse inspector');
    click('Collapse timeline');
    expect(
      rendered.container.querySelector('[aria-label="Project browser"]')
    ).toBeNull();
    expect(
      rendered.container.querySelector('[aria-label="Inspector"]')
    ).toBeNull();
    expect(
      rendered.container.querySelector('[aria-label="Timeline"]')
    ).toBeNull();
    expect(onCommit).toHaveBeenCalledTimes(3);

    for (const label of ['Show browser', 'Show inspector', 'Show timeline']) {
      const button = rendered.container.querySelector<HTMLButtonElement>(
        `[aria-label="${label}"]`
      );
      expect(button).not.toBeNull();
      act(() => button?.click());
    }
    expect(
      rendered.container.querySelector('[aria-label="Project browser"]')
    ).not.toBeNull();
    expect(
      rendered.container.querySelector('[aria-label="Inspector"]')
    ).not.toBeNull();
    expect(
      rendered.container.querySelector('[aria-label="Timeline"]')
    ).not.toBeNull();
  });

  it('exposes valued keyboard-operable dock separators', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 750,
    });
    const onCommit = vi.fn();
    rendered = render(<Harness onCommit={onCommit} />);
    const separator = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Resize project browser"]'
    );
    const timelineSeparator = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Resize timeline"]'
    );
    expect(separator?.getAttribute('role')).toBe('separator');
    expect(separator?.getAttribute('aria-valuenow')).toBe('240');
    expect(separator?.getAttribute('aria-valuemin')).toBe('200');
    expect(separator?.getAttribute('aria-valuemax')).toBe('400');
    expect(timelineSeparator?.getAttribute('aria-valuenow')).toBe('260');
    expect(timelineSeparator?.getAttribute('aria-valuemin')).toBe('180');
    expect(timelineSeparator?.getAttribute('aria-valuemax')).toBe('412');
    act(() => {
      separator?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      );
    });
    expect(separator?.getAttribute('aria-valuenow')).toBe('256');
    expect(onCommit).toHaveBeenCalledOnce();
  });
});
