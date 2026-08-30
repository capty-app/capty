import { dialog, ipcMain } from 'electron';
import path from 'path';

import { isPro } from '@/main/license/validation';
import {
  editorProjectService,
  getWindowData,
} from '@/main/capture/video/window-manager';
import { EditorExportJobService } from '@/main/editor-v2/export/export-job-service';
import { authorizeEditorV2Sender } from '@/main/editor-v2/security/editor-sender-policy';
import {
  clampEditorExportSettingsToFree,
  type EditorExportChunk,
  type EditorExportChunkAck,
  type EditorV2CancelExportRequest,
  type EditorV2FinishExportRequest,
  type EditorV2FinishExportResult,
  type EditorV2StartExportRequest,
  type EditorV2StartExportResult,
} from '@/types/editor-v2';

const exportJobs = new EditorExportJobService({
  onJobEnded(ownerId, jobId) {
    const data = getWindowData(ownerId);
    if (!data || data.activeExportJobId !== jobId) return;
    data.isExporting = false;
    data.activeExportJobId = undefined;
    data.cancelActiveExport = undefined;
  },
});

const exportName = (projectName: string, format: 'mp4' | 'gif'): string =>
  `${projectName}.${format}`;

export function registerEditorV2ExportHandlers(): void {
  ipcMain.handle(
    'editor-v2:export:start',
    async (
      event,
      request: EditorV2StartExportRequest
    ): Promise<EditorV2StartExportResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      const session = authorized?.session;
      if (!authorized || !session) {
        return { status: 'failed', error: 'Unauthorized Editor V2 export' };
      }
      const settings = isPro()
        ? request.settings
        : clampEditorExportSettingsToFree(request.settings);
      const result = await dialog.showSaveDialog(authorized.data.window, {
        title: 'Export Video',
        defaultPath: path.join(
          path.dirname(authorized.data.filePath),
          exportName(session.activeProject?.name ?? 'Capty Export', settings.format)
        ),
        filters: [
          settings.format === 'gif'
            ? { name: 'GIF Image', extensions: ['gif'] }
            : { name: 'MP4 Video', extensions: ['mp4'] },
        ],
      });
      if (result.canceled || !result.filePath) return { status: 'cancelled' };
      const outputPath = result.filePath.endsWith(`.${settings.format}`)
        ? result.filePath
        : `${result.filePath}.${settings.format}`;
      try {
        const started = await exportJobs.start({
          ownerId: event.sender.id,
          target: event.sender,
          session,
          expectedRevision: request.expectedRevision,
          settings,
          outputPath,
        });
        authorized.data.isExporting = true;
        authorized.data.activeExportJobId = started.jobId;
        authorized.data.cancelActiveExport = async jobId => {
          await exportJobs.cancel(event.sender.id, jobId);
        };
        return { status: 'started', ...started };
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.on('editor-v2:export:chunk', (event, chunk: EditorExportChunk) => {
    const acknowledge = (error?: string) => {
      event.sender.send('editor-v2:export:chunk-ack', {
        jobId: chunk?.jobId ?? '',
        chunkId: chunk?.chunkId ?? '',
        error,
      } satisfies EditorExportChunkAck);
    };
    if (
      !chunk ||
      typeof chunk.jobId !== 'string' ||
      typeof chunk.chunkId !== 'string' ||
      !(chunk.data instanceof Uint8Array)
    ) {
      acknowledge('Export chunk is invalid');
      return;
    }
    void exportJobs
      .writeChunk(event.sender.id, chunk.jobId, chunk.data, chunk.position)
      .then(() => acknowledge(), error => acknowledge(String(error)));
  });

  ipcMain.on(
    'editor-v2:export:renderer-progress',
    (event, progress) => {
      try {
        exportJobs.reportRendererProgress(event.sender.id, progress);
      } catch {
        return;
      }
    }
  );

  ipcMain.handle(
    'editor-v2:export:finish',
    async (
      event,
      request: EditorV2FinishExportRequest
    ): Promise<EditorV2FinishExportResult> => {
      try {
        await exportJobs.finish(event.sender.id, request.jobId);
        return { status: 'accepted' };
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'editor-v2:export:cancel',
    async (event, request: EditorV2CancelExportRequest) => ({
      accepted: await exportJobs.cancel(
        event.sender.id,
        request.jobId,
        request.error
      ),
    })
  );
}

export { exportJobs as editorV2ExportJobs };
