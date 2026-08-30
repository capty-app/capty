import path from 'path';
import fs from 'fs/promises';

export interface ProjectLock {
  identity: string;
  ownerId: string;
}

const projectOwners = new Map<string, string>();

export class ProjectLockService {
  private readonly owners = projectOwners;

  async canonicalize(projectPath: string): Promise<string> {
    const absolutePath = path.resolve(projectPath);
    try {
      return await fs.realpath(absolutePath);
    } catch {
      const parent = await fs.realpath(path.dirname(absolutePath));
      return path.join(parent, path.basename(absolutePath));
    }
  }

  async acquire(projectPath: string, ownerId: string): Promise<ProjectLock> {
    const identity = await this.canonicalize(projectPath);
    const existingOwner = this.owners.get(identity);
    if (existingOwner) {
      throw new Error('Project is already open for editing');
    }

    this.owners.set(identity, ownerId);
    return { identity, ownerId };
  }

  getOwner(identity: string): string | undefined {
    return this.owners.get(identity);
  }

  async rekey(
    lock: ProjectLock,
    destinationPath: string
  ): Promise<ProjectLock> {
    if (this.owners.get(lock.identity) !== lock.ownerId) {
      throw new Error('Project lock is not owned by this editor');
    }

    const destinationIdentity = await this.canonicalize(destinationPath);
    const destinationOwner = this.owners.get(destinationIdentity);
    if (destinationOwner && destinationOwner !== lock.ownerId) {
      throw new Error('Renamed project identity is already open');
    }

    this.owners.delete(lock.identity);
    this.owners.set(destinationIdentity, lock.ownerId);
    return { identity: destinationIdentity, ownerId: lock.ownerId };
  }

  release(lock: ProjectLock): boolean {
    if (this.owners.get(lock.identity) !== lock.ownerId) return false;
    return this.owners.delete(lock.identity);
  }
}
