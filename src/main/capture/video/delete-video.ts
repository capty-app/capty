import { dialog, BrowserWindow } from 'electron';
import { existsSync, unlinkSync, rmSync } from 'fs';
import {
  getHistoryItemByPath,
  deleteHistoryItem,
} from '@/main/history/index.ts';
import { getConfig } from '@/main/settings';
import { deleteThumbnail } from '@/main/utils/thumbnails.ts';
import { showNotification } from '@/main/utils/notifications';
import { deleteCursorData } from './cursor-data.ts';
import { deleteCameraData } from './camera-data.ts';
import { deleteKeyboardData } from './keyboard-data.ts';
import {
  getProjectFolder,
  getRecordingVideoPath,
} from './recording-project.ts';

export interface DeleteVideoOptions {
  showNotification?: boolean;
  showErrorDialog?: boolean;
}

export async function confirmVideoDelete(
  parentWindow?: BrowserWindow | null
): Promise<boolean> {
  const options = {
    type: 'none' as const,
    title: 'Delete Recording?',
    message: 'Delete Recording?',
    detail:
      'This will permanently delete the current recording. This action cannot be undone.',
    buttons: ['Cancel', 'Delete'],
    defaultId: 1,
    cancelId: 0,
  };

  const win = parentWindow ?? BrowserWindow.getFocusedWindow();
  const result = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options);

  return result.response === 1;
}

export async function deleteVideo(
  filePath: string,
  options: DeleteVideoOptions = {}
): Promise<boolean> {
  const { showNotification = true, showErrorDialog = true } = options;

  if (!filePath) {
    console.warn('deleteVideo: No file path provided');
    return false;
  }

  try {
    const historyItem = getHistoryItemByPath(filePath);

    if (historyItem) {
      const deleted = await deleteHistoryItem(historyItem.id);
      if (deleted && showNotification) {
        showDeletionNotification();
      }
      return deleted;
    }

    return await deleteVideoFileManually(filePath, {
      showNotification,
      showErrorDialog,
    });
  } catch (error) {
    console.error('Error deleting video:', error);
    if (showErrorDialog) {
      await showDeletionErrorDialog(error);
    }
    return false;
  }
}

async function deleteVideoFileManually(
  filePath: string,
  options: DeleteVideoOptions
): Promise<boolean> {
  const { showNotification = true, showErrorDialog = true } = options;

  const projectFolder = getProjectFolder(filePath);

  if (projectFolder) {
    if (!existsSync(projectFolder)) {
      console.warn('Project folder not found:', projectFolder);
      return false;
    }

    try {
      const videoPath = getRecordingVideoPath(projectFolder);
      deleteThumbnail(videoPath);

      rmSync(projectFolder, { recursive: true, force: true });
      console.log('Project folder deleted:', projectFolder);

      if (showNotification) {
        showDeletionNotification();
      }

      return true;
    } catch (error) {
      console.error('Error deleting project folder:', error);
      if (showErrorDialog) {
        await showDeletionErrorDialog(error);
      }
      return false;
    }
  }

  if (!existsSync(filePath)) {
    console.warn('Video file not found:', filePath);
    return false;
  }

  try {
    unlinkSync(filePath);
    console.log('Video deleted:', filePath);

    deleteThumbnail(filePath);

    await deleteCursorData(filePath);

    await deleteCameraData(filePath);

    await deleteKeyboardData(filePath);

    const mouseDataPath = filePath.replace(/\.mov$/, '.mouse.json');
    if (existsSync(mouseDataPath)) {
      unlinkSync(mouseDataPath);
    }

    if (showNotification) {
      showDeletionNotification();
    }

    return true;
  } catch (error) {
    console.error('Error deleting video file:', error);
    if (showErrorDialog) {
      await showDeletionErrorDialog(error);
    }
    return false;
  }
}

function showDeletionNotification(): void {
  if (!getConfig().general.showDeletionNotifications) {
    return;
  }
  showNotification({
    title: 'Video Deleted',
    body: 'The video has been permanently deleted.',
  });
}

async function showDeletionErrorDialog(error: unknown): Promise<void> {
  const options = {
    type: 'error' as const,
    title: 'Delete Failed',
    message: 'Failed to delete video file.',
    detail: error instanceof Error ? error.message : 'Unknown error',
  };

  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    await dialog.showMessageBox(win, options);
  } else {
    await dialog.showMessageBox(options);
  }
}
