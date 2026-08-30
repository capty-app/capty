import path from 'path';
import fs from 'fs/promises';

import { assertSafeProjectReadPath } from '@/main/editor-v2/project/project-paths';
import type { EditorProjectSession } from '@/main/editor-v2/project/project-service';
import type { MediaAsset, MediaLocator } from '@/types/editor-v2';

const canonicalizeExistingPath = async (filePath: string): Promise<string> =>
  fs.realpath(path.resolve(filePath));

export const assertSafeAssetId = (assetId: string): void => {
  if (
    assetId.length === 0 ||
    assetId === '.' ||
    assetId === '..' ||
    path.basename(assetId) !== assetId ||
    assetId.includes('/') ||
    assetId.includes('\\')
  ) {
    throw new Error('Asset ID is not safe for project storage');
  }
};

export const getSessionPackagePath = (
  session: EditorProjectSession
): string => {
  if (session.location.kind !== 'capty-package') {
    throw new Error('Create a Capty project before managing media');
  }
  return session.location.packagePath;
};

export const resolveAuthorizedMediaLocator = async (
  session: EditorProjectSession,
  locator: MediaLocator
): Promise<string> => {
  if (locator.kind !== 'linked') {
    return assertSafeProjectReadPath(
      getSessionPackagePath(session),
      locator.relativePath
    );
  }
  if (!path.isAbsolute(locator.absolutePath)) {
    throw new Error('Linked media path must be absolute');
  }
  const canonicalPath = await canonicalizeExistingPath(locator.absolutePath);
  if (!session.linkedPathAuthorization.has(canonicalPath)) {
    throw new Error('Linked media path is not authorized for this window');
  }
  return canonicalPath;
};

export const resolveAuthorizedMediaAsset = async (
  session: EditorProjectSession,
  project: { assets: Record<string, MediaAsset> },
  assetId: string
): Promise<{ asset: MediaAsset; filePath: string }> => {
  const asset = project.assets[assetId];
  if (!asset) throw new Error(`Asset ${assetId} does not exist`);
  return {
    asset,
    filePath: await resolveAuthorizedMediaLocator(session, asset.locator),
  };
};
