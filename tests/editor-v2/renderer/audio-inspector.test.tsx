import React, { act } from 'react';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import SelectionInspector from '@/renderer/editor-v2/inspector/selection-inspector';
import EditorProvider from '@/renderer/editor-v2/store/editor-provider';
import { useEditorStore } from '@/renderer/editor-v2/store/use-editor-store';
import { render, type RenderResult } from '../helpers/render';
import type { EditorProjectV2 } from '@/types/editor-v2';

let rendered: RenderResult | null = null;

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Audio inspector',
    createdAt: '2026-09-01T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.audio = {
    id: 'asset',
    kind: 'audio',
    name: 'Audio',
    locator: { kind: 'managed', relativePath: 'media/audio.wav' },
    importedAt: '2026-09-01T00:00:00.000Z',
    durationTicks: 48_000,
    channels: 2,
    sampleRate: 48_000,
    audioStreams: [
      {
        id: 'stream',
        codec: 'pcm_s16le',
        durationTicks: 48_000,
        channels: 2,
        sampleRate: 48_000,
      },
    ],
  };
  project.sequence.clips.clip = {
    id: 'clip',
    kind: 'audio',
    trackId: 'audio',
    assetId: 'asset',
    name: 'Audio',
    timelineStart: 0,
    timelineDuration: 48_000,
    sourceStart: 0,
    sourceDuration: 48_000,
    playbackRate: { numerator: 1, denominator: 1 },
    sourceStreamId: 'stream',
    linkedGroupId: 'group',
    gain: 1,
    fadeInTicks: 0,
    fadeOutTicks: 0,
    effects: [],
  };
  project.sequence.tracks.audio.clipIds.push('clip');
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
        Select clip
      </button>
      <button
        type="button"
        onClick={() => store.setSelection({ kind: 'track', trackId: 'audio' })}
      >
        Select track
      </button>
      <SelectionInspector projectToken="token" />
    </div>
  );
}

const change = (label: string, value: string) => {
  const input = rendered?.container.querySelector<HTMLInputElement>(
    `[aria-label="${label}"]`
  );
  act(() => {
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return rendered?.container.querySelector<HTMLInputElement>(
    `[aria-label="${label}"]`
  );
};

describe('audio inspectors', () => {
  afterEach(() => {
    rendered?.unmount();
    rendered?.container.remove();
    rendered = null;
  });

  it('updates audio clip gain and fades through commands', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    act(() =>
      [...rendered!.container.querySelectorAll('button')]
        .find(button => button.textContent === 'Select clip')
        ?.click()
    );

    expect(
      rendered.container.querySelector('[aria-label="Audio clip"]')
    ).not.toBeNull();
    expect(change('Clip gain', '0.6')?.value).toBe('0.6');
    expect(change('Fade in', '0.05')?.value).toBe('0.05');
    expect(change('Fade out', '0.1')?.value).toBe('0.1');
  });

  it('updates track gain, mute, and solo through commands', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    act(() =>
      [...rendered!.container.querySelectorAll('button')]
        .find(button => button.textContent === 'Select track')
        ?.click()
    );

    expect(
      rendered.container.querySelector('[aria-label="Audio track"]')
    ).not.toBeNull();
    expect(change('Track gain', '0.75')?.value).toBe('0.75');
    const muted = rendered.container.querySelector<HTMLInputElement>(
      '[aria-label="Muted"]'
    );
    act(() => {
      if (!muted) return;
      muted.checked = true;
      muted.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const currentSolo = rendered.container.querySelector<HTMLInputElement>(
      '[aria-label="Solo"]'
    );
    act(() => {
      if (!currentSolo) return;
      currentSolo.checked = true;
      currentSolo.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(
      rendered.container.querySelector<HTMLInputElement>('[aria-label="Muted"]')
        ?.checked
    ).toBe(true);
    expect(
      rendered.container.querySelector<HTMLInputElement>('[aria-label="Solo"]')
        ?.checked
    ).toBe(true);
  });
});
