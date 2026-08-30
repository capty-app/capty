import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { writeJsonAtomic } from '@/main/editor-v2/project/atomic-project-writer';
import { writePendingManagedFile } from '@/main/editor-v2/project/pending-managed-file';
import { getEditorV2ProjectPaths } from '@/main/editor-v2/project/project-paths';

const temporaryDirectories: string[] = [];

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-path-policy-'));
  temporaryDirectories.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('Editor V2 project write path security', () => {
  it('rejects a symlinked managed directory without writing outside the package', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const outsidePath = path.join(root, 'outside');
    await Promise.all([fs.mkdir(packagePath), fs.mkdir(outsidePath)]);
    await fs.symlink(outsidePath, path.join(packagePath, 'media'));

    await expect(
      writePendingManagedFile(packagePath, {
        relativePath: path.join('media', 'asset', 'image.png'),
        bytes: Buffer.from('image'),
      })
    ).rejects.toThrow('symbolic link');
    await expect(
      fs.access(path.join(outsidePath, 'asset', 'image.png'))
    ).rejects.toThrow();
  });

  it('does not follow an atomic temporary-file symlink', async () => {
    const root = await createRoot();
    const packagePath = path.join(root, 'Project.capty');
    const outsideFile = path.join(root, 'outside.json');
    await fs.mkdir(packagePath);
    await fs.writeFile(outsideFile, 'unchanged');
    const paths = getEditorV2ProjectPaths(packagePath);
    await fs.symlink(outsideFile, paths.projectTemporary);

    await expect(
      writeJsonAtomic(
        {
          target: paths.project,
          temporary: paths.projectTemporary,
          backup: paths.projectBackup,
        },
        { revision: 1 }
      )
    ).rejects.toThrow();
    await expect(fs.readFile(outsideFile, 'utf-8')).resolves.toBe('unchanged');
  });
});
