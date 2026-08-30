import path from 'path';
import { constants } from 'fs';
import fs from 'fs/promises';

import { PROJECT_FILES } from '@/main/capture/video/recording-project';

export interface EditorV2ProjectPaths {
  root: string;
  project: string;
  projectTemporary: string;
  projectBackup: string;
  workspace: string;
  workspaceTemporary: string;
  workspaceBackup: string;
  media: string;
  data: string;
  cache: string;
  thumbnails: string;
  waveforms: string;
}

export const getEditorV2ProjectPaths = (
  packagePath: string
): EditorV2ProjectPaths => ({
  root: packagePath,
  project: path.join(packagePath, PROJECT_FILES.V2_PROJECT),
  projectTemporary: path.join(packagePath, `${PROJECT_FILES.V2_PROJECT}.tmp`),
  projectBackup: path.join(packagePath, `${PROJECT_FILES.V2_PROJECT}.bak`),
  workspace: path.join(packagePath, PROJECT_FILES.V2_WORKSPACE),
  workspaceTemporary: path.join(
    packagePath,
    `${PROJECT_FILES.V2_WORKSPACE}.tmp`
  ),
  workspaceBackup: path.join(packagePath, `${PROJECT_FILES.V2_WORKSPACE}.bak`),
  media: path.join(packagePath, PROJECT_FILES.V2_MEDIA_FOLDER),
  data: path.join(packagePath, PROJECT_FILES.V2_DATA_FOLDER),
  cache: path.join(packagePath, PROJECT_FILES.V2_CACHE_FOLDER),
  thumbnails: path.join(
    packagePath,
    PROJECT_FILES.V2_CACHE_FOLDER,
    'thumbnails'
  ),
  waveforms: path.join(packagePath, PROJECT_FILES.V2_CACHE_FOLDER, 'waveforms'),
});

export const resolveProjectRelativePath = (
  packagePath: string,
  relativePath: string
): string => {
  if (path.isAbsolute(relativePath) || relativePath.length === 0) {
    throw new Error('Project path must be a non-empty relative path');
  }

  const root = path.resolve(packagePath);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && resolved.startsWith(`${root}${path.sep}`)) {
    return resolved;
  }

  throw new Error('Project path escapes the package root');
};

const isMissingError = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  error.code === 'ENOENT';

const assertDirectory = async (directoryPath: string): Promise<void> => {
  const stats = await fs.lstat(directoryPath);
  if (stats.isSymbolicLink()) {
    throw new Error('Project writable path contains a symbolic link');
  }
  if (!stats.isDirectory()) {
    throw new Error('Project writable path contains a non-directory');
  }
};

const ensureSafeDirectory = async (
  packagePath: string,
  directoryPath: string
): Promise<void> => {
  const root = path.resolve(packagePath);
  const relative = path.relative(root, directoryPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Project directory escapes the package root');
  }

  await assertDirectory(root);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      await assertDirectory(current);
    } catch (error) {
      if (!isMissingError(error)) throw error;
      try {
        await fs.mkdir(current, { mode: 0o700 });
      } catch (mkdirError) {
        if (
          !mkdirError ||
          typeof mkdirError !== 'object' ||
          !('code' in mkdirError) ||
          mkdirError.code !== 'EEXIST'
        ) {
          throw mkdirError;
        }
      }
      await assertDirectory(current);
    }
  }

  const [canonicalRoot, canonicalDirectory] = await Promise.all([
    fs.realpath(root),
    fs.realpath(directoryPath),
  ]);
  if (
    canonicalDirectory !== canonicalRoot &&
    !canonicalDirectory.startsWith(`${canonicalRoot}${path.sep}`)
  ) {
    throw new Error('Project directory resolves outside the package root');
  }
};

export const ensureSafeProjectWritePath = async (
  packagePath: string,
  relativePath: string
): Promise<string> => {
  const target = resolveProjectRelativePath(packagePath, relativePath);
  await ensureSafeDirectory(packagePath, path.dirname(target));
  try {
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink()) {
      throw new Error('Project write target is a symbolic link');
    }
  } catch (error) {
    if (!isMissingError(error)) throw error;
  }
  return target;
};

export const openProjectFileForWrite = async (
  filePath: string
): Promise<fs.FileHandle> =>
  fs.open(
    filePath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o600
  );

export const assertSafeProjectReadPath = async (
  packagePath: string,
  relativePath: string
): Promise<string> => {
  const target = resolveProjectRelativePath(packagePath, relativePath);
  const root = path.resolve(packagePath);
  const segments = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stats = await fs.lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error('Project read path contains a symbolic link');
      }
    } catch (error) {
      if (isMissingError(error)) break;
      throw error;
    }
  }
  return target;
};

export const ensureEditorV2ProjectDirectories = async (
  packagePath: string
): Promise<EditorV2ProjectPaths> => {
  const paths = getEditorV2ProjectPaths(packagePath);
  await Promise.all([
    ensureSafeDirectory(packagePath, paths.media),
    ensureSafeDirectory(packagePath, paths.data),
    ensureSafeDirectory(packagePath, paths.thumbnails),
    ensureSafeDirectory(packagePath, paths.waveforms),
  ]);
  return paths;
};
