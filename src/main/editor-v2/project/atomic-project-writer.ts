import path from 'path';
import fs from 'fs/promises';

import { openProjectFileForWrite } from './project-paths';

export interface AtomicJsonPaths {
  target: string;
  temporary: string;
  backup: string;
}

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const syncDirectory = async (filePath: string): Promise<void> => {
  const handle = await fs.open(path.dirname(filePath), 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const writeJsonAtomic = async (
  paths: AtomicJsonPaths,
  value: unknown
): Promise<void> => {
  await fs.mkdir(path.dirname(paths.target), { recursive: true });
  const parentStats = await fs.lstat(path.dirname(paths.target));
  if (parentStats.isSymbolicLink()) {
    throw new Error('Atomic write directory is a symbolic link');
  }
  const handle = await openProjectFileForWrite(paths.temporary);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf-8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  const hadTarget = await exists(paths.target);
  if (await exists(paths.backup)) {
    await fs.unlink(paths.backup);
  }
  if (hadTarget) {
    await fs.rename(paths.target, paths.backup);
  }

  try {
    await fs.rename(paths.temporary, paths.target);
    await syncDirectory(paths.target);
  } catch (error) {
    if (
      hadTarget &&
      !(await exists(paths.target)) &&
      (await exists(paths.backup))
    ) {
      await fs.rename(paths.backup, paths.target);
    }
    throw error;
  }
};

export interface RecoverAtomicJsonResult<T> {
  value: T | null;
  source: 'target' | 'temporary' | 'backup' | 'none';
}

const readValidJson = async <T>(
  filePath: string,
  validate: (value: unknown) => value is T
): Promise<T | null> => {
  try {
    const value: unknown = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    return validate(value) ? value : null;
  } catch {
    return null;
  }
};

export const recoverAtomicJson = async <T>(
  paths: AtomicJsonPaths,
  validate: (value: unknown) => value is T
): Promise<RecoverAtomicJsonResult<T>> => {
  const target = await readValidJson(paths.target, validate);
  if (target) {
    if (await exists(paths.temporary)) await fs.unlink(paths.temporary);
    return { value: target, source: 'target' };
  }

  const [temporary, backup] = await Promise.all([
    readValidJson(paths.temporary, validate),
    readValidJson(paths.backup, validate),
  ]);
  const revision = (value: T | null): number => {
    if (!value || typeof value !== 'object' || !('revision' in value))
      return -1;
    const candidate = (value as { revision?: unknown }).revision;
    return Number.isSafeInteger(candidate) ? Number(candidate) : -1;
  };
  const useTemporary =
    temporary !== null &&
    (backup === null || revision(temporary) >= revision(backup));

  if (useTemporary && temporary) {
    if (await exists(paths.target)) await fs.unlink(paths.target);
    await fs.rename(paths.temporary, paths.target);
    await syncDirectory(paths.target);
    return { value: temporary, source: 'temporary' };
  }

  if (backup) {
    if (await exists(paths.target)) await fs.unlink(paths.target);
    await fs.copyFile(paths.backup, paths.target);
    if (await exists(paths.temporary)) await fs.unlink(paths.temporary);
    await syncDirectory(paths.target);
    return { value: backup, source: 'backup' };
  }

  return { value: null, source: 'none' };
};
