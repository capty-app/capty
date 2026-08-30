import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import {
  ManagedMediaRemovalService,
  mediaAssetIsReferenced,
  type ManagedMediaRemovalFileSystem,
} from '@/main/editor-v2/media/managed-media-removal';
import { ensureEditorV2ProjectDirectories } from '@/main/editor-v2/project/project-paths';
import type { EditorProjectV2 } from '@/types/editor-v2';

const temporaryDirectories: string[] = [];

const createFixture = async (): Promise<{
  packagePath: string;
  assetDirectory: string;
  project: EditorProjectV2;
}> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-removal-'));
  temporaryDirectories.push(root);
  const packagePath = path.join(root, 'Project.capty');
  await fs.mkdir(packagePath);
  await ensureEditorV2ProjectDirectories(packagePath);
  const assetDirectory = path.join(packagePath, 'media', 'managed');
  await fs.mkdir(assetDirectory);
  await fs.writeFile(path.join(assetDirectory, 'media.png'), 'managed-media');
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.managed = {
    id: 'managed',
    kind: 'image',
    name: 'Managed',
    locator: {
      kind: 'managed',
      relativePath: path.join('media', 'managed', 'media.png'),
    },
    importedAt: '2026-08-30T00:00:00.000Z',
    width: 100,
    height: 100,
    orientation: 1,
    defaultStillDurationTicks: 100,
  };
  return { packagePath, assetDirectory, project };
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const delegatedFileSystem = (): ManagedMediaRemovalFileSystem => ({
  readdir: (directoryPath, options) => fs.readdir(directoryPath, options),
  rename: (sourcePath, destinationPath) =>
    fs.rename(sourcePath, destinationPath),
  rm: (targetPath, options) => fs.rm(targetPath, options),
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('managed media permanent removal', () => {
  it('rejects referenced media before moving any files', async () => {
    const fixture = await createFixture();
    fixture.project.sequence.preRoll = {
      kind: 'output-frame-count',
      assetId: 'managed',
      frames: 1,
    };
    expect(mediaAssetIsReferenced(fixture.project, 'managed')).toBe(true);
    await expect(
      new ManagedMediaRemovalService().remove({
        packagePath: fixture.packagePath,
        project: fixture.project,
        assetId: 'managed',
        commit: vi.fn(),
      })
    ).rejects.toThrow('still referenced');
    expect(await exists(fixture.assetDirectory)).toBe(true);
  });

  it('rejects deletion when another asset aliases the managed directory', async () => {
    const fixture = await createFixture();
    fixture.project.assets.alias = {
      ...structuredClone(fixture.project.assets.managed),
      id: 'alias',
      name: 'Alias',
      locator: {
        kind: 'legacy-package-read-only',
        relativePath: path.join('media', 'managed', 'media.png'),
        fingerprint: { byteLength: 13, sha256: 'alias' },
      },
    };

    await expect(
      new ManagedMediaRemovalService().remove({
        packagePath: fixture.packagePath,
        project: fixture.project,
        assetId: 'managed',
        commit: vi.fn(),
      })
    ).rejects.toThrow('referenced by another asset');
    expect(await exists(fixture.assetDirectory)).toBe(true);
  });

  it('commits the history boundary before deleting its tombstone', async () => {
    const fixture = await createFixture();
    const commit = vi.fn(async project => ({ ...project, revision: 2 }));
    const result = await new ManagedMediaRemovalService().remove({
      packagePath: fixture.packagePath,
      project: fixture.project,
      assetId: 'managed',
      commit,
    });

    expect(commit).toHaveBeenCalledOnce();
    expect(result.project.assets.managed).toBeUndefined();
    expect(result.project.revision).toBe(2);
    expect(await exists(fixture.assetDirectory)).toBe(false);
    expect(
      await fs.readdir(path.join(fixture.packagePath, 'media', '.tombstones'))
    ).toEqual([]);
  });

  it('restores the asset when document commit fails after the tombstone rename', async () => {
    const fixture = await createFixture();
    await expect(
      new ManagedMediaRemovalService().remove({
        packagePath: fixture.packagePath,
        project: fixture.project,
        assetId: 'managed',
        commit: vi.fn().mockRejectedValue(new Error('write failed')),
      })
    ).rejects.toThrow('write failed');
    expect(await exists(fixture.assetDirectory)).toBe(true);
    expect(
      await fs.readFile(path.join(fixture.assetDirectory, 'media.png'), 'utf-8')
    ).toBe('managed-media');
  });

  it('retains a retryable tombstone when post-commit cleanup fails', async () => {
    const fixture = await createFixture();
    const fileSystem = delegatedFileSystem();
    const rm = vi.fn(fileSystem.rm);
    rm.mockRejectedValueOnce(new Error('cleanup failed'));
    const service = new ManagedMediaRemovalService({ ...fileSystem, rm });
    const result = await service.remove({
      packagePath: fixture.packagePath,
      project: fixture.project,
      assetId: 'managed',
      commit: async project => ({ ...project, revision: 2 }),
    });

    expect(result.cleanupWarning).toContain('cleanup failed');
    const tombstones = await fs.readdir(
      path.join(fixture.packagePath, 'media', '.tombstones')
    );
    expect(tombstones).toHaveLength(1);
    const committed = result.project;
    await new ManagedMediaRemovalService().recover(
      fixture.packagePath,
      committed
    );
    expect(
      await fs.readdir(path.join(fixture.packagePath, 'media', '.tombstones'))
    ).toEqual([]);
    expect(await exists(fixture.assetDirectory)).toBe(false);
  });

  it('restores or purges tombstones according to the committed document after a crash', async () => {
    const restoreFixture = await createFixture();
    const restoreTombstones = path.join(
      restoreFixture.packagePath,
      'media',
      '.tombstones'
    );
    const tombstoneName = `${Buffer.from('managed').toString('base64url')}.crash`;
    await fs.rename(
      restoreFixture.assetDirectory,
      path.join(restoreTombstones, tombstoneName)
    );
    await new ManagedMediaRemovalService().recover(
      restoreFixture.packagePath,
      restoreFixture.project
    );
    expect(await exists(restoreFixture.assetDirectory)).toBe(true);

    const purgeFixture = await createFixture();
    const purgeTombstones = path.join(
      purgeFixture.packagePath,
      'media',
      '.tombstones'
    );
    await fs.rename(
      purgeFixture.assetDirectory,
      path.join(purgeTombstones, tombstoneName)
    );
    const committed = structuredClone(purgeFixture.project);
    delete committed.assets.managed;
    await new ManagedMediaRemovalService().recover(
      purgeFixture.packagePath,
      committed
    );
    expect(await exists(purgeFixture.assetDirectory)).toBe(false);
    expect(await fs.readdir(purgeTombstones)).toEqual([]);
  });

  it('blocks open when referenced media cannot be restored from a tombstone', async () => {
    const fixture = await createFixture();
    const tombstones = path.join(fixture.packagePath, 'media', '.tombstones');
    const tombstoneName = `${Buffer.from('managed').toString('base64url')}.crash`;
    await fs.rename(
      fixture.assetDirectory,
      path.join(tombstones, tombstoneName)
    );
    const fileSystem = delegatedFileSystem();
    const service = new ManagedMediaRemovalService({
      ...fileSystem,
      rename: vi.fn().mockRejectedValue(new Error('restore failed')),
    });

    await expect(
      service.recover(fixture.packagePath, fixture.project)
    ).rejects.toThrow('Managed media recovery failed for managed');
  });

  it('leaves the document and source untouched when the initial rename fails', async () => {
    const fixture = await createFixture();
    const fileSystem = delegatedFileSystem();
    const service = new ManagedMediaRemovalService({
      ...fileSystem,
      rename: vi.fn().mockRejectedValue(new Error('rename failed')),
    });
    const commit = vi.fn();
    await expect(
      service.remove({
        packagePath: fixture.packagePath,
        project: fixture.project,
        assetId: 'managed',
        commit,
      })
    ).rejects.toThrow('rename failed');
    expect(commit).not.toHaveBeenCalled();
    expect(await exists(fixture.assetDirectory)).toBe(true);
  });
});
