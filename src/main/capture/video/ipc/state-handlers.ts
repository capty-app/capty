import { ipcMain } from 'electron';
import fs from 'fs';
import { getWindowData } from '../window-manager';
import { getEditorStatePath } from '../recording-project';
import { generateInitialEditorState } from '../auto-zoom-generator';
import { isValidV1EditorState } from '@/editor-v1/state-validator';
import type { VideoEditorState } from '@/types/video-editor-state';

function getRecordingTypeFromStateFile(
  statePath: string
): VideoEditorState['recordingType'] {
  if (!fs.existsSync(statePath)) return undefined;

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(content) as { recordingType?: unknown };
    return parsed.recordingType === 'ios-device'
      ? parsed.recordingType
      : undefined;
  } catch {
    return undefined;
  }
}

export function registerStateHandlers(): void {
  ipcMain.handle(
    'video-editor:getState',
    async (event): Promise<VideoEditorState | null> => {
      const data = getWindowData(event.sender.id);
      if (!data) return null;

      const statePath = getEditorStatePath(data.filePath);
      if (!statePath || !fs.existsSync(statePath)) return null;

      try {
        const content = fs.readFileSync(statePath, 'utf-8');
        const parsed = JSON.parse(content);

        if (!isValidV1EditorState(parsed)) {
          console.warn('Invalid editor state structure, ignoring saved state');
          return null;
        }

        return parsed;
      } catch (error) {
        console.error('Failed to load editor state:', error);
        return null;
      }
    }
  );

  ipcMain.handle(
    'video-editor:saveState',
    async (event, state: VideoEditorState): Promise<boolean> => {
      const data = getWindowData(event.sender.id);
      if (!data) return false;

      const statePath = getEditorStatePath(data.filePath);
      if (!statePath) return false;

      if (!isValidV1EditorState(state)) {
        console.error('Invalid editor state, refusing to save');
        return false;
      }

      try {
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        return true;
      } catch (error) {
        console.error('Failed to save editor state:', error);
        return false;
      }
    }
  );

  ipcMain.handle('video-editor:resetState', async (event): Promise<boolean> => {
    const data = getWindowData(event.sender.id);
    if (!data) return false;

    const statePath = getEditorStatePath(data.filePath);
    if (!statePath) return false;

    const recordingType = getRecordingTypeFromStateFile(statePath);

    try {
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
      return await generateInitialEditorState({
        projectPath: data.filePath,
        recordingType,
      });
    } catch (error) {
      console.error('Failed to reset editor state:', error);
      return false;
    }
  });
}
