import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, readFileSync, rmSync, renameSync } from 'fs';
import { validateEditorProject } from '@/editor-v2/document/validate';
import type {
  EditorProjectFormat,
  EditorProjectLocation,
} from '@/types/editor-project';
import { PROJECT_EXTENSION, type ProjectRenameResult } from '@/types/video';

export const PROJECT_FILES = {
  RECORDING: 'recording.mov',
  SYSTEM_AUDIO: 'system.m4a',
  MIC_AUDIO: 'mic.m4a',
  CURSOR: 'cursor.json',
  CAMERA_VIDEO: 'camera.mov',
  CAMERA_META: 'camera.json',
  KEYS: 'keys.json',
  EDITOR_STATE: 'state.json',
  SUBTITLE: 'subtitle.json',
  MUSIC_FOLDER: 'music',
  V2_PROJECT: 'project.json',
  V2_WORKSPACE: 'workspace.json',
  V2_MEDIA_FOLDER: 'media',
  V2_DATA_FOLDER: 'data',
  V2_CACHE_FOLDER: 'cache',
} as const;

export { PROJECT_EXTENSION };

export function isRecordingProject(filePath: string): boolean {
  return filePath.endsWith(PROJECT_EXTENSION);
}

export function getProjectFolder(filePath: string): string | null {
  if (isRecordingProject(filePath)) {
    return filePath;
  }

  const dir = path.dirname(filePath);
  if (isRecordingProject(dir)) {
    return dir;
  }

  return null;
}

export function getRecordingVideoPath(projectOrVideoPath: string): string {
  if (isRecordingProject(projectOrVideoPath)) {
    return path.join(projectOrVideoPath, PROJECT_FILES.RECORDING);
  }
  return projectOrVideoPath;
}

export function getSystemAudioPath(projectOrVideoPath: string): string {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (projectFolder) {
    return path.join(projectFolder, PROJECT_FILES.SYSTEM_AUDIO);
  }
  return projectOrVideoPath.replace(/\.[^.]+$/, '.system.m4a');
}

export function getMicAudioPath(projectOrVideoPath: string): string {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (projectFolder) {
    return path.join(projectFolder, PROJECT_FILES.MIC_AUDIO);
  }
  return projectOrVideoPath.replace(/\.[^.]+$/, '.mic.m4a');
}

export function getCursorPath(projectOrVideoPath: string): string {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (projectFolder) {
    return path.join(projectFolder, PROJECT_FILES.CURSOR);
  }
  return projectOrVideoPath.replace(/\.[^.]+$/, '.cursor.json');
}

export function getCameraVideoPath(projectOrVideoPath: string): string {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (projectFolder) {
    return path.join(projectFolder, PROJECT_FILES.CAMERA_VIDEO);
  }
  return projectOrVideoPath.replace(/\.[^.]+$/, '.camera.mov');
}

export function getCameraMetaPath(projectOrVideoPath: string): string {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (projectFolder) {
    return path.join(projectFolder, PROJECT_FILES.CAMERA_META);
  }
  return projectOrVideoPath.replace(/\.[^.]+$/, '.camera.json');
}

export function getKeysPath(projectOrVideoPath: string): string {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (projectFolder) {
    return path.join(projectFolder, PROJECT_FILES.KEYS);
  }
  return projectOrVideoPath.replace(/\.[^.]+$/, '.keys.json');
}

export function getEditorStatePath(projectOrVideoPath: string): string | null {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (projectFolder) {
    return path.join(projectFolder, PROJECT_FILES.EDITOR_STATE);
  }
  return null;
}

export function getSubtitlePath(projectOrVideoPath: string): string | null {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (projectFolder) {
    return path.join(projectFolder, PROJECT_FILES.SUBTITLE);
  }
  return null;
}

export function getMusicFolderPath(projectOrVideoPath: string): string | null {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (!projectFolder) return null;
  return path.join(projectFolder, PROJECT_FILES.MUSIC_FOLDER);
}

export function createProjectFolder(projectPath: string): string {
  if (!isRecordingProject(projectPath)) {
    throw new Error(`Project path must end with ${PROJECT_EXTENSION}`);
  }

  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
  }

  return path.join(projectPath, PROJECT_FILES.RECORDING);
}

export async function deleteProjectFolder(
  projectOrVideoPath: string
): Promise<void> {
  const projectFolder = getProjectFolder(projectOrVideoPath);

  if (projectFolder && existsSync(projectFolder)) {
    rmSync(projectFolder, { recursive: true, force: true });
    console.log(`Project folder deleted: ${projectFolder}`);
    return;
  }

  if (existsSync(projectOrVideoPath)) {
    await fs.unlink(projectOrVideoPath);
  }
}

const hasValidV2Project = (projectPath: string): boolean => {
  const projectFilePath = path.join(projectPath, PROJECT_FILES.V2_PROJECT);
  return [
    projectFilePath,
    `${projectFilePath}.tmp`,
    `${projectFilePath}.bak`,
  ].some(candidatePath => {
    if (!existsSync(candidatePath)) return false;
    try {
      const value: unknown = JSON.parse(readFileSync(candidatePath, 'utf-8'));
      return validateEditorProject(value).valid;
    } catch {
      return false;
    }
  });
};

export function getProjectFormat(
  projectPath: string
): EditorProjectFormat | null {
  if (!isRecordingProject(projectPath)) return null;

  const hasV1 = existsSync(path.join(projectPath, PROJECT_FILES.RECORDING));
  const hasV2 = hasValidV2Project(projectPath);

  if (hasV1 && hasV2) return 'hybrid';
  if (hasV2) return 'v2';
  if (hasV1) return 'v1';
  return null;
}

export function getEditorProjectLocation(
  projectOrSourcePath: string
): EditorProjectLocation | null {
  const projectFolder = getProjectFolder(projectOrSourcePath);
  if (!projectFolder) {
    return existsSync(projectOrSourcePath)
      ? { kind: 'standalone', sourcePath: projectOrSourcePath }
      : null;
  }

  const format = getProjectFormat(projectFolder);
  if (!format) return null;

  const recordingPath = path.join(projectFolder, PROJECT_FILES.RECORDING);
  return {
    kind: 'capty-package',
    packagePath: projectFolder,
    format,
    v1RecordingPath: existsSync(recordingPath) ? recordingPath : undefined,
  };
}

export function isValidProject(projectPath: string): boolean {
  return getProjectFormat(projectPath) !== null;
}

export async function getProjectFiles(
  projectOrVideoPath: string
): Promise<string[]> {
  const projectFolder = getProjectFolder(projectOrVideoPath);
  if (!projectFolder || !existsSync(projectFolder)) {
    return [];
  }

  try {
    const files = await fs.readdir(projectFolder);
    return files.map(file => path.join(projectFolder, file));
  } catch {
    return [];
  }
}

function sanitizeProjectName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim();
}

function failResult(projectPath: string, error: string): ProjectRenameResult {
  return {
    success: false,
    newProjectPath: projectPath,
    newVideoPath: getRecordingVideoPath(projectPath),
    error,
  };
}

export function renameRecordingProject(
  currentProjectPath: string,
  newName: string
): ProjectRenameResult {
  if (!isRecordingProject(currentProjectPath)) {
    return failResult(currentProjectPath, 'Not a valid recording project');
  }

  if (!existsSync(currentProjectPath)) {
    return failResult(currentProjectPath, 'Project folder not found');
  }

  const sanitized = sanitizeProjectName(newName);
  if (!sanitized) {
    return failResult(currentProjectPath, 'Invalid project name');
  }

  const parentDir = path.dirname(currentProjectPath);
  const newProjectPath = path.join(parentDir, sanitized + PROJECT_EXTENSION);

  if (newProjectPath === currentProjectPath) {
    return {
      success: true,
      newProjectPath: currentProjectPath,
      newVideoPath: getRecordingVideoPath(currentProjectPath),
    };
  }

  if (existsSync(newProjectPath)) {
    return failResult(
      currentProjectPath,
      'A project with this name already exists'
    );
  }

  try {
    renameSync(currentProjectPath, newProjectPath);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to rename project';
    return failResult(currentProjectPath, message);
  }

  return {
    success: true,
    newProjectPath,
    newVideoPath: getRecordingVideoPath(newProjectPath),
  };
}
