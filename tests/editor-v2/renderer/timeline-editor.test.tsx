import React, { act, useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCommandBindings } from '@/editor-v2/commands/bindings';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { createDefaultEditorWorkspace } from '@/editor-v2/persistence/workspace';
import TimelineEditor from '@/renderer/editor-v2/timeline/timeline-editor';
import EditorProvider from '@/renderer/editor-v2/store/editor-provider';
import { render, type RenderResult } from '../helpers/render';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
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
    effects: [
      {
        id: 'zoom',
        kind: 'zoom',
        enabled: true,
        timeDomain: 'content-timeline',
        range: { start: 90_000, end: 270_000 },
        scale: 2,
        target: 'manual',
        focusX: 0.5,
        focusY: 0.5,
        transitionInTicks: 10_000,
        transitionOutTicks: 10_000,
        followSmoothness: 0.1,
        lookAheadTicks: 0,
      },
    ],
  };
  project.sequence.tracks.video.clipIds.push('clip');
  return project;
};

function Harness({
  onWorkspaceCommit,
  commandBindings = createDefaultCommandBindings('darwin'),
  project = createProject(),
}: {
  onWorkspaceCommit: () => void;
  commandBindings?: ReturnType<typeof createDefaultCommandBindings>;
  project?: EditorProjectV2;
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
    <EditorProvider initialDocument={project}>
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
    readData: vi.fn().mockResolvedValue({
      status: 'failed',
      error: 'No effect data',
    }),
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

  it('expands time-positioned effect lanes and selects their blocks', () => {
    rendered = render(<Harness onWorkspaceCommit={() => undefined} />);
    const toggle = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Expand Still effect lane"]'
    );
    act(() => toggle?.click());

    const lane = rendered.container.querySelector(
      '[aria-label="zoom effect lane for Still"]'
    );
    const effect = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Select zoom effect for Still"]'
    );
    expect(lane).not.toBeNull();
    expect(effect?.getAttribute('style')).toContain('left: 25px');
    expect(effect?.getAttribute('style')).toContain('width: 50px');
    act(() => effect?.click());
    expect(effect?.className).toContain('ring-primary');
  });

  it('shows semantic First Frame before shifted content', () => {
    const project = createProject();
    project.sequence.preRoll = {
      kind: 'output-frame-count',
      assetId: 'image',
      frames: 1,
      fit: 'cover',
    };
    rendered = render(
      <Harness onWorkspaceCommit={() => undefined} project={project} />
    );

    const firstFrame = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Select First Frame pre-roll"]'
    );
    const clip = rendered.container.querySelector<HTMLElement>(
      '[aria-label="Still clip"]'
    );
    expect(firstFrame).not.toBeNull();
    expect(firstFrame?.onpointerdown).toBeNull();
    expect(clip?.getAttribute('style')).toContain('left: 1.666667px');
    act(() => firstFrame?.click());
    expect(firstFrame?.className).toContain('ring-primary');
  });

  it('maps cursor, keyboard, and subtitle data into source-timed lane items', async () => {
    const project = createProject();
    const locator = (kind: string) => ({
      kind: 'v1-read-only' as const,
      relativePath: `${kind}.json`,
      fingerprint: { byteLength: 100, sha256: kind },
    });
    const { enabled: _cursorEnabled, ...cursorStyle } = DEFAULT_CURSOR_STYLE;
    const { visible: _keyboardVisible, ...keyboardStyle } =
      DEFAULT_KEYBOARD_STYLE;
    const { visible: _subtitleVisible, ...subtitleStyle } =
      DEFAULT_SUBTITLE_STYLE;
    project.sequence.clips.clip.effects.push(
      {
        id: 'cursor',
        kind: 'cursor',
        enabled: true,
        timeDomain: 'asset-source',
        data: locator('cursor'),
        style: cursorStyle,
      },
      {
        id: 'keyboard',
        kind: 'keyboard',
        enabled: true,
        timeDomain: 'asset-source',
        data: locator('keyboard'),
        style: keyboardStyle,
        sound: { enabled: false, volume: 1, type: 'cherry-blue' },
      },
      {
        id: 'subtitle',
        kind: 'subtitle',
        enabled: true,
        timeDomain: 'asset-source',
        data: locator('subtitles'),
        style: subtitleStyle,
      }
    );
    vi.mocked(window.editorV2.readData).mockImplementation(async request => {
      if (request.kind === 'cursor') {
        return {
          status: 'loaded',
          data: {
            kind: 'cursor',
            value: {
              recordingArea: { width: 1920, height: 1080 },
              events: [
                { timestamp: 0.25, x: 0.1, y: 0.2, type: 'move' },
                { timestamp: 0.5, x: 0.2, y: 0.3, type: 'move' },
              ],
              meta: {
                startTime: '2026-09-01T00:00:00.000Z',
                duration: 1,
                sampleRate: 60,
              },
            },
          },
        };
      }
      if (request.kind === 'keyboard') {
        return {
          status: 'loaded',
          data: {
            kind: 'keyboard',
            value: {
              events: [
                {
                  timestamp: 0.75,
                  key: 'K',
                  keyCode: 40,
                  modifiers: [],
                  type: 'down',
                },
              ],
              meta: {
                startTime: '2026-09-01T00:00:00.000Z',
                duration: 1,
                sampleRate: 60,
              },
            },
          },
        };
      }
      return {
        status: 'loaded',
        data: {
          kind: 'subtitles',
          value: {
            segments: [{ start: 0.1, end: 0.2, text: 'Timed' }],
            meta: {
              generatedAt: '2026-09-01T00:00:00.000Z',
              language: 'en',
              model: 'imported',
            },
          },
        },
      };
    });
    rendered = render(
      <Harness onWorkspaceCommit={() => undefined} project={project} />
    );
    const toggle = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Expand Still effect lane"]'
    );
    await act(async () => {
      toggle?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const first = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Select cursor effect item 1 for Still"]'
    );
    const second = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Select cursor effect item 2 for Still"]'
    );
    const keyboard = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Select keyboard effect for Still"]'
    );
    const subtitle = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Select subtitle effect for Still"]'
    );
    expect(first?.getAttribute('style')).toContain('left: 25px');
    expect(second?.getAttribute('style')).toContain('left: 50px');
    expect(keyboard?.getAttribute('style')).toContain('left: 75px');
    expect(subtitle?.getAttribute('style')).toContain('left: 10px');
    expect(subtitle?.getAttribute('style')).toContain('width: 10px');
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
