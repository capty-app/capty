import path from 'path';
import fs from 'fs/promises';

import { assertSafeProjectReadPath } from './project-paths';
import type {
  EditableDataLocator,
  EditorProjectV2,
  MediaLocator,
} from '@/types/editor-v2';

const canonicalizePath = async (filePath: string): Promise<string> => {
  const absolutePath = path.resolve(filePath);
  try {
    return await fs.realpath(absolutePath);
  } catch {
    return absolutePath;
  }
};

export const createLinkedPathAuthorization = async (
  paths: Iterable<string>
): Promise<Set<string>> =>
  new Set(await Promise.all([...paths].map(canonicalizePath)));

const validateMediaLocator = async (
  packagePath: string,
  locator: MediaLocator,
  linkedAuthorization: Set<string>
): Promise<void> => {
  if (locator.kind === 'linked') {
    if (!path.isAbsolute(locator.absolutePath)) {
      throw new Error('Linked media path must be absolute');
    }
    const canonicalPath = await canonicalizePath(locator.absolutePath);
    if (!linkedAuthorization.has(canonicalPath)) {
      throw new Error('Linked media path is not authorized for this window');
    }
    return;
  }

  if (
    locator.kind === 'managed' &&
    !locator.relativePath.startsWith(`media${path.sep}`) &&
    !locator.relativePath.startsWith('media/')
  ) {
    throw new Error('Managed media must be stored under the media directory');
  }
  await assertSafeProjectReadPath(packagePath, locator.relativePath);
};

const validateDataLocator = async (
  packagePath: string,
  locator: EditableDataLocator
): Promise<void> => {
  if (
    locator.kind === 'v2-data' &&
    !locator.relativePath.startsWith(`data${path.sep}`) &&
    !locator.relativePath.startsWith('data/')
  ) {
    throw new Error('V2 editor data must be stored under the data directory');
  }
  await assertSafeProjectReadPath(packagePath, locator.relativePath);
  if (locator.kind === 'v2-data' && locator.provenance) {
    await assertSafeProjectReadPath(
      packagePath,
      locator.provenance.relativePath
    );
  }
};

export const validateProjectLocatorAccess = async (
  packagePath: string,
  project: EditorProjectV2,
  linkedAuthorization: Set<string>
): Promise<void> => {
  for (const asset of Object.values(project.assets)) {
    await validateMediaLocator(packagePath, asset.locator, linkedAuthorization);
    if (asset.kind !== 'capty-recording') continue;
    const dataLocators = [
      asset.sources.cameraMetadata?.locator,
      asset.sources.cursor?.locator,
      asset.sources.keyboard?.locator,
      asset.sources.subtitles?.locator,
      asset.sources.originalV1State,
    ];
    for (const locator of dataLocators) {
      if (locator) await validateDataLocator(packagePath, locator);
    }
  }

  for (const clip of Object.values(project.sequence.clips)) {
    for (const effect of clip.effects) {
      if (
        effect.kind === 'cursor' ||
        effect.kind === 'keyboard' ||
        effect.kind === 'subtitle'
      ) {
        await validateDataLocator(packagePath, effect.data);
      }
    }
  }
};
