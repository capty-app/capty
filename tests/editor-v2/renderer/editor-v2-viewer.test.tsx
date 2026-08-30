import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import EditorV2Viewer from '@/renderer/editor-v2/viewer/editor-v2-viewer';
import { render, type RenderResult } from '../helpers/render';
import type { EditorProjectV2 } from '@/types/editor-v2';

let rendered: RenderResult | null = null;

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Viewer',
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
    width: 1920,
    height: 1080,
    orientation: 1,
    defaultStillDurationTicks: 12_000,
  };
  project.sequence.clips.clip = {
    id: 'clip',
    kind: 'image',
    trackId: 'video',
    assetId: 'image',
    name: 'Still',
    timelineStart: 0,
    timelineDuration: 12_000,
    sourceStart: 0,
    sourceDuration: 12_000,
    playbackRate: { numerator: 1, denominator: 1 },
    effects: [],
  };
  project.sequence.tracks.video.clipIds.push('clip');
  return project;
};

const context = {
  save: vi.fn(),
  restore: vi.fn(),
  fillRect: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  drawImage: vi.fn(),
  globalAlpha: 1,
  fillStyle: '',
} as unknown as CanvasRenderingContext2D;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
});

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
  vi.restoreAllMocks();
});

describe('EditorV2Viewer', () => {
  it('shows missing media and supports frame stepping and fit controls', async () => {
    window.editorV2 = {
      getMediaStatus: vi.fn().mockResolvedValue({
        status: 'resolved',
        asset: { assetId: 'image', availability: 'missing' },
      }),
    } as unknown as Window['editorV2'];
    rendered = render(
      <EditorV2Viewer projectToken="token" project={createProject()} />
    );

    await flush();
    expect(rendered.container.textContent).toContain('Media is missing');
    expect(window.editorV2.getMediaStatus).toHaveBeenCalledWith({
      projectToken: 'token',
      assetId: 'image',
      sourceStreamId: undefined,
      sourceRole: undefined,
    });

    const next = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Next frame"]'
    );
    act(() => next?.click());
    expect(rendered.container.textContent).toContain('00:00:00:01');
    await flush();

    const actualSize = rendered.container.querySelector<HTMLButtonElement>(
      '[aria-label="Show viewer at 100%"]'
    );
    act(() => actualSize?.click());
    expect(
      rendered.container.querySelector('[aria-label="Fit viewer"]')
    ).not.toBeNull();
  });

  it('forwards Capty source roles when stream IDs collide', async () => {
    const project = createProject();
    delete project.assets.image;
    project.assets.recording = {
      id: 'recording',
      kind: 'capty-recording',
      name: 'Recording',
      locator: { kind: 'managed', relativePath: 'media/recording/screen.mov' },
      importedAt: '2026-09-01T00:00:00.000Z',
      durationTicks: 12_000,
      width: 1920,
      height: 1080,
      frameRate: { numerator: 60, denominator: 1 },
      videoStreams: [
        {
          id: '0:0',
          codec: 'h264',
          durationTicks: 12_000,
          width: 1920,
          height: 1080,
          frameRate: { numerator: 60, denominator: 1 },
          hasAlpha: false,
        },
      ],
      audioStreams: [],
      sources: {
        cameraVideo: {
          kind: 'video',
          locator: {
            kind: 'managed',
            relativePath: 'media/recording/camera.mov',
          },
          recordingOffsetTicks: 0,
          durationTicks: 12_000,
          streams: [
            {
              id: '0:0',
              codec: 'h264',
              durationTicks: 12_000,
              width: 640,
              height: 480,
              frameRate: { numerator: 60, denominator: 1 },
              hasAlpha: false,
            },
          ],
        },
      },
    };
    project.sequence.clips.clip = {
      ...project.sequence.clips.clip,
      kind: 'video',
      assetId: 'recording',
      sourceStreamId: '0:0',
      sourceRole: 'camera-video',
    };
    window.editorV2 = {
      getMediaStatus: vi.fn().mockResolvedValue({
        status: 'resolved',
        asset: { assetId: 'recording', availability: 'missing' },
      }),
    } as unknown as Window['editorV2'];
    rendered = render(
      <EditorV2Viewer projectToken="token" project={project} />
    );

    await flush();
    expect(window.editorV2.getMediaStatus).toHaveBeenCalledWith({
      projectToken: 'token',
      assetId: 'recording',
      sourceStreamId: '0:0',
      sourceRole: 'camera-video',
    });
  });

  it('shows loading and decode-error states', async () => {
    let rejectStatus: ((reason: Error) => void) | null = null;
    window.editorV2 = {
      getMediaStatus: vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectStatus = reject;
          })
      ),
    } as unknown as Window['editorV2'];
    rendered = render(
      <EditorV2Viewer projectToken="token" project={createProject()} />
    );

    expect(rendered.container.textContent).toContain('Loading frame');
    await act(async () => {
      await Promise.resolve();
    });
    expect(rejectStatus).not.toBeNull();
    await act(async () => {
      rejectStatus?.(new Error('decoder unavailable'));
    });
    await flush();
    expect(rendered.container.textContent).toContain('Media could not decode');
    expect(rendered.container.textContent).toContain('decoder unavailable');
  });
});
