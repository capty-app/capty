import { dialog, ipcMain } from 'electron';
import path from 'path';

import { updateHistoryItemPath } from '@/main/history';
import { rekeyThumbnail } from '@/main/utils/thumbnails';
import { fingerprintMediaFile } from '@/main/editor-v2/media/media-fingerprint';

import {
  editorProjectService,
  getWindowData,
  updateWindowFilePath,
} from '@/main/capture/video/window-manager';
import { authorizeEditorV2Sender } from '@/main/editor-v2/security/editor-sender-policy';
import type {
  EditorV2CreateProjectRequest,
  EditorV2CreateProjectResult,
  EditorV2ReloadRequest,
  EditorV2ReloadResult,
  EditorV2SaveCopyRequest,
  EditorV2SaveCopyResult,
  EditorV2SaveRequest,
  EditorV2SaveResult,
  EditorV2WorkspaceSaveRequest,
  EditorV2WorkspaceSaveResult,
} from '@/types/editor-v2';

export function registerEditorV2ProjectHandlers(): void {
  ipcMain.handle(
    'editor-v2:project:create',
    async (
      event,
      request: EditorV2CreateProjectRequest
    ): Promise<EditorV2CreateProjectResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized || authorized.session.location.kind !== 'standalone') {
        return {
          status: 'failed',
          error: 'Unauthorized standalone project conversion',
        };
      }
      if (request.policy !== 'copy' && request.policy !== 'link') {
        return {
          status: 'failed',
          error: 'Invalid standalone media import policy',
        };
      }
      const sourcePath = authorized.session.location.sourcePath;
      const result = await dialog.showSaveDialog(authorized.data.window, {
        title: 'Create Capty Project',
        defaultPath: path.join(
          path.dirname(sourcePath),
          `${path.basename(sourcePath, path.extname(sourcePath))}.capty`
        ),
        filters: [{ name: 'Capty Project', extensions: ['capty'] }],
      });
      if (result.canceled || !result.filePath) return { status: 'cancelled' };
      const destinationPath = result.filePath.endsWith('.capty')
        ? result.filePath
        : `${result.filePath}.capty`;
      try {
        const project = await editorProjectService.runMediaOperation(
          authorized.session,
          async () =>
            editorProjectService.convertStandalone({
              session: authorized.session,
              destinationPath,
              workspace: request.workspace,
              policy: request.policy,
              sourceFingerprint: await fingerprintMediaFile(sourcePath),
              rekeyAdapters: async (oldPath, newPath) => {
                await updateHistoryItemPath(oldPath, newPath);
                rekeyThumbnail(oldPath, newPath);
                updateWindowFilePath(event.sender.id, newPath);
              },
            })
        );
        const canonicalPath = path.resolve(destinationPath);
        return {
          status: 'created',
          project,
          displayName: path.basename(canonicalPath, '.capty'),
          displayPath: canonicalPath,
        };
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'editor-v2:project:save',
    async (
      event,
      request: EditorV2SaveRequest
    ): Promise<EditorV2SaveResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      const session = authorized?.session;
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
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      const session = authorized?.session;
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
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      const session = authorized?.session;
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
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      const session = authorized?.session;
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
