import crypto from 'crypto';
import { constants } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import {
  ensureEditorV2ProjectDirectories,
  ensureSafeProjectWritePath,
} from '@/main/editor-v2/project/project-paths';
import type { EditorProjectSession } from '@/main/editor-v2/project/project-service';
import {
  getSessionPackagePath,
  resolveAuthorizedMediaLocator,
} from '@/main/editor-v2/security/project-path-policy';
import type {
  EditorProjectV2,
  MediaAsset,
  MediaAssetStatus,
  MediaImportPolicy,
  MediaLocator,
  MediaSourceRole,
} from '@/types/editor-v2';

import { fingerprintMediaFile } from './media-fingerprint';
import { MediaMetadataService } from './metadata-service';
import { mediaUrlRegistry, type MediaUrlRegistry } from './media-url-registry';
import { ThumbnailService } from './thumbnail-service';
import { WaveformService } from './waveform-service';

export interface ImportedMedia {
  asset: MediaAsset;
  media: MediaAssetStatus;
}

const fingerprintsMatch = (
  left: { byteLength: number; sha256: string },
  right: { byteLength: number; sha256: string }
): boolean =>
  left.byteLength === right.byteLength && left.sha256 === right.sha256;

const isMissingError = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  error.code === 'ENOENT';

const compatibleKinds = (asset: MediaAsset, replacement: MediaAsset): boolean =>
  asset.kind === replacement.kind && asset.kind !== 'capty-recording';

const resolveAssetSourceLocator = (
  asset: MediaAsset,
  sourceStreamId: string | undefined,
  sourceRole: MediaSourceRole | undefined
): MediaLocator => {
  if (asset.kind === 'image') {
    if (sourceStreamId || (sourceRole && sourceRole !== 'primary')) {
      throw new Error(`Image asset ${asset.id} has no media streams`);
    }
    return asset.locator;
  }
  if (!sourceStreamId && !sourceRole) return asset.locator;
  const primaryMatches =
    !sourceStreamId ||
    asset.audioStreams.some(stream => stream.id === sourceStreamId) ||
    (asset.kind !== 'audio' &&
      asset.videoStreams.some(stream => stream.id === sourceStreamId));
  if (sourceRole === 'primary') {
    if (!primaryMatches) {
      throw new Error(
        `Asset ${asset.id} has no primary stream ${sourceStreamId}`
      );
    }
    return asset.locator;
  }
  if (asset.kind !== 'capty-recording') {
    if (sourceRole || !primaryMatches) {
      throw new Error(`Asset ${asset.id} has no stream ${sourceStreamId}`);
    }
    return asset.locator;
  }
  const matches: Array<{ role: MediaSourceRole; locator: MediaLocator }> = [];
  if (!sourceRole && primaryMatches) {
    matches.push({ role: 'primary', locator: asset.locator });
  }
  const addSourceMatch = (
    role: MediaSourceRole,
    source:
      | typeof asset.sources.cameraVideo
      | typeof asset.sources.systemAudio
      | typeof asset.sources.microphoneAudio
  ) => {
    if (!source || (sourceRole && sourceRole !== role)) return;
    if (
      sourceStreamId &&
      !source.streams.some(stream => stream.id === sourceStreamId)
    ) {
      return;
    }
    matches.push({ role, locator: source.locator });
  };
  addSourceMatch('camera-video', asset.sources.cameraVideo);
  addSourceMatch('system-audio', asset.sources.systemAudio);
  addSourceMatch('microphone-audio', asset.sources.microphoneAudio);
  if (matches.length !== 1) {
    const reason = matches.length > 1 ? 'ambiguous stream' : 'no stream';
    throw new Error(`Asset ${asset.id} has ${reason} ${sourceStreamId}`);
  }
  return matches[0].locator;
};

const replacementSupportsProjectReferences = (
  project: EditorProjectV2,
  assetId: string,
  replacement: MediaAsset
): boolean =>
  Object.values(project.sequence.clips)
    .filter(clip => clip.assetId === assetId)
    .every(clip => {
      if (clip.kind === 'image') return replacement.kind === 'image';
      const streams =
        clip.kind === 'video' && replacement.kind === 'video'
          ? replacement.videoStreams
          : clip.kind === 'audio' &&
              (replacement.kind === 'audio' || replacement.kind === 'video')
            ? replacement.audioStreams
            : [];
      const stream = clip.sourceStreamId
        ? streams.find(candidate => candidate.id === clip.sourceStreamId)
        : streams[0];
      return (
        !!stream &&
        clip.sourceStart + clip.sourceDuration <= stream.durationTicks
      );
    });

export class MediaService {
  constructor(
    private readonly metadata = new MediaMetadataService(),
    private readonly thumbnails = new ThumbnailService(),
    private readonly waveforms = new WaveformService(),
    private readonly urls: MediaUrlRegistry = mediaUrlRegistry,
    private readonly createId: () => string = () => crypto.randomUUID()
  ) {}

  private async createStableExternalAsset(input: {
    id: string;
    filePath: string;
    importedAt: string;
    createLocator: (
      fingerprint: Awaited<ReturnType<typeof fingerprintMediaFile>>
    ) => MediaLocator;
  }): Promise<MediaAsset> {
    const before = await fingerprintMediaFile(input.filePath);
    const asset = await this.metadata.createAsset({
      id: input.id,
      filePath: input.filePath,
      locator: input.createLocator(before),
      importedAt: input.importedAt,
    });
    const after = await fingerprintMediaFile(input.filePath);
    if (!fingerprintsMatch(before, after)) {
      throw new Error('Media changed while it was being inspected');
    }
    return asset;
  }

  async importMedia(
    session: EditorProjectSession,
    ownerId: number,
    sourcePath: string,
    policy: MediaImportPolicy
  ): Promise<ImportedMedia> {
    const packagePath = getSessionPackagePath(session);
    await ensureEditorV2ProjectDirectories(packagePath);
    const canonicalSource = await fs.realpath(sourcePath);
    const canonicalPackage = await fs.realpath(packagePath);
    const packageRelativePath = path.relative(
      canonicalPackage,
      canonicalSource
    );
    const sourceIsInsidePackage =
      packageRelativePath.length > 0 &&
      !packageRelativePath.startsWith('..') &&
      !path.isAbsolute(packageRelativePath);
    const assetId = `asset-${this.createId()}`;
    const importedAt = new Date().toISOString();

    if (sourceIsInsidePackage) {
      const packageSegments = packageRelativePath.split(path.sep);
      if (packageSegments[0] === 'media') {
        throw new Error('Media already managed by this Capty project');
      }
      const asset = await this.createStableExternalAsset({
        id: assetId,
        filePath: canonicalSource,
        importedAt,
        createLocator: fingerprint => ({
          kind: 'legacy-package-read-only',
          relativePath: packageRelativePath,
          fingerprint,
        }),
      });
      return {
        asset,
        media: await this.resolveStatus(
          session,
          ownerId,
          { assets: { [asset.id]: asset } },
          asset.id
        ),
      };
    }

    if (policy === 'link') {
      const asset = await this.createStableExternalAsset({
        id: assetId,
        filePath: canonicalSource,
        importedAt,
        createLocator: fingerprint => ({
          kind: 'linked',
          absolutePath: canonicalSource,
          fingerprint,
        }),
      });
      session.linkedPathAuthorization.add(canonicalSource);
      return {
        asset,
        media: await this.resolveStatus(
          session,
          ownerId,
          { assets: { [asset.id]: asset } },
          asset.id
        ),
      };
    }

    await this.metadata.probe(canonicalSource);
    const fileName = path.basename(canonicalSource);
    const relativePath = path.join('media', assetId, fileName);
    const target = await ensureSafeProjectWritePath(packagePath, relativePath);
    const temporary = await ensureSafeProjectWritePath(
      packagePath,
      path.join('media', assetId, `${fileName}.importing`)
    );
    try {
      await fs.copyFile(canonicalSource, temporary, constants.COPYFILE_EXCL);
      const locator: MediaLocator = { kind: 'managed', relativePath };
      const asset = await this.metadata.createAsset({
        id: assetId,
        filePath: temporary,
        locator,
        importedAt,
      });
      await fs.rename(temporary, target);
      return {
        asset,
        media: await this.resolveStatus(
          session,
          ownerId,
          { assets: { [asset.id]: asset } },
          asset.id
        ),
      };
    } catch (error) {
      await fs.rm(temporary, { force: true });
      await fs.rm(path.dirname(target), { recursive: true, force: true });
      throw error;
    }
  }

  async resolveStatus(
    session: EditorProjectSession,
    ownerId: number,
    project: Pick<EditorProjectV2, 'assets'>,
    assetId: string,
    forceCache = false,
    sourceStreamId?: string,
    sourceRole?: MediaSourceRole
  ): Promise<MediaAssetStatus> {
    const asset = project.assets[assetId];
    if (!asset) throw new Error(`Asset ${assetId} does not exist`);
    const identity = { assetId, sourceStreamId, sourceRole };
    const locator = resolveAssetSourceLocator(
      asset,
      sourceStreamId,
      sourceRole
    );
    let sourcePath: string;
    try {
      sourcePath = await resolveAuthorizedMediaLocator(session, locator);
    } catch (error) {
      if (isMissingError(error))
        return { ...identity, availability: 'missing' };
      throw error;
    }

    try {
      const stats = await fs.stat(sourcePath);
      if (!stats.isFile()) return { ...identity, availability: 'missing' };
    } catch (error) {
      if (isMissingError(error))
        return { ...identity, availability: 'missing' };
      throw error;
    }

    if (locator.kind !== 'managed') {
      let fingerprint;
      try {
        fingerprint = await fingerprintMediaFile(sourcePath);
      } catch (error) {
        if (isMissingError(error))
          return { ...identity, availability: 'missing' };
        throw error;
      }
      if (!fingerprintsMatch(fingerprint, locator.fingerprint)) {
        return { ...identity, availability: 'changed' };
      }
    }

    const packagePath = getSessionPackagePath(session);
    const status: MediaAssetStatus = {
      ...identity,
      availability: 'available',
      mediaUrl: this.urls.authorize(ownerId, sourcePath),
    };
    const cacheErrors: string[] = [];
    if (!sourceStreamId && asset.kind !== 'audio') {
      try {
        const thumbnail = await this.thumbnails.ensure(
          packagePath,
          asset.id,
          sourcePath,
          forceCache
        );
        status.thumbnailUrl = this.urls.authorize(ownerId, thumbnail);
      } catch (error) {
        cacheErrors.push(
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    if (
      !sourceStreamId &&
      (asset.kind === 'audio' ||
        asset.kind === 'video' ||
        (asset.kind === 'capty-recording' && asset.audioStreams.length > 0))
    ) {
      try {
        const waveform = await this.waveforms.ensure(
          packagePath,
          asset.id,
          sourcePath,
          forceCache
        );
        status.waveformUrl = this.urls.authorize(ownerId, waveform);
      } catch (error) {
        cacheErrors.push(
          error instanceof Error ? error.message : String(error)
        );
      }
    }
    if (cacheErrors.length > 0) status.cacheWarning = cacheErrors.join('\n');
    return status;
  }

  async relink(
    session: EditorProjectSession,
    ownerId: number,
    project: EditorProjectV2,
    assetId: string,
    replacementPath: string
  ): Promise<{ asset: MediaAsset; media: MediaAssetStatus }> {
    const asset = project.assets[assetId];
    if (!asset) throw new Error(`Asset ${assetId} does not exist`);
    if (asset.locator.kind !== 'linked') {
      throw new Error('Only linked media can be relinked');
    }
    const canonicalPath = await fs.realpath(replacementPath);
    const replacement = await this.createStableExternalAsset({
      id: asset.id,
      filePath: canonicalPath,
      importedAt: asset.importedAt,
      createLocator: fingerprint => ({
        kind: 'linked',
        absolutePath: canonicalPath,
        fingerprint,
      }),
    });
    if (
      !compatibleKinds(asset, replacement) ||
      !replacementSupportsProjectReferences(project, assetId, replacement)
    ) {
      throw new Error('Replacement media is not compatible with this asset');
    }
    replacement.name = asset.name;
    session.linkedPathAuthorization.add(canonicalPath);
    const nextProject = structuredClone(project);
    nextProject.assets[assetId] = replacement;
    return {
      asset: replacement,
      media: await this.resolveStatus(
        session,
        ownerId,
        nextProject,
        assetId,
        true
      ),
    };
  }
}
