import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import {
  ensureEditorV2ProjectDirectories,
  getEditorV2ProjectPaths,
  resolveProjectRelativePath,
} from '@/main/editor-v2/project/project-paths';
import { assertSafeAssetId } from '@/main/editor-v2/security/project-path-policy';
import type {
  EditorProjectV2,
  MediaAsset,
  MediaLocator,
} from '@/types/editor-v2';

export interface ManagedMediaRemovalFileSystem {
  readdir(
    directoryPath: string,
    options: { withFileTypes: true }
  ): Promise<Array<{ name: string; isDirectory: () => boolean }>>;
  rename(sourcePath: string, destinationPath: string): Promise<void>;
  rm(
    targetPath: string,
    options: { recursive: true; force: true }
  ): Promise<void>;
}

const defaultFileSystem: ManagedMediaRemovalFileSystem = {
  readdir: (directoryPath, options) => fs.readdir(directoryPath, options),
  rename: (sourcePath, destinationPath) =>
    fs.rename(sourcePath, destinationPath),
  rm: (targetPath, options) => fs.rm(targetPath, options),
};

export const mediaAssetIsReferenced = (
  project: EditorProjectV2,
  assetId: string
): boolean => {
  if (project.sequence.preRoll?.assetId === assetId) return true;
  if (
    Object.values(project.sequence.clips).some(clip => clip.assetId === assetId)
  ) {
    return true;
  }
  return project.sequence.effects.some(
    effect =>
      effect.kind === 'wallpaper' &&
      effect.background.kind === 'image' &&
      effect.background.assetId === assetId
  );
};

const managedAssetDirectory = (
  packagePath: string,
  asset: MediaAsset
): string => {
  if (asset.locator.kind !== 'managed') {
    throw new Error('Only managed media can be permanently removed');
  }
  assertSafeAssetId(asset.id);
  const paths = getEditorV2ProjectPaths(packagePath);
  const sourcePath = resolveProjectRelativePath(
    packagePath,
    asset.locator.relativePath
  );
  const relativeDirectory = path.relative(
    paths.media,
    path.dirname(sourcePath)
  );
  const segments = relativeDirectory.split(path.sep).filter(Boolean);
  if (
    segments.length === 0 ||
    segments[0] !== asset.id ||
    relativeDirectory.startsWith('..') ||
    path.isAbsolute(relativeDirectory)
  ) {
    throw new Error(
      'Managed asset does not use its authorized media directory'
    );
  }
  return path.join(paths.media, asset.id);
};

const assetLocators = (asset: MediaAsset): MediaLocator[] => {
  if (asset.kind !== 'capty-recording') return [asset.locator];
  return [
    asset.locator,
    ...(asset.sources.systemAudio ? [asset.sources.systemAudio.locator] : []),
    ...(asset.sources.microphoneAudio
      ? [asset.sources.microphoneAudio.locator]
      : []),
    ...(asset.sources.cameraVideo ? [asset.sources.cameraVideo.locator] : []),
  ];
};

const locatorAliasesDirectory = (
  packagePath: string,
  locator: MediaLocator,
  directoryPath: string
): boolean => {
  if (locator.kind === 'linked') return false;
  const locatorPath = resolveProjectRelativePath(
    packagePath,
    locator.relativePath
  );
  const relative = path.relative(directoryPath, locatorPath);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

const createTombstoneName = (assetId: string): string =>
  `${Buffer.from(assetId).toString('base64url')}.${crypto.randomUUID()}`;

const getTombstoneAssetId = (name: string): string | null => {
  const encoded = name.split('.')[0];
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
};

export class ManagedMediaRemovalService {
  constructor(
    private readonly fileSystem: ManagedMediaRemovalFileSystem = defaultFileSystem
  ) {}

  async remove(input: {
    packagePath: string;
    project: EditorProjectV2;
    assetId: string;
    commit: (project: EditorProjectV2) => Promise<EditorProjectV2>;
  }): Promise<{ project: EditorProjectV2; cleanupWarning?: string }> {
    const asset = input.project.assets[input.assetId];
    if (!asset) throw new Error(`Asset ${input.assetId} does not exist`);
    if (mediaAssetIsReferenced(input.project, input.assetId)) {
      throw new Error('Media is still referenced by the sequence');
    }
    const sourceDirectory = managedAssetDirectory(input.packagePath, asset);
    const aliased = Object.values(input.project.assets).some(
      candidate =>
        candidate.id !== asset.id &&
        assetLocators(candidate).some(locator =>
          locatorAliasesDirectory(input.packagePath, locator, sourceDirectory)
        )
    );
    if (aliased) {
      throw new Error('Managed media directory is referenced by another asset');
    }
    const paths = await ensureEditorV2ProjectDirectories(input.packagePath);
    const tombstone = path.join(
      paths.mediaTombstones,
      createTombstoneName(asset.id)
    );
    await this.fileSystem.rename(sourceDirectory, tombstone);

    const nextProject = structuredClone(input.project);
    delete nextProject.assets[input.assetId];
    let committed: EditorProjectV2;
    try {
      committed = await input.commit(nextProject);
    } catch (error) {
      await this.fileSystem.rename(tombstone, sourceDirectory);
      throw error;
    }

    try {
      await this.fileSystem.rm(tombstone, { recursive: true, force: true });
      return { project: committed };
    } catch (error) {
      return {
        project: committed,
        cleanupWarning: `Media was removed, but cleanup will retry after reopen: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  async recover(
    packagePath: string,
    project: EditorProjectV2
  ): Promise<string[]> {
    const paths = await ensureEditorV2ProjectDirectories(packagePath);
    const entries = await this.fileSystem.readdir(paths.mediaTombstones, {
      withFileTypes: true,
    });
    const warnings: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const assetId = getTombstoneAssetId(entry.name);
      if (!assetId) {
        warnings.push(`Unrecognized media tombstone ${entry.name}`);
        continue;
      }
      const tombstone = path.join(paths.mediaTombstones, entry.name);
      const asset = project.assets[assetId];
      if (!asset) {
        try {
          await this.fileSystem.rm(tombstone, {
            recursive: true,
            force: true,
          });
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : String(error));
        }
        continue;
      }
      try {
        const destination = managedAssetDirectory(packagePath, asset);
        await this.fileSystem.rename(tombstone, destination);
      } catch (error) {
        throw new Error(
          `Managed media recovery failed for ${assetId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    return warnings;
  }
}
