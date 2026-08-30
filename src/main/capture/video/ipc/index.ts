import { registerDialogHandlers } from './dialog-handlers';
import { registerDataHandlers } from './data-handlers';
import { registerStateHandlers } from './state-handlers';
import { registerAudioHandlers } from './audio-handlers';
import { registerExportHandlers } from './export-handlers';
import { registerFileHandlers } from './file-handlers';
import { registerSubtitleHandlers } from './subtitle-handlers';
import { registerMetadataHandlers } from './metadata-handlers';
import { registerKeyboardSoundHandlers } from './keyboard-sound-handlers';
import { registerProjectHandlers } from './project-handlers';
import { registerMusicHandlers } from './music-handlers';
import { registerEditorV2DataHandlers } from '@/main/editor-v2/ipc/data-handlers';
import { registerEditorV2DevHandlers } from '@/main/editor-v2/ipc/dev-handlers';
import { registerEditorV2ProjectHandlers } from '@/main/editor-v2/ipc/project-handlers';
import { registerEditorV2MediaHandlers } from '@/main/editor-v2/ipc/media-handlers';
import { isDev } from '@/main/utils/env';

export function registerAllVideoEditorHandlers(): void {
  registerDialogHandlers();
  registerDataHandlers();
  registerStateHandlers();
  registerAudioHandlers();
  registerExportHandlers();
  registerFileHandlers();
  registerSubtitleHandlers();
  registerMetadataHandlers();
  registerKeyboardSoundHandlers();
  registerProjectHandlers();
  registerMusicHandlers();
  if (isDev) {
    registerEditorV2ProjectHandlers();
    registerEditorV2MediaHandlers();
    registerEditorV2DataHandlers();
    registerEditorV2DevHandlers();
  }
}

export {
  registerDialogHandlers,
  registerDataHandlers,
  registerStateHandlers,
  registerAudioHandlers,
  registerExportHandlers,
  registerFileHandlers,
  registerSubtitleHandlers,
  registerMetadataHandlers,
  registerKeyboardSoundHandlers,
  registerProjectHandlers,
  registerMusicHandlers,
  registerEditorV2DataHandlers,
  registerEditorV2DevHandlers,
  registerEditorV2ProjectHandlers,
  registerEditorV2MediaHandlers,
};
