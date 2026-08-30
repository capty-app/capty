import { dialog, ipcMain } from 'electron';
import path from 'path';

import {
  editorProjectService,
  getWindowData,
} from '@/main/capture/video/window-manager';
import { isDev } from '@/main/utils/env';
import type { EditorProjectSession } from '@/main/editor-v2/project/project-service';
import type {
  EditorV2ReloadRequest,
  EditorV2ReloadResult,
  EditorV2SaveCopyRequest,
  EditorV2SaveCopyResult,
  EditorV2SaveRequest,
  EditorV2SaveResult,
  EditorV2WorkspaceSaveRequest,
  EditorV2WorkspaceSaveResult,
} from '@/types/editor-v2';

const getAuthorizedSession = async (
  webContentsId: number,
  projectToken: string
): Promise<EditorProjectSession | null> => {
  const data = getWindowData(webContentsId);
  if (
    !isDev ||
    data?.editorVersion !== 'v2' ||
    data.projectToken !== projectToken
  ) {
    return null;
  }
  if (data.projectSession) return data.projectSession;
  try {
    const opened = data.projectOpen ? await data.projectOpen : null;
    if (!opened) return null;
    data.projectSession = opened.session;
    return opened.session;
  } catch {
    return null;
  }
};

export function registerEditorV2ProjectHandlers(): void {
  ipcMain.handle(
    'editor-v2:project:save',
    async (
      event,
      request: EditorV2SaveRequest
    ): Promise<EditorV2SaveResult> => {
      const session = await getAuthorizedSession(
        event.sender.id,
        request.projectToken
      );
      if (!session) {
        return {
          status: 'failed',
          error: 'Unauthorized Editor V2 project save',
        };
      }
      return editorProjectService.saveProject(
        session,
        request.expectedRevision,
        request.project
      );
    }
  );

  ipcMain.handle(
    'editor-v2:workspace:save',
    async (
      event,
      request: EditorV2WorkspaceSaveRequest
    ): Promise<EditorV2WorkspaceSaveResult> => {
      const session = await getAuthorizedSession(
        event.sender.id,
        request.projectToken
      );
      if (!session) {
        return {
          status: 'failed',
          error: 'Unauthorized Editor V2 workspace save',
        };
      }
      return editorProjectService.saveWorkspace(
        session,
        request.expectedRevision,
        request.workspace
      );
    }
  );

  ipcMain.handle(
    'editor-v2:project:reload',
    async (
      event,
      request: EditorV2ReloadRequest
    ): Promise<EditorV2ReloadResult> => {
      const session = await getAuthorizedSession(
        event.sender.id,
        request.projectToken
      );
      if (!session) {
        return { status: 'failed', error: 'Unauthorized Editor V2 reload' };
      }
      try {
        const loaded = await editorProjectService.reload(session);
        return { status: 'loaded', ...loaded };
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'editor-v2:project:save-copy',
    async (
      event,
      request: EditorV2SaveCopyRequest
    ): Promise<EditorV2SaveCopyResult> => {
      const data = getWindowData(event.sender.id);
      const session = await getAuthorizedSession(
        event.sender.id,
        request.projectToken
      );
      if (!data || !session) {
        return { status: 'failed', error: 'Unauthorized Editor V2 save copy' };
      }
      const sourcePath =
        session.location.kind === 'capty-package'
          ? session.location.packagePath
          : session.location.sourcePath;
      const result = await dialog.showSaveDialog(data.window, {
        title: 'Save a Copy',
        defaultPath: path.join(
          path.dirname(sourcePath),
          `${path.basename(sourcePath, path.extname(sourcePath))} Copy.capty`
        ),
        filters: [{ name: 'Capty Project', extensions: ['capty'] }],
      });
      if (result.canceled || !result.filePath) return { status: 'cancelled' };
      const destinationPath = result.filePath.endsWith('.capty')
        ? result.filePath
        : `${result.filePath}.capty`;
      try {
        await editorProjectService.saveCopy(
          session,
          destinationPath,
          request.project,
          request.workspace
        );
        return { status: 'saved' };
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}
