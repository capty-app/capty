import { ticksToSeconds } from '@/editor-v2/time/timebase';
import type { FrameLayerPlan } from '@/editor-v2/timeline';
import type {
  EditorV2MediaStatusResult,
  MediaSourceRole,
} from '@/types/editor-v2';

export type CompositionDrawable = CanvasImageSource;

export type CompositionSourceResult =
  | {
      status: 'ready';
      source: CompositionDrawable;
      width: number;
      height: number;
    }
  | {
      status: 'missing';
      assetId: string;
      sourceStreamId?: string;
      sourceRole?: MediaSourceRole;
    }
  | {
      status: 'decode-error';
      assetId: string;
      sourceStreamId?: string;
      sourceRole?: MediaSourceRole;
      error: string;
    };

export interface CompositionSourceProvider {
  getSource: (layer: FrameLayerPlan) => Promise<CompositionSourceResult>;
  dispose: () => void;
}

interface ImagePoolEntry {
  kind: 'image';
  bitmap: ImageBitmap;
}

interface VideoPoolEntry {
  kind: 'video';
  video: HTMLVideoElement;
}

type SourcePoolEntry = ImagePoolEntry | VideoPoolEntry;

type MediaStatusResolver = (
  assetId: string,
  sourceStreamId?: string,
  sourceRole?: MediaSourceRole
) => Promise<EditorV2MediaStatusResult>;

const sourceKey = (layer: FrameLayerPlan): string =>
  JSON.stringify([
    layer.assetId,
    layer.sourceRole ?? null,
    layer.sourceStreamId ?? null,
  ]);

const loadImageBitmap = async (url: string): Promise<ImageBitmap> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image request failed with status ${response.status}`);
  }
  return createImageBitmap(await response.blob());
};

const waitForVideoMetadata = (video: HTMLVideoElement): Promise<void> => {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(video.error?.message ?? 'Video metadata decode failed'));
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
};

const seekVideo = (
  video: HTMLVideoElement,
  sourceTick: number
): Promise<void> => {
  const sourceSeconds = ticksToSeconds(sourceTick);
  if (Math.abs(video.currentTime - sourceSeconds) < 0.000_001) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(video.error?.message ?? 'Video frame decode failed'));
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = sourceSeconds;
  });
};

export class BrowserCompositionSourceProvider implements CompositionSourceProvider {
  private readonly pool = new Map<string, Promise<SourcePoolEntry>>();
  private disposed = false;

  constructor(private readonly resolveStatus: MediaStatusResolver) {}

  private createEntry(layer: FrameLayerPlan): Promise<SourcePoolEntry> {
    return this.resolveStatus(
      layer.assetId,
      layer.sourceStreamId,
      layer.sourceRole
    ).then(async result => {
      if (result.status === 'failed') throw new Error(result.error);
      const status = result.asset;
      if (
        status.availability === 'missing' ||
        status.availability === 'changed'
      ) {
        throw new DOMException(status.availability, 'NotFoundError');
      }
      if (status.availability === 'error') {
        throw new Error(status.error ?? 'Media status could not be resolved');
      }
      if (!status.mediaUrl) throw new Error('Authorized media URL is missing');
      if (layer.assetKind === 'image') {
        const bitmap = await loadImageBitmap(status.mediaUrl);
        if (this.disposed) {
          bitmap.close();
          throw new Error('Composition source provider is disposed');
        }
        return { kind: 'image', bitmap };
      }
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.src = status.mediaUrl;
      video.load();
      await waitForVideoMetadata(video);
      return { kind: 'video', video };
    });
  }

  async getSource(layer: FrameLayerPlan): Promise<CompositionSourceResult> {
    if (this.disposed) {
      return {
        status: 'decode-error',
        assetId: layer.assetId,
        sourceStreamId: layer.sourceStreamId,
        sourceRole: layer.sourceRole,
        error: 'Composition source provider is disposed',
      };
    }
    const key = sourceKey(layer);
    let entryPromise = this.pool.get(key);
    if (!entryPromise) {
      entryPromise = this.createEntry(layer);
      this.pool.set(key, entryPromise);
    }
    try {
      const entry = await entryPromise;
      if (entry.kind === 'image') {
        return {
          status: 'ready',
          source: entry.bitmap,
          width: entry.bitmap.width,
          height: entry.bitmap.height,
        };
      }
      await seekVideo(entry.video, layer.sourceTick);
      return {
        status: 'ready',
        source: entry.video,
        width: entry.video.videoWidth,
        height: entry.video.videoHeight,
      };
    } catch (reason) {
      this.pool.delete(key);
      if (reason instanceof DOMException && reason.name === 'NotFoundError') {
        return {
          status: 'missing',
          assetId: layer.assetId,
          sourceStreamId: layer.sourceStreamId,
          sourceRole: layer.sourceRole,
        };
      }
      return {
        status: 'decode-error',
        assetId: layer.assetId,
        sourceStreamId: layer.sourceStreamId,
        sourceRole: layer.sourceRole,
        error: reason instanceof Error ? reason.message : String(reason),
      };
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const entryPromise of this.pool.values()) {
      void entryPromise
        .then(entry => {
          if (entry.kind === 'image') {
            entry.bitmap.close();
            return;
          }
          entry.video.pause();
          entry.video.removeAttribute('src');
          entry.video.load();
        })
        .catch(() => undefined);
    }
    this.pool.clear();
  }
}
