import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FrameLayerPlan } from '@/editor-v2/timeline';
import { BrowserCompositionSourceProvider } from '@/renderer/editor-v2/composition/source-provider';

const transform = {
  positionX: 0,
  positionY: 0,
  scaleX: 1,
  scaleY: 1,
  rotationDegrees: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
};

const layer = (
  assetId: string,
  assetKind: 'image' | 'video',
  sourceTick = 0
): FrameLayerPlan => ({
  kind: 'media',
  origin: 'clip',
  layerId: assetId,
  clipId: `${assetId}-clip`,
  trackId: 'video',
  trackOrder: 0,
  assetId,
  assetKind,
  sourceStreamId: assetKind === 'video' ? `${assetId}-stream` : undefined,
  sourceRole: assetKind === 'video' ? 'primary' : undefined,
  sourceTick,
  transform,
  opacity: 1,
  effects: [],
});

class MockVideo extends EventTarget {
  readyState = 1;
  videoWidth = 1920;
  videoHeight = 1080;
  preload = '';
  muted = false;
  playsInline = false;
  src = '';
  error = null;
  private time = 0;
  pause = vi.fn();
  removeAttribute = vi.fn();
  load = vi.fn();

  get currentTime(): number {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BrowserCompositionSourceProvider', () => {
  it('pools independent image and video sources and seeks video ticks', async () => {
    const bitmap = {
      width: 640,
      height: 480,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['image'])),
      })
    );
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const video = new MockVideo();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(
      (tagName, options) =>
        tagName === 'video'
          ? (video as unknown as HTMLVideoElement)
          : createElement(tagName, options)
    );
    const resolveStatus = vi.fn((assetId: string) =>
      Promise.resolve({
        status: 'resolved' as const,
        asset: {
          assetId,
          availability: 'available' as const,
          mediaUrl: `capty-media://resource/${assetId}`,
        },
      })
    );
    const provider = new BrowserCompositionSourceProvider(resolveStatus);

    const imageFirst = await provider.getSource(layer('image', 'image'));
    const imageSecond = await provider.getSource(layer('image', 'image'));
    const videoFirst = await provider.getSource(layer('video', 'video'));
    const videoSecond = await provider.getSource(
      layer('video', 'video', 360_000)
    );

    expect(imageFirst).toMatchObject({
      status: 'ready',
      width: 640,
      height: 480,
    });
    expect(imageSecond).toMatchObject({ status: 'ready' });
    expect(videoFirst).toMatchObject({
      status: 'ready',
      width: 1920,
      height: 1080,
    });
    expect(videoSecond).toMatchObject({ status: 'ready' });
    expect(video.currentTime).toBe(1);
    expect(resolveStatus).toHaveBeenCalledTimes(2);
    expect(resolveStatus).toHaveBeenCalledWith(
      'video',
      'video-stream',
      'primary'
    );
    provider.dispose();
    await Promise.resolve();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
  });

  it('closes an image bitmap that finishes loading after disposal', async () => {
    const bitmap = {
      width: 10,
      height: 10,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    let resolveBitmap: ((value: ImageBitmap) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['image'])),
      })
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<ImageBitmap>(resolve => {
            resolveBitmap = resolve;
          })
      )
    );
    const provider = new BrowserCompositionSourceProvider(() =>
      Promise.resolve({
        status: 'resolved',
        asset: {
          assetId: 'image',
          availability: 'available',
          mediaUrl: 'capty-media://resource/image',
        },
      })
    );

    const pending = provider.getSource(layer('image', 'image'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    provider.dispose();
    resolveBitmap?.(bitmap);

    await expect(pending).resolves.toMatchObject({
      status: 'decode-error',
      error: 'Composition source provider is disposed',
    });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('distinguishes missing sources from status failures', async () => {
    const resolveStatus = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'resolved',
        asset: { assetId: 'image', availability: 'changed' },
      })
      .mockResolvedValueOnce({
        status: 'failed',
        error: 'authorization failed',
      });
    const provider = new BrowserCompositionSourceProvider(resolveStatus);

    await expect(provider.getSource(layer('image', 'image'))).resolves.toEqual({
      status: 'missing',
      assetId: 'image',
      sourceStreamId: undefined,
      sourceRole: undefined,
    });
    await expect(provider.getSource(layer('video', 'video'))).resolves.toEqual({
      status: 'decode-error',
      assetId: 'video',
      sourceStreamId: 'video-stream',
      sourceRole: 'primary',
      error: 'authorization failed',
    });
  });
});
