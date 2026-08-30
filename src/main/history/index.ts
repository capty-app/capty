import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, readFileSync, unlinkSync, rmSync } from 'fs';
import crypto from 'crypto';
import type {
  HistoryItem,
  HistoryItemType,
  EditorState,
  VideoRecordingFeatures,
} from '@/types/history.ts';
import { getConfigDir, getHistoryFilePath } from '@/main/utils/paths.ts';
import { validateEditorProject } from '@/editor-v2/document/validate';
import {
  getProjectFolder,
  getMicAudioPath,
  getSystemAudioPath,
  getCameraVideoPath,
  getCursorPath,
  getRecordingVideoPath,
} from '@/main/capture/video/recording-project.ts';
import {
  canonicalizeEditorProjectLocation,
  getEditorProjectIdentityPath,
  migrateHistoryProjectIdentity,
} from '@/main/editor-v2/project/project-identity';
import { getEditorV2ProjectPaths } from '@/main/editor-v2/project/project-paths';
import type { EditorProjectV2 } from '@/types/editor-v2';

export {
  preloadHistoryPopover,
  showHistoryPopover,
  closeHistoryPopover,
  toggleHistoryPopover,
  getHistoryPopover,
  isHistoryPopoverVisible,
} from './popover';
import { getConfig } from '../settings';
import {
  getThumbnail,
  deleteThumbnail,
  clearAllThumbnails,
  rekeyThumbnail,
} from '@/main/utils/thumbnails.ts';

const CONFIG_DIR = getConfigDir();
const HISTORY_FILE = getHistoryFilePath();

let historyItems: HistoryItem[] = [];

let writeQueue: Promise<void> = Promise.resolve();

interface HistoryThumbnailSource {
  sourcePath: string;
  type: 'screenshot' | 'video';
  cacheIdentity: string;
}

const readV2HistoryProject = (packagePath: string): EditorProjectV2 | null => {
  const readCandidate = (candidatePath: string): EditorProjectV2 | null => {
    try {
      const value: unknown = JSON.parse(readFileSync(candidatePath, 'utf-8'));
      return validateEditorProject(value).valid
        ? (value as EditorProjectV2)
        : null;
    } catch {
      return null;
    }
  };
  const paths = getEditorV2ProjectPaths(packagePath);
  const target = readCandidate(paths.project);
  if (target) return target;
  const candidates = [paths.projectTemporary, paths.projectBackup]
    .map(readCandidate)
    .filter((project): project is EditorProjectV2 => project !== null);
  return (
    candidates.sort((left, right) => right.revision - left.revision)[0] ?? null
  );
};

const getHistoryThumbnailCacheIdentity = (item: HistoryItem): string => {
  if (item.type !== 'video') return item.originalPath;
  if (
    item.projectLocation?.kind === 'capty-package' &&
    item.projectLocation.format === 'v2'
  ) {
    return item.projectLocation.packagePath;
  }
  return getRecordingVideoPath(item.originalPath);
};

const getHistoryThumbnailSource = (
  originalPath: string
): HistoryThumbnailSource | null => {
  const projectFolder = getProjectFolder(originalPath);
  const recordingPath = getRecordingVideoPath(originalPath);
  if (!projectFolder || existsSync(recordingPath)) {
    return {
      sourcePath: recordingPath,
      type: 'video',
      cacheIdentity: recordingPath,
    };
  }

  const project = readV2HistoryProject(projectFolder);
  if (!project) return null;
  for (const trackId of project.sequence.videoTrackIds) {
    const track = project.sequence.tracks[trackId];
    if (!track || track.kind !== 'video') continue;
    for (const clipId of track.clipIds) {
      const clip = project.sequence.clips[clipId];
      if (!clip || (clip.kind !== 'video' && clip.kind !== 'image')) continue;
      const asset = project.assets[clip.assetId];
      if (!asset) continue;
      const sourcePath =
        asset.locator.kind === 'linked'
          ? asset.locator.absolutePath
          : path.join(projectFolder, asset.locator.relativePath);
      return {
        sourcePath,
        type: asset.kind === 'image' ? 'screenshot' : 'video',
        cacheIdentity: projectFolder,
      };
    }
  }
  return null;
};

function ensureDirectories() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export async function loadHistory(): Promise<HistoryItem[]> {
  try {
    ensureDirectories();
    if (existsSync(HISTORY_FILE)) {
      const fileContent = await fs.readFile(HISTORY_FILE, 'utf-8');
      historyItems = JSON.parse(fileContent);
      const validItems = await Promise.all(
        historyItems.map(async item => {
          if (!existsSync(item.originalPath)) return null;

          const normalized = {
            ...item,
            type: item.type || ('screenshot' as const),
          };
          if (normalized.type !== 'video') return normalized;

          const location = await canonicalizeEditorProjectLocation(
            normalized.originalPath
          );
          return location
            ? migrateHistoryProjectIdentity(normalized, location)
            : normalized;
        })
      );
      historyItems = validItems.filter(
        (item): item is HistoryItem => item !== null
      );
    }
  } catch (error) {
    console.error('Failed to load history:', error);
    historyItems = [];
  }
  return historyItems;
}

async function saveHistoryToFile(): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    try {
      ensureDirectories();
      await fs.writeFile(
        HISTORY_FILE,
        JSON.stringify(historyItems, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  });
  return writeQueue;
}

export async function addToHistory(
  originalPath: string,
  type: HistoryItemType = 'screenshot',
  duration?: number
): Promise<HistoryItem | null> {
  const config = getConfig();
  if (!config.history.enabled) {
    return null;
  }

  try {
    const projectLocation =
      type === 'video'
        ? await canonicalizeEditorProjectLocation(originalPath)
        : null;
    const identityPath = projectLocation
      ? projectLocation.kind === 'capty-package'
        ? projectLocation.packagePath
        : projectLocation.sourcePath
      : originalPath;
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      originalPath: identityPath,
      type,
      editorState: null,
      ...(duration !== undefined && { duration }),
      ...(projectLocation && { projectLocation }),
    };

    historyItems.unshift(item);

    while (historyItems.length > config.history.maxItems) {
      const removed = historyItems.pop();
      if (removed) {
        cleanupHistoryItem(removed);
      }
    }

    await saveHistoryToFile();
    return item;
  } catch (error) {
    console.error('Failed to add to history:', error);
    return null;
  }
}

export async function updateHistoryItem(
  id: string,
  editorState: EditorState
): Promise<HistoryItem | null> {
  const index = historyItems.findIndex(item => item.id === id);
  if (index === -1) {
    return null;
  }

  historyItems[index] = {
    ...historyItems[index],
    editorState,
  };

  await saveHistoryToFile();
  return historyItems[index];
}

export async function updateHistoryItemByPath(
  originalPath: string,
  editorState: EditorState
): Promise<HistoryItem | null> {
  const identityPath = getEditorProjectIdentityPath(originalPath);
  const index = historyItems.findIndex(
    item => getEditorProjectIdentityPath(item.originalPath) === identityPath
  );
  if (index === -1) {
    return null;
  }

  historyItems[index] = {
    ...historyItems[index],
    editorState,
  };

  await saveHistoryToFile();
  return historyItems[index];
}

export async function updateHistoryItemPath(
  oldPath: string,
  newPath: string
): Promise<boolean> {
  const oldIdentity = getEditorProjectIdentityPath(oldPath);
  const newIdentity = getEditorProjectIdentityPath(newPath);
  const index = historyItems.findIndex(
    item => getEditorProjectIdentityPath(item.originalPath) === oldIdentity
  );
  if (index === -1) {
    return false;
  }

  const previousItem = historyItems[index];
  const location = await canonicalizeEditorProjectLocation(newIdentity);
  historyItems[index] = location
    ? migrateHistoryProjectIdentity(previousItem, location)
    : {
        ...historyItems[index],
        originalPath: newIdentity,
      };

  if (
    previousItem.projectLocation?.kind === 'capty-package' &&
    previousItem.projectLocation.format === 'v2'
  ) {
    rekeyThumbnail(oldIdentity, newIdentity);
  }
  await saveHistoryToFile();
  return true;
}

function cleanupHistoryItem(item: HistoryItem): void {
  try {
    const projectFolder = getProjectFolder(item.originalPath);
    const thumbnailSource = getHistoryThumbnailCacheIdentity(item);

    if (projectFolder && existsSync(projectFolder)) {
      deleteThumbnail(thumbnailSource);
      rmSync(projectFolder, { recursive: true, force: true });
      return;
    }

    if (existsSync(item.originalPath)) {
      unlinkSync(item.originalPath);
    }
    deleteThumbnail(thumbnailSource);
    if (item.type === 'video') {
      const cursorDataPath = item.originalPath.replace(
        /\.[^.]+$/,
        '.cursor.json'
      );
      if (existsSync(cursorDataPath)) {
        unlinkSync(cursorDataPath);
      }
      const mouseDataPath = item.originalPath.replace(/\.mov$/, '.mouse.json');
      if (existsSync(mouseDataPath)) {
        unlinkSync(mouseDataPath);
      }
      const cameraJsonPath = item.originalPath.replace(
        /\.[^.]+$/,
        '.camera.json'
      );
      if (existsSync(cameraJsonPath)) {
        unlinkSync(cameraJsonPath);
      }
      const cameraVideoPath = item.originalPath.replace(
        /\.[^.]+$/,
        '.camera.mov'
      );
      if (existsSync(cameraVideoPath)) {
        unlinkSync(cameraVideoPath);
      }
    }
  } catch {
    console.warn(`Failed to clean up history item: ${item.id}`);
  }
}

export async function deleteHistoryItem(id: string): Promise<boolean> {
  const index = historyItems.findIndex(item => item.id === id);
  if (index === -1) {
    return false;
  }

  const removed = historyItems.splice(index, 1)[0];
  cleanupHistoryItem(removed);
  await saveHistoryToFile();
  return true;
}

export async function clearHistory(): Promise<void> {
  for (const item of historyItems) {
    cleanupHistoryItem(item);
  }
  clearAllThumbnails();
  historyItems = [];
  await saveHistoryToFile();
}

export function getHistory(): HistoryItem[] {
  return historyItems;
}

export function getHistoryItem(id: string): HistoryItem | null {
  return historyItems.find(item => item.id === id) || null;
}

export function getHistoryItemByPath(originalPath: string): HistoryItem | null {
  const identityPath = getEditorProjectIdentityPath(originalPath);
  return (
    historyItems.find(
      item => getEditorProjectIdentityPath(item.originalPath) === identityPath
    ) || null
  );
}

export function getVideoRecordingFeatures(
  originalPath: string
): VideoRecordingFeatures {
  const projectFolder = getProjectFolder(originalPath);
  if (!projectFolder) {
    return {
      hasMic: false,
      hasSystemAudio: false,
      hasCamera: false,
      hasCursor: false,
    };
  }

  return {
    hasMic: existsSync(getMicAudioPath(originalPath)),
    hasSystemAudio: existsSync(getSystemAudioPath(originalPath)),
    hasCamera: existsSync(getCameraVideoPath(originalPath)),
    hasCursor: existsSync(getCursorPath(originalPath)),
  };
}

export function init(): void {
  loadHistory();

  ipcMain.handle('history:get', () => {
    return getHistory();
  });

  ipcMain.handle('history:getItem', (_event, id: string) => {
    return getHistoryItem(id);
  });

  ipcMain.handle('history:delete', async (_event, id: string) => {
    return await deleteHistoryItem(id);
  });

  ipcMain.handle('history:confirmClear', async event => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: 'warning' as const,
      title: 'Clear History',
      message: 'Are you sure you want to clear all history?',
      detail:
        'This will permanently delete all screenshots and videos from your history. This action cannot be undone.',
      buttons: ['Clear History', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    };

    const result = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options);

    return result.response === 0;
  });

  ipcMain.handle('history:clear', async () => {
    await clearHistory();
    return true;
  });

  ipcMain.handle(
    'history:getThumbnail',
    async (
      _event,
      originalPath: string,
      type: 'screenshot' | 'video'
    ): Promise<string | null> => {
      if (type !== 'video') {
        const result = await getThumbnail(originalPath, type);
        return result.base64;
      }
      const thumbnail = getHistoryThumbnailSource(originalPath);
      if (!thumbnail) return null;
      const result = await getThumbnail(
        thumbnail.sourcePath,
        thumbnail.type,
        thumbnail.cacheIdentity
      );
      return result.base64;
    }
  );

  ipcMain.handle(
    'history:getVideoFeatures',
    (_event, originalPath: string): VideoRecordingFeatures => {
      return getVideoRecordingFeatures(originalPath);
    }
  );
}
