import path from 'path';
import fs from 'fs/promises';

import {
  ensureSafeProjectWritePath,
  openProjectFileForWrite,
} from './project-paths';

export interface PendingManagedFile {
  relativePath: string;
  bytes: Uint8Array;
}

export const writePendingManagedFile = async (
  packagePath: string,
  file: PendingManagedFile
): Promise<void> => {
  const target = await ensureSafeProjectWritePath(
    packagePath,
    file.relativePath
  );
  const temporaryRelativePath = `${file.relativePath}.tmp`;
  const temporary = await ensureSafeProjectWritePath(
    packagePath,
    temporaryRelativePath
  );
  const handle = await openProjectFileForWrite(temporary);
  try {
    await handle.writeFile(file.bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, target);
  const directory = await fs.open(path.dirname(target), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
};
