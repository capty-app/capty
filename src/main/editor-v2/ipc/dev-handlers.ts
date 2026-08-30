import { ipcMain } from 'electron';
import crypto from 'crypto';

import { isDev } from '@/main/utils/env';
import {
  editorProjectService,
  getWindowData,
  recreateVideoEditorWindow,
} from '@/main/capture/video/window-manager';
import type {
  EditorV2FlushResult,
  EditorV2WorkspaceSaveRequest,
  EditorVersionSwitchRequest,
  EditorVersionSwitchResult,
} from '@/types/editor-v2';

interface PendingFlush {
  webContentsId: number;
  resolve: (result: EditorV2FlushResult) => void;
  cleanup: () => void;
}

const pendingFlushes = new Map<string, PendingFlush>();

const resolveFlush = (
  webContentsId: number,
  result: EditorV2FlushResult
): void => {
  const pending = pendingFlushes.get(result.requestId);
  if (!pending || pending.webContentsId !== webContentsId) return;
  pendingFlushes.delete(result.requestId);
  pending.cleanup();
  pending.resolve(result);
};

const requestFlush = (
  webContentsId: number,
  channel: string
): Promise<EditorV2FlushResult> => {
  const data = getWindowData(webContentsId);
  if (!data || data.window.isDestroyed()) {
    return Promise.resolve({
      requestId: '',
      status: 'failed',
      projectRevision: 0,
      workspaceRevision: 0,
      error: 'Editor window is not available',
    });
  }
  const requestId = crypto.randomUUID();
  return new Promise(resolve => {
    const unavailable = () => {
      resolveFlush(webContentsId, {
        requestId,
        status: 'failed',
        projectRevision: 0,
        workspaceRevision: 0,
        error: 'Editor renderer became unavailable during save',
      });
    };
    const cleanup = () => {
      data.window.removeListener('closed', unavailable);
      data.window.webContents.removeListener(
        'render-process-gone',
        unavailable
      );
    };
    pendingFlushes.set(requestId, { webContentsId, resolve, cleanup });
    data.window.once('closed', unavailable);
    data.window.webContents.once('render-process-gone', unavailable);
    data.window.webContents.send(channel, { requestId });
  });
};

export function registerEditorV2DevHandlers(): void {
  ipcMain.on(
    'video-editor:switch-flush-result',
    (event, result: EditorV2FlushResult) => {
      resolveFlush(event.sender.id, result);
    }
  );
  ipcMain.on(
    'editor-v2:project:flush-result',
    (event, result: EditorV2FlushResult) => {
      resolveFlush(event.sender.id, result);
    }
  );

  ipcMain.handle(
    'editor-v2:workspace:save',
    async (event, request: EditorV2WorkspaceSaveRequest) => {
      const data = getWindowData(event.sender.id);
      if (
        !isDev ||
        data?.editorVersion !== 'v2' ||
        data.projectToken !== request.projectToken
      ) {
        return {
          status: 'failed',
          error: 'Unauthorized Editor V2 workspace save',
        };
      }
      const opened = data.projectOpen ? await data.projectOpen : null;
      const session = data.projectSession ?? opened?.session;
      if (!session)
        return { status: 'failed', error: 'Project session is unavailable' };
      data.projectSession = session;
      return editorProjectService.saveWorkspace(
        session,
        request.expectedRevision,
        request.workspace
      );
    }
  );

  ipcMain.handle(
    'editor-v2:version:switch',
    async (
      event,
      request: EditorVersionSwitchRequest
    ): Promise<EditorVersionSwitchResult> => {
      if (!isDev) {
        return {
          status: 'cancelled',
          error: 'Editor switching is development-only',
        };
      }
      const data = getWindowData(event.sender.id);
      if (!data?.editorVersion || !data.projectLocation) {
        return {
          status: 'cancelled',
          error: 'Editor window is not registered',
        };
      }
      if (request.targetVersion === data.editorVersion) {
        return { status: 'switched' };
      }
      if (
        request.targetVersion === 'v1' &&
        (data.projectLocation.kind !== 'capty-package' ||
          !data.projectLocation.v1RecordingPath)
      ) {
        return {
          status: 'cancelled',
          error: 'This project has no V1 recording',
        };
      }
      if (
        request.targetVersion === 'v2' &&
        data.projectLocation.kind !== 'capty-package'
      ) {
        return {
          status: 'cancelled',
          error: 'Create a Capty project before opening standalone media in V2',
        };
      }

      const flush = await requestFlush(
        event.sender.id,
        data.editorVersion === 'v1'
          ? 'video-editor:switch-flush-request'
          : 'editor-v2:project:flush-request'
      );
      if (flush.status !== 'flushed') {
        return {
          status: 'cancelled',
          error: flush.error ?? 'Editor changes could not be saved',
        };
      }
      const recreated = await recreateVideoEditorWindow(
        event.sender.id,
        request.targetVersion
      );
      return recreated
        ? { status: 'switched' }
        : {
            status: 'cancelled',
            error: 'Editor window could not be recreated',
          };
    }
  );
}
