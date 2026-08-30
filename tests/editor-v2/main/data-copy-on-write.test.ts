import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { fingerprintFile } from '@/main/editor-v2/data/legacy-data-reader';
import { writeJsonAtomic } from '@/main/editor-v2/project/atomic-project-writer';
import { getEditorV2ProjectPaths } from '@/main/editor-v2/project/project-paths';
import {
  deleteEditorData,
  recoverOrphanEditorData,
  resetEditorDataToV1,
  writeEditorDataCopyOnWrite,
} from '@/main/editor-v2/data/v2-data-service';
import type {
  CaptyRecordingMediaAsset,
  EditorProjectV2,
  V1ReadOnlyDataLocator,
} from '@/types/editor-v2';

const temporaryDirectories: string[] = [];

const createTemporaryPackage = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-data-cow-'));
  temporaryDirectories.push(root);
  const packagePath = path.join(root, 'Project.capty');
  await fs.mkdir(packagePath);
  return packagePath;
};

const createProject = (locator: V1ReadOnlyDataLocator): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video-track',
    audioTrackId: 'audio-track',
  });
  const asset: CaptyRecordingMediaAsset = {
    id: 'recording-asset',
    kind: 'capty-recording',
    name: 'Recording',
    locator: {
      kind: 'legacy-package-read-only',
      relativePath: 'recording.mov',
      fingerprint: { byteLength: 1, sha256: 'recording' },
    },
    importedAt: '2026-08-30T00:00:00.000Z',
    durationTicks: 360_000,
    width: 1920,
    height: 1080,
    frameRate: { numerator: 60, denominator: 1 },
    videoStreams: [],
    audioStreams: [],
    sources: {
      cursor: { locator, recordingOffsetTicks: 0 },
      originalV1State: {
        kind: 'v1-read-only',
        relativePath: 'state.json',
        fingerprint: { byteLength: 1, sha256: 'state' },
      },
    },
  };
  project.assets[asset.id] = asset;
  return project;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('Editor V2 data copy-on-write', () => {
  it('writes only V2 data and preserves every original V1 byte', async () => {
    const packagePath = await createTemporaryPackage();
    const cursorPath = path.join(packagePath, 'cursor.json');
    const statePath = path.join(packagePath, 'state.json');
    await fs.writeFile(cursorPath, '{"legacy":true}\n');
    await fs.writeFile(statePath, '{"version":1}\n');
    const before = await Promise.all([
      fingerprintFile(cursorPath),
      fingerprintFile(statePath),
    ]);
    const locator: V1ReadOnlyDataLocator = {
      kind: 'v1-read-only',
      relativePath: 'cursor.json',
      fingerprint: before[0],
    };
    const project = createProject(locator);

    const result = await writeEditorDataCopyOnWrite({
      packagePath,
      project,
      assetId: 'recording-asset',
      kind: 'cursor',
      expectedLocator: locator,
      value: { edited: true },
      commitProject: async next => next,
    });

    const source = result.project.assets['recording-asset'];
    expect(source.kind).toBe('capty-recording');
    if (source.kind !== 'capty-recording') return;
    expect(source.sources.cursor?.locator).toMatchObject({
      kind: 'v2-data',
    });
    expect(source.sources.cursor?.locator.relativePath).toMatch(
      /^data\/recording-asset\/cursor-[a-f0-9]{16}\.json$/
    );
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(packagePath, result.locator.relativePath),
          'utf-8'
        )
      )
    ).toEqual({ edited: true });
    const after = await Promise.all([
      fingerprintFile(cursorPath),
      fingerprintFile(statePath),
    ]);
    expect(after.map(value => value.sha256)).toEqual(
      before.map(value => value.sha256)
    );
  });

  it('resets and deletes only V2 references while preserving V1 input', async () => {
    const packagePath = await createTemporaryPackage();
    const cursorPath = path.join(packagePath, 'cursor.json');
    await fs.writeFile(cursorPath, '{"legacy":true}\n');
    const originalFingerprint = await fingerprintFile(cursorPath);
    const locator: V1ReadOnlyDataLocator = {
      kind: 'v1-read-only',
      relativePath: 'cursor.json',
      fingerprint: originalFingerprint,
    };
    const project = createProject(locator);
    const edited = await writeEditorDataCopyOnWrite({
      packagePath,
      project,
      assetId: 'recording-asset',
      kind: 'cursor',
      expectedLocator: locator,
      value: { edit: 1 },
      commitProject: async next => next,
    });
    const editedPath = path.join(packagePath, edited.locator.relativePath);

    const reset = await resetEditorDataToV1({
      packagePath,
      project: edited.project,
      expectedLocator: edited.locator,
      commitProject: async next => next,
    });
    const resetAsset = reset.assets['recording-asset'];
    expect(resetAsset.kind).toBe('capty-recording');
    if (resetAsset.kind !== 'capty-recording') return;
    expect(resetAsset.sources.cursor?.locator).toEqual(locator);
    await expect(fs.access(editedPath)).rejects.toThrow();

    const deleted = await deleteEditorData({
      packagePath,
      project: reset,
      expectedLocator: locator,
      commitProject: async next => next,
    });
    const deletedAsset = deleted.assets['recording-asset'];
    expect(deletedAsset.kind).toBe('capty-recording');
    if (deletedAsset.kind !== 'capty-recording') return;
    expect(deletedAsset.sources.cursor).toBeUndefined();
    expect((await fingerprintFile(cursorPath)).sha256).toBe(
      originalFingerprint.sha256
    );
  });

  it('keeps the active V2 data byte-identical when a later commit fails', async () => {
    const packagePath = await createTemporaryPackage();
    const cursorPath = path.join(packagePath, 'cursor.json');
    await fs.writeFile(cursorPath, '{"legacy":true}\n');
    const locator: V1ReadOnlyDataLocator = {
      kind: 'v1-read-only',
      relativePath: 'cursor.json',
      fingerprint: await fingerprintFile(cursorPath),
    };
    const project = createProject(locator);
    const first = await writeEditorDataCopyOnWrite({
      packagePath,
      project,
      assetId: 'recording-asset',
      kind: 'cursor',
      expectedLocator: locator,
      value: { edit: 1 },
      commitProject: async next => next,
    });
    const activePath = path.join(packagePath, first.locator.relativePath);
    const activeFingerprint = await fingerprintFile(activePath);

    await expect(
      writeEditorDataCopyOnWrite({
        packagePath,
        project: first.project,
        assetId: 'recording-asset',
        kind: 'cursor',
        expectedLocator: first.locator,
        value: { edit: 2 },
        commitProject: async () => {
          throw new Error('commit failed');
        },
      })
    ).rejects.toThrow('commit failed');

    const removed = await recoverOrphanEditorData(packagePath, first.project);
    expect(removed).toHaveLength(1);
    expect((await fingerprintFile(activePath)).sha256).toBe(
      activeFingerprint.sha256
    );
  });

  it('retains data referenced by a recoverable project backup', async () => {
    const packagePath = await createTemporaryPackage();
    const cursorPath = path.join(packagePath, 'cursor.json');
    await fs.writeFile(cursorPath, '{"legacy":true}\n');
    const locator: V1ReadOnlyDataLocator = {
      kind: 'v1-read-only',
      relativePath: 'cursor.json',
      fingerprint: await fingerprintFile(cursorPath),
    };
    const project = createProject(locator);
    const paths = getEditorV2ProjectPaths(packagePath);
    const commitProject = async (
      next: EditorProjectV2
    ): Promise<EditorProjectV2> => {
      await writeJsonAtomic(
        {
          target: paths.project,
          temporary: paths.projectTemporary,
          backup: paths.projectBackup,
        },
        next
      );
      return next;
    };
    const first = await writeEditorDataCopyOnWrite({
      packagePath,
      project,
      assetId: 'recording-asset',
      kind: 'cursor',
      expectedLocator: locator,
      value: { edit: 1 },
      commitProject,
    });
    const firstPath = path.join(packagePath, first.locator.relativePath);
    const second = await writeEditorDataCopyOnWrite({
      packagePath,
      project: first.project,
      assetId: 'recording-asset',
      kind: 'cursor',
      expectedLocator: first.locator,
      value: { edit: 2 },
      commitProject,
    });

    await expect(fs.access(firstPath)).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(packagePath, second.locator.relativePath))
    ).resolves.toBeUndefined();
  });

  it('preserves the active file when identical data is written again', async () => {
    const packagePath = await createTemporaryPackage();
    const cursorPath = path.join(packagePath, 'cursor.json');
    await fs.writeFile(cursorPath, '{"legacy":true}\n');
    const locator: V1ReadOnlyDataLocator = {
      kind: 'v1-read-only',
      relativePath: 'cursor.json',
      fingerprint: await fingerprintFile(cursorPath),
    };
    const project = createProject(locator);
    const first = await writeEditorDataCopyOnWrite({
      packagePath,
      project,
      assetId: 'recording-asset',
      kind: 'cursor',
      expectedLocator: locator,
      value: { edit: 1 },
      commitProject: async next => next,
    });

    const second = await writeEditorDataCopyOnWrite({
      packagePath,
      project: first.project,
      assetId: 'recording-asset',
      kind: 'cursor',
      expectedLocator: first.locator,
      value: { edit: 1 },
      commitProject: async next => next,
    });

    expect(second.locator.relativePath).toBe(first.locator.relativePath);
    await expect(
      fs.readFile(path.join(packagePath, second.locator.relativePath), 'utf-8')
    ).resolves.toContain('"edit": 1');
  });

  it('rejects resetting an inactive V2 locator without deleting its file', async () => {
    const packagePath = await createTemporaryPackage();
    const cursorPath = path.join(packagePath, 'cursor.json');
    await fs.writeFile(cursorPath, '{"legacy":true}\n');
    const locator: V1ReadOnlyDataLocator = {
      kind: 'v1-read-only',
      relativePath: 'cursor.json',
      fingerprint: await fingerprintFile(cursorPath),
    };
    const project = createProject(locator);
    const edited = await writeEditorDataCopyOnWrite({
      packagePath,
      project,
      assetId: 'recording-asset',
      kind: 'cursor',
      expectedLocator: locator,
      value: { edit: 1 },
      commitProject: async next => next,
    });
    const activePath = path.join(packagePath, edited.locator.relativePath);

    await expect(
      resetEditorDataToV1({
        packagePath,
        project,
        expectedLocator: edited.locator,
        commitProject: async next => next,
      })
    ).rejects.toThrow('Expected data locator is not active in the project');
    await expect(fs.access(activePath)).resolves.toBeUndefined();
  });

  it('leaves a recoverable orphan when document commit fails', async () => {
    const packagePath = await createTemporaryPackage();
    const cursorPath = path.join(packagePath, 'cursor.json');
    await fs.writeFile(cursorPath, '{"legacy":true}\n');
    const locator: V1ReadOnlyDataLocator = {
      kind: 'v1-read-only',
      relativePath: 'cursor.json',
      fingerprint: await fingerprintFile(cursorPath),
    };
    const project = createProject(locator);

    await expect(
      writeEditorDataCopyOnWrite({
        packagePath,
        project,
        assetId: 'recording-asset',
        kind: 'cursor',
        expectedLocator: locator,
        value: { edited: true },
        commitProject: async () => {
          throw new Error('commit failed');
        },
      })
    ).rejects.toThrow('commit failed');

    const removed = await recoverOrphanEditorData(packagePath, project);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatch(
      /^data\/recording-asset\/cursor-[a-f0-9]{16}\.json$/
    );
    expect(await fs.readFile(cursorPath, 'utf-8')).toBe('{"legacy":true}\n');
  });
});
