import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { getWindowData } from '../window-manager';
import { getMicAudioPath, getSubtitlePath } from '../recording-project';
import {
  isWhisperBinaryAvailable,
  isWhisperModelAvailable,
  ensureWhisperReady,
  getAvailableModels,
} from '@/main/utils/whisper';
import { parseSrtToSubtitleData } from '@/editor-v1/subtitle-parser';
import { transcribeAudio } from '@/main/transcription/whisper-transcribe';
import type {
  SubtitleData,
  WhisperModel,
  SubtitleGenerationOptions,
} from '@/types/subtitle';
import { validateSubtitleData } from '@/types/subtitle';

export function registerSubtitleHandlers(): void {
  ipcMain.handle(
    'video-editor:getWhisperStatus',
    async (): Promise<{
      binaryAvailable: boolean;
      availableModels: WhisperModel[];
    }> => {
      return {
        binaryAvailable: isWhisperBinaryAvailable(),
        availableModels: getAvailableModels(),
      };
    }
  );

  ipcMain.handle(
    'video-editor:isWhisperModelAvailable',
    async (_, model: WhisperModel): Promise<boolean> => {
      return isWhisperModelAvailable(model);
    }
  );

  ipcMain.handle(
    'video-editor:downloadWhisper',
    async (
      event,
      model: WhisperModel
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await ensureWhisperReady(model, progress => {
          event.sender.send('whisper:download-progress', progress);
        });
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'video-editor:generateSubtitles',
    async (
      event,
      options: SubtitleGenerationOptions
    ): Promise<{ success: boolean; data?: SubtitleData; error?: string }> => {
      const windowData = getWindowData(event.sender.id);
      if (!windowData) {
        return { success: false, error: 'No video loaded' };
      }

      const micPath = getMicAudioPath(windowData.filePath);
      if (!fs.existsSync(micPath)) {
        return { success: false, error: 'No microphone audio found' };
      }

      try {
        const result = await transcribeAudio(micPath, options, percent => {
          event.sender.send('subtitle:generation-progress', percent);
        });

        if (result.success && result.data) {
          const subtitlePath = getSubtitlePath(windowData.filePath);
          if (subtitlePath) {
            fs.writeFileSync(
              subtitlePath,
              JSON.stringify(result.data, null, 2)
            );
          }
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMessage };
      }
    }
  );

  ipcMain.handle(
    'video-editor:getSubtitleData',
    async (event): Promise<SubtitleData | null> => {
      const windowData = getWindowData(event.sender.id);
      if (!windowData) return null;

      const subtitlePath = getSubtitlePath(windowData.filePath);
      if (!subtitlePath || !fs.existsSync(subtitlePath)) return null;

      try {
        const content = fs.readFileSync(subtitlePath, 'utf-8');
        return JSON.parse(content) as SubtitleData;
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    'video-editor:saveSubtitleData',
    async (
      event,
      data: SubtitleData
    ): Promise<{ success: boolean; error?: string }> => {
      const windowData = getWindowData(event.sender.id);
      if (!windowData) {
        return { success: false, error: 'No video data found' };
      }

      const subtitlePath = getSubtitlePath(windowData.filePath);
      if (!subtitlePath) {
        return { success: false, error: 'Could not determine subtitle path' };
      }

      try {
        fs.writeFileSync(subtitlePath, JSON.stringify(data, null, 2));
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'video-editor:importSubtitleData',
    async (
      event
    ): Promise<{ success: boolean; data?: SubtitleData; error?: string }> => {
      const windowData = getWindowData(event.sender.id);
      if (!windowData) {
        return { success: false, error: 'No video data found' };
      }

      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return { success: false, error: 'Window not found' };
      }

      const result = await dialog.showOpenDialog(window, {
        title: 'Import Subtitle Data',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'SRT Files', extensions: ['srt'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      try {
        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf-8');

        let parsed: unknown;
        if (filePath.endsWith('.srt')) {
          parsed = parseSrtToSubtitleData(content, new Date().toISOString());
        } else {
          parsed = JSON.parse(content);
        }

        const validation = validateSubtitleData(parsed);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }

        const subtitlePath = getSubtitlePath(windowData.filePath);
        if (subtitlePath) {
          fs.writeFileSync(
            subtitlePath,
            JSON.stringify(validation.data, null, 2)
          );
        }

        return { success: true, data: validation.data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  ipcMain.handle(
    'video-editor:deleteSubtitleData',
    async (event): Promise<boolean> => {
      const windowData = getWindowData(event.sender.id);
      if (!windowData) return false;

      const subtitlePath = getSubtitlePath(windowData.filePath);
      if (!subtitlePath || !fs.existsSync(subtitlePath)) return true;

      try {
        fs.unlinkSync(subtitlePath);
        return true;
      } catch {
        return false;
      }
    }
  );
}
