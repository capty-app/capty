import path from 'path';
import fs from 'fs/promises';

import {
  getEditorProjectLocation,
  getProjectFolder,
} from '@/main/capture/video/recording-project';
import type { EditorProjectLocation } from '@/types/editor-project';
import type { HistoryItem } from '@/types/history';

const canonicalizePath = async (filePath: string): Promise<string> => {
  try {
    return await fs.realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
};

export const canonicalizeEditorProjectLocation = async (
  projectOrSourcePath: string
): Promise<EditorProjectLocation | null> => {
  const location = getEditorProjectLocation(projectOrSourcePath);
  if (!location) return null;

  if (location.kind === 'standalone') {
    return {
      kind: 'standalone',
      sourcePath: await canonicalizePath(location.sourcePath),
    };
  }

  const packagePath = await canonicalizePath(location.packagePath);
  return {
    ...location,
    packagePath,
    v1RecordingPath: location.v1RecordingPath
      ? path.join(packagePath, path.basename(location.v1RecordingPath))
      : undefined,
  };
};

export const getEditorProjectIdentityPath = (
  projectOrSourcePath: string
): string => getProjectFolder(projectOrSourcePath) ?? projectOrSourcePath;

export const migrateHistoryProjectIdentity = (
  item: HistoryItem,
  location: EditorProjectLocation
): HistoryItem => ({
  ...item,
  originalPath:
    location.kind === 'capty-package'
      ? location.packagePath
      : location.sourcePath,
  projectLocation: location,
});

export const rekeyHistoryProjectLocation = (
  item: HistoryItem,
  oldPackagePath: string,
  newPackagePath: string
): HistoryItem => {
  if (
    item.projectLocation?.kind !== 'capty-package' ||
    item.projectLocation.packagePath !== oldPackagePath
  ) {
    return item;
  }

  return {
    ...item,
    originalPath: newPackagePath,
    projectLocation: {
      ...item.projectLocation,
      packagePath: newPackagePath,
      v1RecordingPath: item.projectLocation.v1RecordingPath
        ? path.join(
            newPackagePath,
            path.basename(item.projectLocation.v1RecordingPath)
          )
        : undefined,
    },
  };
};
