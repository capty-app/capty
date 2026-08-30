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
  vi.unstubAllGlobals();
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
    expect(rendered.container.querySelector('[role="alert"]')).not.toBeNull();
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

  it('surfaces actionable effect data read failures', async () => {
    const project = createProject();
    project.sequence.clips.clip.effects.push({
      id: 'cursor',
      kind: 'cursor',
      enabled: true,
      timeDomain: 'asset-source',
      data: {
        kind: 'v1-read-only',
        relativePath: 'cursor.json',
        fingerprint: { byteLength: 100, sha256: 'cursor' },
      },
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
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue({}) })
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1920, height: 1080, close: vi.fn() })
    );
    window.editorV2 = {
      getMediaStatus: vi.fn().mockResolvedValue({
        status: 'resolved',
        asset: {
          assetId: 'image',
          availability: 'ready',
          mediaUrl: 'capty-media://image',
        },
      }),
      readData: vi.fn().mockResolvedValue({
        status: 'failed',
        error: 'Cursor data changed outside Capty',
      }),
    } as unknown as Window['editorV2'];
    rendered = render(
      <EditorV2Viewer projectToken="token" project={project} />
    );

    await flush();
    await flush();
    expect(rendered.container.textContent).toContain('Media could not decode');
    expect(rendered.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain(
      'Cursor data changed outside Capty'
    );
  });

  it('does not start stale audio after playback preparation is cancelled', async () => {
    let resolveResume: (() => void) | null = null;
    const createBufferSource = vi.fn();
    class TestAudioContext {
      currentTime = 0;
      sampleRate = 48_000;
      destination = {};
      resume = vi.fn(
        () =>
          new Promise<void>(resolve => {
            resolveResume = resolve;
          })
      );
      close = vi.fn().mockResolvedValue(undefined);
      createBufferSource = createBufferSource;
    }
    vi.stubGlobal('AudioContext', TestAudioContext);
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

    act(() =>
      rendered?.container
        .querySelector<HTMLButtonElement>('[aria-label="Play"]')
        ?.click()
    );
    expect(
      rendered.container.querySelector('[aria-label="Preparing audio"]')
    ).not.toBeNull();
    act(() =>
      rendered?.container
        .querySelector<HTMLButtonElement>('[aria-label="Next frame"]')
        ?.click()
    );
    await act(async () => {
      resolveResume?.();
      await Promise.resolve();
    });
    await flush();

    expect(
      rendered.container.querySelector('[aria-label="Play"]')
    ).not.toBeNull();
    expect(createBufferSource).not.toHaveBeenCalled();
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
    expect(
      rendered.container
        .querySelector('.animate-spin')
        ?.classList.contains('motion-reduce:animate-none')
    ).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(rejectStatus).not.toBeNull();
    await act(async () => {
      rejectStatus?.(new Error('decoder unavailable'));
    });
    await flush();
    expect(rendered.container.textContent).toContain('Media could not decode');
    expect(rendered.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain('decoder unavailable');
  });
});
