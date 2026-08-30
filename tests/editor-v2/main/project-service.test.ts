import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { createDefaultEditorWorkspace } from '@/editor-v2/persistence/workspace';
import {
  getProjectFormat,
  isValidProject,
} from '@/main/capture/video/recording-project';
import {
  createV1ImportManifest,
  fingerprintManifest,
} from '@/main/editor-v2/data/legacy-data-reader';
import { writeJsonAtomic } from '@/main/editor-v2/project/atomic-project-writer';
import { getEditorV2ProjectPaths } from '@/main/editor-v2/project/project-paths';
import { EditorProjectService } from '@/main/editor-v2/project/project-service';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'capty-v2-project-')
  );
  temporaryDirectories.push(directory);
  return directory;
};

const createProject = (name = 'Project') =>
  createEmptyEditorProject({
    id: 'project-id',
    name,
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence-id',
    videoTrackId: 'video-track',
    audioTrackId: 'audio-track',
  });

const createStandaloneProject = (sourcePath: string) => {
  const project = createProject('Standalone');
  project.assets.source = {
    id: 'source',
    kind: 'video',
    name: 'Source',
    locator: {
      kind: 'linked',
      absolutePath: sourcePath,
      fingerprint: { byteLength: 5, sha256: 'source' },
    },
    importedAt: '2026-08-30T00:00:00.000Z',
    durationTicks: 360_000,
    width: 1920,
    height: 1080,
    frameRate: { numerator: 60, denominator: 1 },
    videoStreams: [],
    audioStreams: [],
  };
  return project;
};

const writeProject = async (packagePath: string, project = createProject()) => {
  const paths = getEditorV2ProjectPaths(packagePath);
  await writeJsonAtomic(
    {
      target: paths.project,
      temporary: paths.projectTemporary,
      backup: paths.projectBackup,
    },
    project
  );
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('Editor V2 project service', () => {
  it('recognizes V1-only, V2-only, and hybrid packages', async () => {
    const root = await createTemporaryDirectory();
    const v1 = path.join(root, 'V1.capty');
    const v2 = path.join(root, 'V2.capty');
    const hybrid = path.join(root, 'Hybrid.capty');
    await Promise.all([fs.mkdir(v1), fs.mkdir(v2), fs.mkdir(hybrid)]);
    await fs.writeFile(path.join(v1, 'recording.mov'), 'v1');
    await fs.writeFile(path.join(hybrid, 'recording.mov'), 'hybrid');
    await writeProject(v2);
    await writeProject(hybrid);

    expect(getProjectFormat(v1)).toBe('v1');
    expect(getProjectFormat(v2)).toBe('v2');
    expect(getProjectFormat(hybrid)).toBe('hybrid');
    expect(isValidProject(v2)).toBe(true);
  });

  it('persists workspace layout and restores it when the project reopens', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Workspace.capty');
    await fs.mkdir(packagePath);
    await writeProject(packagePath);
    const service = new EditorProjectService();
    const opened = await service.open(packagePath, 'window-1', undefined);
    const workspace = {
      ...opened.workspace,
      leftDock: { ...opened.workspace.leftDock, size: 384, collapsed: true },
      timeline: { ...opened.workspace.timeline, height: 336 },
    };

    await expect(
      service.saveWorkspace(
        opened.session,
        opened.workspace.revision,
        workspace
      )
    ).resolves.toEqual({ status: 'saved', revision: 1 });
    service.release(opened.session);

    const reopened = await service.open(packagePath, 'window-2', undefined);
    expect(reopened.workspace).toMatchObject({
      revision: 1,
      leftDock: { size: 384, collapsed: true },
      timeline: { height: 336 },
    });
    service.release(reopened.session);
  });

  it('recovers V2-only packages when the atomic target is missing or corrupt', async () => {
    const root = await createTemporaryDirectory();
    const missingTargetPath = path.join(root, 'MissingTarget.capty');
    const corruptTargetPath = path.join(root, 'CorruptTarget.capty');
    await Promise.all([
      fs.mkdir(missingTargetPath),
      fs.mkdir(corruptTargetPath),
    ]);
    await writeProject(missingTargetPath);
    await writeProject(corruptTargetPath);
    const missingPaths = getEditorV2ProjectPaths(missingTargetPath);
    const corruptPaths = getEditorV2ProjectPaths(corruptTargetPath);
    await fs.rename(missingPaths.project, missingPaths.projectTemporary);
    await fs.copyFile(corruptPaths.project, corruptPaths.projectBackup);
    await fs.writeFile(corruptPaths.project, '{corrupt');

    expect(getProjectFormat(missingTargetPath)).toBe('v2');
    expect(getProjectFormat(corruptTargetPath)).toBe('v2');
    const service = new EditorProjectService();
    const missing = await service.open(
      missingTargetPath,
      'missing-window',
      undefined
    );
    expect(missing.recoveredFrom.project).toBe('temporary');
    service.release(missing.session);
    const corrupt = await service.open(
      corruptTargetPath,
      'corrupt-window',
      undefined
    );
    expect(corrupt.recoveredFrom.project).toBe('backup');
    service.release(corrupt.session);
  });

  it('locks canonical identities across direct and symlink opens', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Project.capty');
    const aliasPath = path.join(root, 'Alias.capty');
    await fs.mkdir(packagePath);
    await writeProject(packagePath);
    await fs.symlink(packagePath, aliasPath);

    const service = new EditorProjectService();
    const first = await service.open(packagePath, 'window-1', undefined);
    await expect(
      service.open(packagePath, 'window-2', undefined)
    ).rejects.toThrow('already open');
    await expect(
      service.open(aliasPath, 'window-2', undefined)
    ).rejects.toThrow('already open');
    await expect(
      new EditorProjectService().open(aliasPath, 'window-1', undefined)
    ).rejects.toThrow('already open');

    expect(service.release(first.session)).toBe(true);
    const reopened = await service.open(aliasPath, 'window-2', undefined);
    expect(reopened.project.id).toBe('project-id');
    expect(service.release(reopened.session)).toBe(true);
  });

  it('requires window-scoped authorization for linked media locators', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Linked.capty');
    const linkedPath = path.join(root, 'linked.png');
    await fs.mkdir(packagePath);
    await fs.writeFile(linkedPath, 'image');
    const project = createProject();
    project.assets.image = {
      id: 'image',
      kind: 'image',
      name: 'Linked image',
      locator: {
        kind: 'linked',
        absolutePath: linkedPath,
        fingerprint: { byteLength: 5, sha256: 'linked' },
      },
      importedAt: '2026-08-30T00:00:00.000Z',
      width: 100,
      height: 100,
      orientation: 1,
      defaultStillDurationTicks: 360_000,
    };
    await writeProject(packagePath, project);

    const service = new EditorProjectService();
    await expect(
      service.open(packagePath, 'unauthorized-window', undefined)
    ).rejects.toThrow('not authorized');
    const authorized = await service.open(
      packagePath,
      'authorized-window',
      undefined,
      [linkedPath]
    );
    expect(authorized.project.assets.image).toBeDefined();
    service.release(authorized.session);
  });

  it('imports V1 in memory without writing or changing V1 files', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Legacy.capty');
    await fs.mkdir(packagePath);
    await fs.writeFile(path.join(packagePath, 'recording.mov'), 'recording');
    await fs.writeFile(path.join(packagePath, 'state.json'), 'legacy-state');
    const before = await Promise.all(
      ['recording.mov', 'state.json'].map(file =>
        fs.readFile(path.join(packagePath, file), 'utf-8')
      )
    );

    const service = new EditorProjectService();
    const opened = await service.open(packagePath, 'window-1', async () => ({
      project: createProject(),
      workspace: createDefaultEditorWorkspace(),
      diagnostics: [],
    }));

    expect(opened.importedInMemory).toBe(true);
    await expect(
      fs.access(path.join(packagePath, 'project.json'))
    ).rejects.toThrow();
    const after = await Promise.all(
      ['recording.mov', 'state.json'].map(file =>
        fs.readFile(path.join(packagePath, file), 'utf-8')
      )
    );
    expect(after).toEqual(before);
    service.release(opened.session);
  });

  it('restores and continues saving V1-only workspace state before project creation', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Legacy.capty');
    await fs.mkdir(packagePath);
    await fs.writeFile(path.join(packagePath, 'recording.mov'), 'recording');
    const importProject = async () => ({
      project: createProject(),
      workspace: createDefaultEditorWorkspace(),
      diagnostics: [],
    });
    const service = new EditorProjectService();
    const opened = await service.open(packagePath, 'window-1', importProject);
    const changedWorkspace = {
      ...opened.workspace,
      leftDock: { size: 360, collapsed: true },
    };
    await expect(
      service.saveWorkspace(opened.session, 0, changedWorkspace)
    ).resolves.toEqual({ status: 'saved', revision: 1 });
    service.release(opened.session);

    const reopened = await service.open(packagePath, 'window-2', importProject);
    expect(reopened.workspace).toMatchObject({
      revision: 1,
      leftDock: { size: 360, collapsed: true },
    });
    await expect(
      service.saveWorkspace(reopened.session, 1, {
        ...reopened.workspace,
        rightDock: { size: 300, collapsed: true },
      })
    ).resolves.toEqual({ status: 'saved', revision: 2 });
    service.release(reopened.session);
  });

  it('serializes saves and never overwrites a stale revision', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Project.capty');
    await fs.mkdir(packagePath);
    await writeProject(packagePath);

    const service = new EditorProjectService();
    const opened = await service.open(packagePath, 'window-1', undefined);
    const firstProject = { ...opened.project, name: 'First' };
    const secondProject = { ...opened.project, name: 'Second' };
    const firstSave = service.saveProject(opened.session, 0, firstProject);
    const secondSave = service.saveProject(opened.session, 1, secondProject);

    await expect(firstSave).resolves.toMatchObject({
      status: 'saved',
      revision: 1,
    });
    await expect(secondSave).resolves.toMatchObject({
      status: 'saved',
      revision: 2,
    });

    const stale = await service.saveProject(opened.session, 0, {
      ...opened.project,
      name: 'Stale overwrite',
    });
    expect(stale).toEqual({ status: 'stale', diskRevision: 2 });
    const saved = JSON.parse(
      await fs.readFile(path.join(packagePath, 'project.json'), 'utf-8')
    ) as { name: string; revision: number };
    expect(saved).toMatchObject({ name: 'Second', revision: 2 });
    expect(opened.session.staleRecoveryOpen).toBe(true);
    await expect(
      service.rename(
        opened.session,
        path.join(root, 'Blocked.capty'),
        async () => undefined
      )
    ).rejects.toThrow('stale recovery');
    service.release(opened.session);
  });

  it('detects V1 divergence only after an original import file changes', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Legacy.capty');
    await fs.mkdir(packagePath);
    await fs.writeFile(path.join(packagePath, 'recording.mov'), 'recording');
    await fs.writeFile(path.join(packagePath, 'state.json'), 'state');
    const files = await createV1ImportManifest(packagePath);
    const importedProject = {
      ...createProject(),
      importedFromV1: {
        packageFingerprint: fingerprintManifest(files),
        importedAt: '2026-08-30T00:00:00.000Z',
        files,
      },
    };

    const service = new EditorProjectService();
    const imported = await service.open(packagePath, 'window-1', async () => ({
      project: importedProject,
      workspace: createDefaultEditorWorkspace(),
      diagnostics: [],
    }));
    await expect(
      service.saveProject(imported.session, 0, importedProject)
    ).resolves.toMatchObject({ status: 'saved', revision: 1 });
    service.release(imported.session);

    const unchanged = await service.open(packagePath, 'window-2', undefined);
    expect(unchanged.divergenceDetected).toBe(false);
    service.release(unchanged.session);

    await fs.writeFile(path.join(packagePath, 'state.json'), 'changed');
    const changed = await service.open(packagePath, 'window-3', undefined);
    expect(changed.divergenceDetected).toBe(true);
    service.release(changed.session);
  });

  it('rekeys an open package on rename and rolls back adapter failure', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Project.capty');
    const failedPath = path.join(root, 'Failed.capty');
    const renamedPath = path.join(root, 'Renamed.capty');
    await fs.mkdir(packagePath);
    await writeProject(packagePath);
    const canonicalRoot = await fs.realpath(root);
    const canonicalPackagePath = path.join(canonicalRoot, 'Project.capty');
    const canonicalRenamedPath = path.join(canonicalRoot, 'Renamed.capty');

    const service = new EditorProjectService();
    const opened = await service.open(packagePath, 'window-1', undefined);
    await expect(
      service.rename(opened.session, failedPath, async () => {
        throw new Error('adapter failed');
      })
    ).rejects.toThrow('adapter failed');
    await expect(fs.access(packagePath)).resolves.toBeUndefined();
    await expect(fs.access(failedPath)).rejects.toThrow();

    const rekeys: string[][] = [];
    await service.rename(
      opened.session,
      renamedPath,
      async (oldPath, newPath) => {
        rekeys.push([oldPath, newPath]);
      }
    );
    expect(rekeys).toEqual([[canonicalPackagePath, canonicalRenamedPath]]);
    expect(opened.session.location).toMatchObject({
      kind: 'capty-package',
      packagePath: canonicalRenamedPath,
    });
    await expect(
      service.open(renamedPath, 'window-2', undefined)
    ).rejects.toThrow('already open');
    expect(service.release(opened.session)).toBe(true);
  });

  it('reloads a newer disk revision after stale save without overwriting it', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Stale.capty');
    await fs.mkdir(packagePath);
    await writeProject(packagePath);
    const service = new EditorProjectService();
    const opened = await service.open(packagePath, 'window-1', undefined);
    const external = { ...createProject('External'), revision: 5 };
    await writeProject(packagePath, external);

    await expect(
      service.saveProject(
        opened.session,
        opened.project.revision,
        createProject('Local')
      )
    ).resolves.toEqual({ status: 'stale', diskRevision: 5 });
    expect(opened.session.staleRecoveryOpen).toBe(true);
    await expect(
      service.saveProject(opened.session, 5, createProject('Overwrite'))
    ).resolves.toEqual({
      status: 'failed',
      error: 'Reload or save a copy before saving this project',
    });
    const reloaded = await service.reload(opened.session);
    expect(reloaded.project).toMatchObject({ name: 'External', revision: 5 });
    expect(opened.session.staleRecoveryOpen).toBe(false);
    expect(service.release(opened.session)).toBe(true);
  });

  it('saves a non-destructive package copy with independent revisions', async () => {
    const root = await createTemporaryDirectory();
    const packagePath = path.join(root, 'Original.capty');
    const copyPath = path.join(root, 'Copy.capty');
    await fs.mkdir(packagePath);
    await fs.writeFile(path.join(packagePath, 'recording.mov'), 'legacy');
    await writeProject(packagePath);
    const service = new EditorProjectService();
    const opened = await service.open(packagePath, 'window-1', undefined);
    const copiedProject = { ...opened.project, name: 'Copied edits' };

    await service.saveCopy(
      opened.session,
      copyPath,
      copiedProject,
      opened.workspace
    );
    expect(
      await fs.readFile(path.join(copyPath, 'recording.mov'), 'utf-8')
    ).toBe('legacy');
    const copyService = new EditorProjectService();
    const copy = await copyService.open(copyPath, 'copy-window', undefined);
    expect(copy.project).toMatchObject({ name: 'Copied edits', revision: 1 });
    expect(copy.workspace.revision).toBe(1);
    expect(service.release(opened.session)).toBe(true);
    expect(copyService.release(copy.session)).toBe(true);
  });

  it('converts a standalone source into a V2 package by managed copy', async () => {
    const root = await createTemporaryDirectory();
    const sourcePath = path.join(root, 'source.mov');
    const destinationPath = path.join(root, 'Converted.capty');
    await fs.writeFile(sourcePath, 'video');
    const project = createStandaloneProject(sourcePath);
    const workspace = createDefaultEditorWorkspace();
    const service = new EditorProjectService();
    const opened = await service.open(sourcePath, 'window-1', async () => ({
      project,
      workspace,
      diagnostics: [],
    }));

    const converted = await service.convertStandalone({
      session: opened.session,
      destinationPath,
      project,
      workspace,
      policy: 'copy',
      sourceFingerprint: { byteLength: 5, sha256: 'source' },
      rekeyAdapters: async () => undefined,
    });

    expect(converted.revision).toBe(1);
    expect(converted.assets.source.locator).toEqual({
      kind: 'managed',
      relativePath: path.join('media', 'source', 'source.mov'),
    });
    expect(await fs.readFile(sourcePath, 'utf-8')).toBe('video');
    expect(
      await fs.readFile(
        path.join(destinationPath, 'media', 'source', 'source.mov'),
        'utf-8'
      )
    ).toBe('video');
    expect(getProjectFormat(destinationPath)).toBe('v2');
    expect(opened.session.location).toMatchObject({
      kind: 'capty-package',
      packagePath: await fs.realpath(destinationPath),
      format: 'v2',
    });
    expect(service.release(opened.session)).toBe(true);
  });
});
