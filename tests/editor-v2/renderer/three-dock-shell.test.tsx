import React, { act, useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCommandBindings } from '@/editor-v2/commands/bindings';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { createDefaultEditorWorkspace } from '@/editor-v2/persistence/workspace';
import ThreeDockShell from '@/renderer/editor-v2/shell/three-dock-shell';
import EditorProvider from '@/renderer/editor-v2/store/editor-provider';
import { render, type RenderResult } from '../helpers/render';
import type { EditorV2Workspace } from '@/types/editor-v2';

let rendered: RenderResult | null = null;
const originalWindowHeight = window.innerHeight;
const originalWindowWidth = window.innerWidth;

beforeEach(() => {
  window.editorV2 = {
    getMediaStatus: vi.fn(() => new Promise(() => undefined)),
  } as unknown as Window['editorV2'];
});

function Harness({ onCommit }: { onCommit: () => void }) {
  const [workspace, setWorkspace] = useState(createDefaultEditorWorkspace);
  const updateWorkspace = useCallback(
    (update: (workspace: EditorV2Workspace) => EditorV2Workspace) => {
      setWorkspace(current => update(current));
    },
    []
  );
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video-track',
    audioTrackId: 'audio-track',
  });
  project.assets.image = {
    id: 'image',
    kind: 'image',
    name: 'Still',
    locator: { kind: 'managed', relativePath: 'media/image/still.png' },
    importedAt: '2026-08-30T00:00:00.000Z',
    width: 1920,
    height: 1080,
    orientation: 1,
    defaultStillDurationTicks: 12_000,
  };
  project.sequence.clips.clip = {
    id: 'clip',
    kind: 'image',
    trackId: 'video-track',
    assetId: 'image',
    name: 'Still',
    timelineStart: 0,
    timelineDuration: 12_000,
    sourceStart: 0,
    sourceDuration: 12_000,
    playbackRate: { numerator: 1, denominator: 1 },
    effects: [],
  };
  project.sequence.tracks['video-track'].clipIds.push('clip');
  return (
    <EditorProvider initialDocument={project}>
      <ThreeDockShell
        displayName="Project"
        displayPath="/Projects/Project.capty"
        projectToken="token"
        project={project}
        workspace={workspace}
        commandBindings={createDefaultCommandBindings('darwin').map(binding => {
          if (binding.commandId === 'workspace.toggle-browser') {
            return { ...binding, chord: 'Meta+9' };
          }
          if (binding.commandId === 'track.toggle-lock') {
            return { ...binding, chord: 'Alt+L' };
          }
          return binding;
        })}
        canSwitchVersion
        onWorkspaceChange={updateWorkspace}
        onWorkspaceCommit={onCommit}
        onRemoveManaged={async () => undefined}
        onMediaOperationStart={() => () => undefined}
        operationsFrozen={false}
        onSwitchVersion={() => undefined}
      />
    </EditorProvider>
  );
}

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: originalWindowHeight,
  });
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: originalWindowWidth,
  });
});

describe('Three-Dock Precision shell', () => {
  it('mounts one browser, viewer, inspector, and timeline', async () => {
    rendered = render(<Harness onCommit={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
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

  it('cycles visible regions with F6 and restores focus after collapse', async () => {
    rendered = render(<Harness onCommit={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const title = rendered.container.querySelector<HTMLElement>(
      '[data-workspace-region="title"]'
    );
    act(() => title?.focus());
    act(() =>
      title?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F6', bubbles: true })
      )
    );
    expect(
      (document.activeElement as HTMLElement | null)?.dataset.workspaceRegion
    ).toBe('browser');
    act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F6', bubbles: true })
      )
    );
    expect(
      (document.activeElement as HTMLElement | null)?.dataset.workspaceRegion
    ).toBe('viewer');
    expect(document.activeElement?.getAttribute('role')).toBe('region');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Viewer workspace region'
    );
    expect((document.activeElement as HTMLElement).className).toContain(
      'focus-visible:ring-2'
    );

    const collapse = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent?.includes('Collapse browser')
    );
    await act(async () => {
      collapse?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      (document.activeElement as HTMLElement | null)?.dataset.workspaceRegion
    ).toBe('title');
    const show = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Show browser"]'
    );
    await act(async () => {
      show?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      (document.activeElement as HTMLElement | null)?.dataset.workspaceRegion
    ).toBe('browser');
  });

  it('opens catalog-driven menus, palette, and shortcut sheet', async () => {
    rendered = render(<Harness onCommit={() => undefined} />);
    const commands = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent?.includes('Commands')
    );
    act(() => commands?.click());
    expect(document.body.textContent).toContain('Editor Commands');
    expect(
      document.body
        .querySelector('[data-slot="dialog-content"]')
        ?.className.includes('motion-reduce:duration-0')
    ).toBe(true);
    const toggleBrowser = [...document.body.querySelectorAll('button')].find(
      button => button.textContent?.includes('Toggle Browser')
    );
    await act(async () => {
      toggleBrowser?.click();
      await Promise.resolve();
    });
    expect(
      rendered.container.querySelector('[aria-label="Project browser"]')
    ).toBeNull();
    expect(rendered.container.textContent).toContain(
      'Toggle Browser completed'
    );

    const root = rendered.container.firstElementChild;
    act(() =>
      root?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'p',
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        })
      )
    );
    expect(document.body.textContent).toContain('Command Palette');
    const close = document.body.querySelector<HTMLButtonElement>(
      '[data-slot="dialog-close"]'
    );
    act(() => close?.click());
    act(() =>
      root?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '/',
          metaKey: true,
          bubbles: true,
        })
      )
    );
    expect(document.body.textContent).toContain('Editor V2 Shortcuts');
  });

  it('routes viewer commands through keyboard and command-menu consumers', async () => {
    class TestAudioContext {
      currentTime = 0;
      sampleRate = 48_000;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal('AudioContext', TestAudioContext);
    rendered = render(<Harness onCommit={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const root = rendered.container.firstElementChild;
    await act(async () => {
      root?.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true })
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      rendered.container.querySelector('[aria-label="Pause"]')
    ).not.toBeNull();

    const commands = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Editor commands"]'
    );
    act(() => commands?.click());
    const playback = [...document.body.querySelectorAll('button')].find(
      button => button.textContent?.includes('Play or Pause')
    );
    expect(playback?.disabled).toBe(false);
    await act(async () => {
      playback?.click();
      await Promise.resolve();
    });
    expect(
      rendered.container.querySelector('[aria-label="Play"]')
    ).not.toBeNull();
  });

  it('exposes valued keyboard-operable dock separators', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 750,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1200,
    });
    const onCommit = vi.fn();
    rendered = render(<Harness onCommit={onCommit} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      rendered.container.querySelector('[aria-label="Editor commands"]')
    ).not.toBeNull();
    expect(
      [...rendered.container.querySelectorAll('button')].find(button =>
        button.textContent?.includes('Collapse browser')
      )?.title
    ).toBe('Toggle Browser (⌘ 9)');
    expect(
      rendered.container.querySelector<HTMLButtonElement>(
        '[aria-label="Lock Video 1"]'
      )?.title
    ).toBe('Toggle Track Lock (⌥ L)');
    const separator = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Resize project browser"]'
    );
    const timelineSeparator = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Resize timeline"]'
    );
    expect(separator?.getAttribute('role')).toBe('separator');
    expect(separator?.className).toContain('focus-visible:ring-2');
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
    act(() => {
      separator?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true })
      );
    });
    expect(separator?.getAttribute('aria-valuenow')).toBe('400');
    act(() => {
      separator?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
      );
    });
    expect(separator?.getAttribute('aria-valuenow')).toBe('200');
    expect(separator?.getAttribute('aria-valuetext')).toBe('200 pixels');
    expect(onCommit).toHaveBeenCalledTimes(3);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });
});
