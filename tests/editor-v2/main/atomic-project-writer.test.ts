import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import {
  recoverAtomicJson,
  writeJsonAtomic,
} from '@/main/editor-v2/project/atomic-project-writer';

const temporaryDirectories: string[] = [];

const createPaths = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-atomic-'));
  temporaryDirectories.push(directory);
  return {
    target: path.join(directory, 'project.json'),
    temporary: path.join(directory, 'project.json.tmp'),
    backup: path.join(directory, 'project.json.bak'),
  };
};

const isRevision = (value: unknown): value is { revision: number } =>
  !!value &&
  typeof value === 'object' &&
  'revision' in value &&
  typeof value.revision === 'number';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('atomic project writer', () => {
  it('flushes the target and rotates the last known good backup', async () => {
    const paths = await createPaths();
    await writeJsonAtomic(paths, { revision: 1 });
    await writeJsonAtomic(paths, { revision: 2 });

    expect(JSON.parse(await fs.readFile(paths.target, 'utf-8'))).toEqual({
      revision: 2,
    });
    expect(JSON.parse(await fs.readFile(paths.backup, 'utf-8'))).toEqual({
      revision: 1,
    });
    await expect(fs.access(paths.temporary)).rejects.toThrow();
  });

  it('recovers a valid temporary file when the target is corrupt', async () => {
    const paths = await createPaths();
    await fs.writeFile(paths.target, '{invalid');
    await fs.writeFile(paths.temporary, JSON.stringify({ revision: 3 }));

    const recovered = await recoverAtomicJson(paths, isRevision);
    expect(recovered).toEqual({
      value: { revision: 3 },
      source: 'temporary',
    });
    expect(JSON.parse(await fs.readFile(paths.target, 'utf-8'))).toEqual({
      revision: 3,
    });
  });

  it('recovers a valid backup when target and temporary are invalid', async () => {
    const paths = await createPaths();
    await fs.writeFile(paths.target, '{invalid');
    await fs.writeFile(paths.temporary, '{invalid');
    await fs.writeFile(paths.backup, JSON.stringify({ revision: 4 }));

    const recovered = await recoverAtomicJson(paths, isRevision);
    expect(recovered).toEqual({
      value: { revision: 4 },
      source: 'backup',
    });
  });

  it('chooses the highest valid recovery revision when target is invalid', async () => {
    const paths = await createPaths();
    await fs.writeFile(paths.target, '{invalid');
    await fs.writeFile(paths.temporary, JSON.stringify({ revision: 2 }));
    await fs.writeFile(paths.backup, JSON.stringify({ revision: 6 }));

    const recovered = await recoverAtomicJson(paths, isRevision);
    expect(recovered).toEqual({
      value: { revision: 6 },
      source: 'backup',
    });
    await expect(fs.access(paths.temporary)).rejects.toThrow();
  });

  it('never replaces a valid target with a stale temporary file', async () => {
    const paths = await createPaths();
    await fs.writeFile(paths.target, JSON.stringify({ revision: 5 }));
    await fs.writeFile(paths.temporary, JSON.stringify({ revision: 2 }));

    const recovered = await recoverAtomicJson(paths, isRevision);
    expect(recovered).toEqual({
      value: { revision: 5 },
      source: 'target',
    });
    await expect(fs.access(paths.temporary)).rejects.toThrow();
  });
});
