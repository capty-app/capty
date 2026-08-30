import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import {
  canonicalizeEditorProjectLocation,
  getEditorProjectIdentityPath,
  migrateHistoryProjectIdentity,
  rekeyHistoryProjectLocation,
} from '@/main/editor-v2/project/project-identity';
import type { HistoryItem } from '@/types/history';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('Editor V2 project identity adapters', () => {
  it('canonicalizes package roots through direct and symlink paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-identity-'));
    temporaryDirectories.push(root);
    const packagePath = path.join(root, 'Project.capty');
    const aliasPath = path.join(root, 'Alias.capty');
    await fs.mkdir(packagePath);
    await fs.writeFile(path.join(packagePath, 'recording.mov'), 'video');
    await fs.symlink(packagePath, aliasPath);

    const direct = await canonicalizeEditorProjectLocation(packagePath);
    const alias = await canonicalizeEditorProjectLocation(
      path.join(aliasPath, 'recording.mov')
    );
    expect(alias).toEqual(direct);
    expect(direct).toMatchObject({
      kind: 'capty-package',
      packagePath: await fs.realpath(packagePath),
      format: 'v1',
    });
  });

  it('migrates and rekeys video history at package-root identity', () => {
    const oldPackage = path.join('/projects', 'Old.capty');
    const newPackage = path.join('/projects', 'New.capty');
    const item: HistoryItem = {
      id: 'history',
      timestamp: 1,
      originalPath: path.join(oldPackage, 'recording.mov'),
      type: 'video',
      editorState: null,
    };
    const migrated = migrateHistoryProjectIdentity(item, {
      kind: 'capty-package',
      packagePath: oldPackage,
      format: 'v1',
      v1RecordingPath: path.join(oldPackage, 'recording.mov'),
    });
    const rekeyed = rekeyHistoryProjectLocation(
      migrated,
      oldPackage,
      newPackage
    );

    expect(getEditorProjectIdentityPath(item.originalPath)).toBe(oldPackage);
    expect(rekeyed).toMatchObject({
      originalPath: newPackage,
      projectLocation: {
        kind: 'capty-package',
        packagePath: newPackage,
        v1RecordingPath: path.join(newPackage, 'recording.mov'),
      },
    });
  });
});
