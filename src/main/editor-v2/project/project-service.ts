import path from 'path';
import fs from 'fs/promises';

import { validateEditorProject } from '@/editor-v2/document/validate';
import type { ImportV1ProjectResult } from '@/editor-v2/persistence/import-v1-project';
import {
  createDefaultEditorWorkspace,
  validateEditorWorkspace,
} from '@/editor-v2/persistence/workspace';
import {
  getEditorProjectLocation,
  getProjectFormat,
} from '@/main/capture/video/recording-project';
import type { EditorProjectLocation } from '@/types/editor-project';
import type {
  EditorProjectV2,
  EditorV2SaveResult,
  EditorV2Workspace,
  EditorV2WorkspaceSaveResult,
  MediaFingerprint,
} from '@/types/editor-v2';

import {
  createV1ImportManifest,
  fingerprintManifest,
} from '../data/legacy-data-reader';
import {
  recoverAtomicJson,
  writeJsonAtomic,
  type AtomicJsonPaths,
} from './atomic-project-writer';
import {
  writePendingManagedFile,
  type PendingManagedFile,
} from './pending-managed-file';
import {
  createLinkedPathAuthorization,
  validateProjectLocatorAccess,
} from './project-locator-policy';
import {
  ensureEditorV2ProjectDirectories,
  getEditorV2ProjectPaths,
} from './project-paths';
import { ProjectLockService, type ProjectLock } from './project-lock-service';

export interface EditorProjectSession {
  ownerId: string;
  lock: ProjectLock;
  location: EditorProjectLocation;
  pendingWrites: number;
  staleRecoveryOpen: boolean;
  pendingManagedFiles: PendingManagedFile[];
  linkedPathAuthorization: Set<string>;
}

export interface PreparedV1ImportResult extends ImportV1ProjectResult {
  pendingManagedFiles?: PendingManagedFile[];
}

export interface OpenEditorProjectResult {
  session: EditorProjectSession;
  project: EditorProjectV2;
  workspace: EditorV2Workspace;
  importedInMemory: boolean;
  divergenceDetected: boolean;
  recoveredFrom: {
    project: 'target' | 'temporary' | 'backup' | 'none';
    workspace: 'target' | 'temporary' | 'backup' | 'none';
  };
}

export interface ConvertStandaloneProjectInput {
  session: EditorProjectSession;
  destinationPath: string;
  project: EditorProjectV2;
  workspace: EditorV2Workspace;
  policy: 'copy' | 'link';
  sourceFingerprint: MediaFingerprint;
  rekeyAdapters: (oldPath: string, newPath: string) => Promise<void>;
}

const projectAtomicPaths = (packagePath: string): AtomicJsonPaths => {
  const paths = getEditorV2ProjectPaths(packagePath);
  return {
    target: paths.project,
    temporary: paths.projectTemporary,
    backup: paths.projectBackup,
  };
};

const workspaceAtomicPaths = (packagePath: string): AtomicJsonPaths => {
  const paths = getEditorV2ProjectPaths(packagePath);
  return {
    target: paths.workspace,
    temporary: paths.workspaceTemporary,
    backup: paths.workspaceBackup,
  };
};

const isEditorProject = (value: unknown): value is EditorProjectV2 =>
  validateEditorProject(value).valid;

const isWorkspace = (value: unknown): value is EditorV2Workspace =>
  validateEditorWorkspace(value);

const getPackagePath = (session: EditorProjectSession): string => {
  if (session.location.kind !== 'capty-package') {
    throw new Error('Standalone media must be converted before saving');
  }
  return session.location.packagePath;
};

export class EditorProjectService {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly locks = new ProjectLockService()) {}

  private enqueue<T>(
    session: EditorProjectSession,
    operation: () => Promise<T>
  ): Promise<T> {
    const prior = this.queues.get(session.lock.identity) ?? Promise.resolve();
    session.pendingWrites += 1;
    const result = prior.then(operation, operation);
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    this.queues.set(session.lock.identity, settled);
    return result.finally(() => {
      session.pendingWrites -= 1;
      if (this.queues.get(session.lock.identity) === settled) {
        this.queues.delete(session.lock.identity);
      }
    });
  }

  async open(
    projectPath: string,
    ownerId: string,
    importV1: (() => Promise<PreparedV1ImportResult>) | undefined,
    authorizedLinkedPaths: Iterable<string> = []
  ): Promise<OpenEditorProjectResult> {
    const lock = await this.locks.acquire(projectPath, ownerId);
    try {
      const location = getEditorProjectLocation(lock.identity);
      if (!location) throw new Error('Project or source is invalid');

      const linkedPathAuthorization = await createLinkedPathAuthorization([
        ...authorizedLinkedPaths,
        ...(location.kind === 'standalone' ? [lock.identity] : []),
      ]);
      const session: EditorProjectSession = {
        ownerId,
        lock,
        location,
        pendingWrites: 0,
        staleRecoveryOpen: false,
        pendingManagedFiles: [],
        linkedPathAuthorization,
      };

      if (location.kind === 'standalone') {
        if (!importV1) {
          throw new Error('Standalone source requires a project importer');
        }
        const imported = await importV1();
        session.pendingManagedFiles = imported.pendingManagedFiles ?? [];
        return {
          session,
          project: imported.project,
          workspace: imported.workspace,
          importedInMemory: true,
          divergenceDetected: false,
          recoveredFrom: { project: 'none', workspace: 'none' },
        };
      }

      const projectRecovery = await recoverAtomicJson(
        projectAtomicPaths(location.packagePath),
        isEditorProject
      );
      const workspaceRecovery = await recoverAtomicJson(
        workspaceAtomicPaths(location.packagePath),
        isWorkspace
      );

      if (projectRecovery.value) {
        await validateProjectLocatorAccess(
          location.packagePath,
          projectRecovery.value,
          session.linkedPathAuthorization
        );
        const divergenceDetected = await this.detectDivergence(
          location.packagePath,
          projectRecovery.value
        );
        return {
          session,
          project: projectRecovery.value,
          workspace: workspaceRecovery.value ?? createDefaultEditorWorkspace(),
          importedInMemory: false,
          divergenceDetected,
          recoveredFrom: {
            project: projectRecovery.source,
            workspace: workspaceRecovery.source,
          },
        };
      }

      if (!importV1 || location.format === 'v2') {
        throw new Error('No valid Editor V2 project could be recovered');
      }

      const imported = await importV1();
      await validateProjectLocatorAccess(
        location.packagePath,
        imported.project,
        session.linkedPathAuthorization
      );
      session.pendingManagedFiles = imported.pendingManagedFiles ?? [];
      return {
        session,
        project: imported.project,
        workspace: workspaceRecovery.value ?? imported.workspace,
        importedInMemory: true,
        divergenceDetected: false,
        recoveredFrom: {
          project: projectRecovery.source,
          workspace: workspaceRecovery.source,
        },
      };
    } catch (error) {
      this.locks.release(lock);
      throw error;
    }
  }

  async saveProject(
    session: EditorProjectSession,
    expectedRevision: number,
    project: EditorProjectV2
  ): Promise<EditorV2SaveResult> {
    return this.enqueue(session, async () => {
      try {
        if (session.staleRecoveryOpen) {
          return {
            status: 'failed',
            error: 'Reload or save a copy before saving this project',
          };
        }
        const packagePath = getPackagePath(session);
        const current = await recoverAtomicJson(
          projectAtomicPaths(packagePath),
          isEditorProject
        );
        const diskRevision = current.value?.revision ?? 0;
        if (current.value && diskRevision !== expectedRevision) {
          session.staleRecoveryOpen = true;
          return { status: 'stale', diskRevision };
        }
        if (!current.value && expectedRevision !== 0) {
          session.staleRecoveryOpen = true;
          return { status: 'stale', diskRevision: 0 };
        }

        const nextProject: EditorProjectV2 = {
          ...project,
          revision: expectedRevision + 1,
          updatedAt: new Date().toISOString(),
        };
        const validation = validateEditorProject(nextProject);
        if (!validation.valid) {
          return { status: 'failed', error: 'Project validation failed' };
        }
        await validateProjectLocatorAccess(
          packagePath,
          nextProject,
          session.linkedPathAuthorization
        );

        await ensureEditorV2ProjectDirectories(packagePath);
        for (const file of session.pendingManagedFiles) {
          await writePendingManagedFile(packagePath, file);
        }
        await writeJsonAtomic(projectAtomicPaths(packagePath), nextProject);
        session.pendingManagedFiles = [];
        session.staleRecoveryOpen = false;
        const format = getProjectFormat(packagePath);
        if (format && session.location.kind === 'capty-package') {
          session.location = { ...session.location, format };
        }
        return { status: 'saved', revision: nextProject.revision };
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  async saveWorkspace(
    session: EditorProjectSession,
    expectedRevision: number,
    workspace: EditorV2Workspace
  ): Promise<EditorV2WorkspaceSaveResult> {
    return this.enqueue(session, async () => {
      try {
        if (session.staleRecoveryOpen) {
          return {
            status: 'failed',
            error: 'Reload or save a copy before saving this workspace',
          };
        }
        const packagePath = getPackagePath(session);
        const current = await recoverAtomicJson(
          workspaceAtomicPaths(packagePath),
          isWorkspace
        );
        const diskRevision = current.value?.revision ?? 0;
        if (current.value && diskRevision !== expectedRevision) {
          return { status: 'stale', diskRevision };
        }
        if (!current.value && expectedRevision !== 0) {
          return { status: 'stale', diskRevision: 0 };
        }

        const nextWorkspace = {
          ...workspace,
          revision: expectedRevision + 1,
        };
        if (!validateEditorWorkspace(nextWorkspace)) {
          return { status: 'failed', error: 'Workspace validation failed' };
        }
        await ensureEditorV2ProjectDirectories(packagePath);
        await writeJsonAtomic(workspaceAtomicPaths(packagePath), nextWorkspace);
        return { status: 'saved', revision: nextWorkspace.revision };
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  async reload(
    session: EditorProjectSession
  ): Promise<{ project: EditorProjectV2; workspace: EditorV2Workspace }> {
    return this.enqueue(session, async () => {
      const packagePath = getPackagePath(session);
      const projectRecovery = await recoverAtomicJson(
        projectAtomicPaths(packagePath),
        isEditorProject
      );
      if (!projectRecovery.value) {
        throw new Error('No valid Editor V2 project could be recovered');
      }
      await validateProjectLocatorAccess(
        packagePath,
        projectRecovery.value,
        session.linkedPathAuthorization
      );
      const workspaceRecovery = await recoverAtomicJson(
        workspaceAtomicPaths(packagePath),
        isWorkspace
      );
      session.staleRecoveryOpen = false;
      return {
        project: projectRecovery.value,
        workspace: workspaceRecovery.value ?? createDefaultEditorWorkspace(),
      };
    });
  }

  async saveCopy(
    session: EditorProjectSession,
    destinationPath: string,
    project: EditorProjectV2,
    workspace: EditorV2Workspace
  ): Promise<void> {
    return this.enqueue(session, async () => {
      const packagePath = getPackagePath(session);
      const resolvedDestination = path.resolve(destinationPath);
      const relativeDestination = path.relative(
        packagePath,
        resolvedDestination
      );
      if (
        relativeDestination === '' ||
        (!relativeDestination.startsWith('..') &&
          !path.isAbsolute(relativeDestination))
      ) {
        throw new Error('Save copy destination must be outside the project');
      }
      const stagingPath = `${resolvedDestination}.creating-${session.ownerId}`;
      try {
        await fs.access(resolvedDestination);
        throw new Error('The destination project already exists');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      await fs.rm(stagingPath, { recursive: true, force: true });
      try {
        await fs.cp(packagePath, stagingPath, { recursive: true });
        const nextProject: EditorProjectV2 = {
          ...structuredClone(project),
          revision: 1,
          updatedAt: new Date().toISOString(),
        };
        const nextWorkspace: EditorV2Workspace = {
          ...structuredClone(workspace),
          revision: 1,
        };
        if (!validateEditorProject(nextProject).valid) {
          throw new Error('Project validation failed');
        }
        if (!validateEditorWorkspace(nextWorkspace)) {
          throw new Error('Workspace validation failed');
        }
        await validateProjectLocatorAccess(
          stagingPath,
          nextProject,
          session.linkedPathAuthorization
        );
        await ensureEditorV2ProjectDirectories(stagingPath);
        for (const file of session.pendingManagedFiles) {
          await writePendingManagedFile(stagingPath, file);
        }
        await writeJsonAtomic(projectAtomicPaths(stagingPath), nextProject);
        await writeJsonAtomic(workspaceAtomicPaths(stagingPath), nextWorkspace);
        await fs.rename(stagingPath, resolvedDestination);
      } catch (error) {
        await fs.rm(stagingPath, { recursive: true, force: true });
        throw error;
      }
    });
  }

  async convertStandalone(
    input: ConvertStandaloneProjectInput
  ): Promise<EditorProjectV2> {
    const { session } = input;
    if (session.location.kind !== 'standalone') {
      throw new Error('Only standalone sources can be converted');
    }
    if (session.pendingWrites > 0) {
      throw new Error('Cannot convert while a save is pending');
    }

    const sourcePath = session.location.sourcePath;
    const stagingPath = `${input.destinationPath}.creating-${session.ownerId}`;
    await fs.rm(stagingPath, { recursive: true, force: true });
    await fs.mkdir(stagingPath, { recursive: true });
    let destinationCreated = false;
    let nextLock: ProjectLock | undefined;

    try {
      const assets = structuredClone(input.project.assets);
      const sourceAsset = Object.values(assets).find(
        asset => asset.kind === 'video'
      );
      if (!sourceAsset) {
        throw new Error('Standalone project has no source video asset');
      }

      if (input.policy === 'copy') {
        const relativePath = path.join(
          'media',
          sourceAsset.id,
          path.basename(sourcePath)
        );
        const destination = path.join(stagingPath, relativePath);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(sourcePath, destination);
        sourceAsset.locator = { kind: 'managed', relativePath };
      } else {
        sourceAsset.locator = {
          kind: 'linked',
          absolutePath: sourcePath,
          fingerprint: input.sourceFingerprint,
        };
      }

      const project: EditorProjectV2 = {
        ...input.project,
        assets,
        revision: 1,
        updatedAt: new Date().toISOString(),
      };
      if (!validateEditorProject(project).valid) {
        throw new Error('Converted standalone project is invalid');
      }

      await ensureEditorV2ProjectDirectories(stagingPath);
      await validateProjectLocatorAccess(
        stagingPath,
        project,
        session.linkedPathAuthorization
      );
      await writeJsonAtomic(projectAtomicPaths(stagingPath), project);
      await writeJsonAtomic(workspaceAtomicPaths(stagingPath), input.workspace);
      await fs.rename(stagingPath, input.destinationPath);
      destinationCreated = true;
      nextLock = await this.locks.rekey(session.lock, input.destinationPath);
      const destinationIdentity = nextLock.identity;
      session.lock = nextLock;
      await input.rekeyAdapters(sourcePath, destinationIdentity);
      session.location = {
        kind: 'capty-package',
        packagePath: destinationIdentity,
        format: 'v2',
      };
      return project;
    } catch (error) {
      await fs.rm(stagingPath, { recursive: true, force: true });
      if (destinationCreated) {
        await fs.rm(input.destinationPath, { recursive: true, force: true });
      }
      if (nextLock) {
        session.lock = await this.locks.rekey(nextLock, sourcePath);
      }
      throw error;
    }
  }

  async rename(
    session: EditorProjectSession,
    destinationPath: string,
    rekeyAdapters: (oldPath: string, newPath: string) => Promise<void>
  ): Promise<void> {
    if (session.pendingWrites > 0) {
      throw new Error('Cannot rename while a save is pending');
    }
    if (session.staleRecoveryOpen) {
      throw new Error('Cannot rename while stale recovery is open');
    }
    const packagePath = getPackagePath(session);
    const previousLock = session.lock;
    let nextLock: ProjectLock | undefined;
    await fs.rename(packagePath, destinationPath);
    try {
      nextLock = await this.locks.rekey(previousLock, destinationPath);
      const destinationIdentity = nextLock.identity;
      await rekeyAdapters(packagePath, destinationIdentity);
      const format = getProjectFormat(destinationIdentity);
      if (!format) throw new Error('Renamed project is invalid');
      session.lock = nextLock;
      session.location = {
        kind: 'capty-package',
        packagePath: destinationIdentity,
        format,
        v1RecordingPath:
          session.location.kind === 'capty-package' &&
          session.location.v1RecordingPath
            ? path.join(destinationIdentity, 'recording.mov')
            : undefined,
      };
    } catch (error) {
      await fs.rename(destinationPath, packagePath);
      if (nextLock) {
        session.lock = await this.locks.rekey(nextLock, packagePath);
      }
      throw error;
    }
  }

  async confirmCommittedRevisions(
    session: EditorProjectSession,
    projectRevision: number,
    workspaceRevision: number
  ): Promise<boolean> {
    await (this.queues.get(session.lock.identity) ?? Promise.resolve());
    const packagePath = getPackagePath(session);
    const [project, workspace] = await Promise.all([
      recoverAtomicJson(projectAtomicPaths(packagePath), isEditorProject),
      recoverAtomicJson(workspaceAtomicPaths(packagePath), isWorkspace),
    ]);
    return (
      (project.value?.revision ?? 0) === projectRevision &&
      (workspace.value?.revision ?? 0) === workspaceRevision
    );
  }

  release(session: EditorProjectSession): boolean {
    if (session.pendingWrites > 0) return false;
    this.queues.delete(session.lock.identity);
    return this.locks.release(session.lock);
  }

  async releaseWhenIdle(session: EditorProjectSession): Promise<boolean> {
    await (this.queues.get(session.lock.identity) ?? Promise.resolve());
    return this.release(session);
  }

  private async detectDivergence(
    packagePath: string,
    project: EditorProjectV2
  ): Promise<boolean> {
    if (!project.importedFromV1) return false;
    try {
      const manifest = await createV1ImportManifest(packagePath);
      const originalPaths = new Set(
        project.importedFromV1.files.map(file => file.relativePath)
      );
      const currentV1Files = manifest.filter(file =>
        originalPaths.has(file.relativePath)
      );
      return (
        currentV1Files.length !== project.importedFromV1.files.length ||
        fingerprintManifest(currentV1Files) !==
          project.importedFromV1.packageFingerprint
      );
    } catch {
      return true;
    }
  }
}
