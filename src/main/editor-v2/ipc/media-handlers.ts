import { dialog, ipcMain, shell } from 'electron';

import { editorProjectService } from '@/main/capture/video/window-manager';
import { MediaService } from '@/main/editor-v2/media/media-service';
import { authorizeEditorV2Sender } from '@/main/editor-v2/security/editor-sender-policy';
import { resolveAuthorizedMediaAsset } from '@/main/editor-v2/security/project-path-policy';
import { SUPPORTED_IMAGE_EXTENSIONS } from '@/main/utils/image-files';
import { SUPPORTED_MUSIC_EXTENSIONS } from '@/types/music';
import type {
  EditorV2ManagedMediaRemoveRequest,
  EditorV2ManagedMediaRemoveResult,
  EditorV2MediaAssetRequest,
  EditorV2MediaImportRequest,
  EditorV2MediaImportResult,
  EditorV2MediaRelinkResult,
  EditorV2MediaRevealResult,
  EditorV2MediaStatusResult,
} from '@/types/editor-v2';

const VIDEO_EXTENSIONS = ['mov', 'mp4', 'webm', 'm4v', 'avi', 'mkv'];
const IMAGE_EXTENSIONS = SUPPORTED_IMAGE_EXTENSIONS.map(extension =>
  extension.slice(1)
);
const MEDIA_EXTENSIONS = [
  ...new Set([
    ...VIDEO_EXTENSIONS,
    ...SUPPORTED_MUSIC_EXTENSIONS,
    ...IMAGE_EXTENSIONS,
  ]),
];

const mediaService = new MediaService();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function registerEditorV2MediaHandlers(): void {
  ipcMain.handle(
    'editor-v2:media:import',
    async (
      event,
      request: EditorV2MediaImportRequest
    ): Promise<EditorV2MediaImportResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized) {
        return { status: 'failed', error: 'Unauthorized media import' };
      }
      if (authorized.session.location.kind !== 'capty-package') {
        return {
          status: 'failed',
          error: 'Create a Capty project before importing media',
        };
      }
      if (request.policy !== 'copy' && request.policy !== 'link') {
        return { status: 'failed', error: 'Invalid media import policy' };
      }
      const result = await dialog.showOpenDialog(authorized.data.window, {
        title:
          request.policy === 'copy' ? 'Import Media' : 'Link Media in Place',
        filters: [{ name: 'Media', extensions: MEDIA_EXTENSIONS }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { status: 'cancelled' };
      }
      try {
        return await editorProjectService.runMediaOperation(
          authorized.session,
          async () => {
            const imported = await mediaService.importMedia(
              authorized.session,
              event.sender.id,
              result.filePaths[0],
              request.policy
            );
            editorProjectService.addActiveAsset(
              authorized.session,
              imported.asset
            );
            return { status: 'imported', ...imported };
          }
        );
      } catch (error) {
        return { status: 'failed', error: errorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    'editor-v2:media:status',
    async (
      event,
      request: EditorV2MediaAssetRequest
    ): Promise<EditorV2MediaStatusResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized) {
        return { status: 'failed', error: 'Unauthorized media status request' };
      }
      try {
        const project = editorProjectService.readActiveProject(
          authorized.session
        );
        return {
          status: 'resolved',
          asset: await mediaService.resolveStatus(
            authorized.session,
            event.sender.id,
            project,
            request.assetId
          ),
        };
      } catch (error) {
        return { status: 'failed', error: errorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    'editor-v2:media:relink',
    async (
      event,
      request: EditorV2MediaAssetRequest
    ): Promise<EditorV2MediaRelinkResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized) {
        return { status: 'failed', error: 'Unauthorized media relink' };
      }
      const result = await dialog.showOpenDialog(authorized.data.window, {
        title: 'Relink Media',
        filters: [{ name: 'Media', extensions: MEDIA_EXTENSIONS }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { status: 'cancelled' };
      }
      try {
        return await editorProjectService.runMediaOperation(
          authorized.session,
          async () => {
            const project = editorProjectService.readActiveProject(
              authorized.session
            );
            const relinked = await mediaService.relink(
              authorized.session,
              event.sender.id,
              project,
              request.assetId,
              result.filePaths[0]
            );
            editorProjectService.updateActiveAsset(
              authorized.session,
              relinked.asset
            );
            return { status: 'relinked', ...relinked };
          }
        );
      } catch (error) {
        return { status: 'failed', error: errorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    'editor-v2:media:reveal',
    async (
      event,
      request: EditorV2MediaAssetRequest
    ): Promise<EditorV2MediaRevealResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized) {
        return { status: 'failed', error: 'Unauthorized media reveal' };
      }
      try {
        const project = editorProjectService.readActiveProject(
          authorized.session
        );
        const { filePath } = await resolveAuthorizedMediaAsset(
          authorized.session,
          project,
          request.assetId
        );
        shell.showItemInFolder(filePath);
        return { status: 'revealed' };
      } catch (error) {
        return { status: 'failed', error: errorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    'editor-v2:media:remove-managed',
    async (
      event,
      request: EditorV2ManagedMediaRemoveRequest
    ): Promise<EditorV2ManagedMediaRemoveResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized) {
        return {
          status: 'failed',
          error: 'Unauthorized managed media removal',
        };
      }
      const confirmation = await dialog.showMessageBox(authorized.data.window, {
        type: 'warning',
        message: 'Permanently remove managed media?',
        detail:
          'This deletes the copied media from the Capty project and cannot be undone.',
        buttons: ['Cancel', 'Remove Permanently'],
        defaultId: 0,
        cancelId: 0,
      });
      if (confirmation.response !== 1) return { status: 'cancelled' };
      return editorProjectService.removeManagedMedia(
        authorized.session,
        request.expectedRevision,
        request.assetId
      );
    }
  );
}
