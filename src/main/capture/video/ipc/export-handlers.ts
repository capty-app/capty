import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import fs from 'fs';
import { convertMp4ToGif } from '@/main/utils/ffmpeg';
import { showNotification } from '@/main/utils/notifications';
import {
  rememberSaveDirectory,
  resolveSaveDialogPath,
} from '@/main/utils/save-location';

function formatExportDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (secs === 0) {
    return `${mins} minute${mins > 1 ? 's' : ''}`;
  }
  return `${mins}m ${secs}s`;
}

export function registerExportHandlers(): void {
  ipcMain.handle(
    'video-editor:show-save-dialog',
    async (
      event,
      { defaultName, format }: { defaultName: string; format?: 'mp4' | 'gif' }
    ): Promise<{ canceled: boolean; filePath?: string }> => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const filters =
        format === 'gif'
          ? [{ name: 'GIF Image', extensions: ['gif'] }]
          : [{ name: 'MP4 Video', extensions: ['mp4'] }];
      const options = {
        defaultPath: resolveSaveDialogPath('video', defaultName),
        filters,
      };
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options);

      if (!result.canceled && result.filePath) {
        rememberSaveDirectory('video', result.filePath);
      }

      return {
        canceled: result.canceled,
        filePath: result.filePath,
      };
    }
  );

  ipcMain.handle(
    'video-editor:save-export',
    async (
      _,
      { buffer, outputPath }: { buffer: Uint8Array; outputPath: string }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await fs.promises.writeFile(outputPath, Buffer.from(buffer));
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'video-export:show-completion',
    async (
      _,
      {
        durationSeconds,
        filePath,
        openInFinder,
      }: { durationSeconds: number; filePath?: string; openInFinder?: boolean }
    ): Promise<void> => {
      showNotification({
        title: 'Export Complete',
        body: `Video exported successfully in ${formatExportDuration(durationSeconds)}`,
      });

      if (openInFinder && filePath) {
        shell.showItemInFolder(filePath);
      }
    }
  );

  ipcMain.handle(
    'video-editor:convert-to-gif',
    async (
      _,
      {
        inputPath,
        outputPath,
        resolution,
        frameRate,
      }: {
        inputPath: string;
        outputPath: string;
        resolution: 'original' | '4k' | '1080p' | '720p' | '480p';
        frameRate: string;
      }
    ): Promise<{ success: boolean; error?: string; outputPath?: string }> => {
      try {
        const result = await convertMp4ToGif({
          inputPath,
          outputPath,
          resolution,
          frameRate,
        });
        if (result.success) {
          return { success: true, outputPath: result.outputPath };
        }
        return { success: false, error: result.message };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );
}
