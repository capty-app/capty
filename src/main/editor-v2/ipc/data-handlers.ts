import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { dialog, ipcMain } from 'electron';

import { parseSrtToSubtitleData } from '@/editor-v1/subtitle-parser';
import { editorProjectService } from '@/main/capture/video/window-manager';
import { ProjectStaleRevisionError } from '@/main/editor-v2/project/project-service';
import {
  createEditorData,
  deleteEditorData,
  readEditorData,
  resetEditorDataToV1,
  writeEditorDataCopyOnWrite,
} from '@/main/editor-v2/data/v2-data-service';
import {
  isValidCursorData,
  isValidSubtitleData,
  validateKeyboardData,
} from '@/main/editor-v2/data/legacy-data-reader';
import { resolveAuthorizedMediaLocator } from '@/main/editor-v2/security/project-path-policy';
import { authorizeEditorV2Sender } from '@/main/editor-v2/security/editor-sender-policy';
import { transcribeAudio } from '@/main/transcription/whisper-transcribe';
import { ensureWhisperReady } from '@/main/utils/whisper';
import { validateCursorData } from '@/types/cursor';
import { DEFAULT_SUBTITLE_STYLE, validateSubtitleData } from '@/types/subtitle';
import type {
  EditorProjectV2,
  EditorV2DataCreateRequest,
  EditorV2DataMutationRequest,
  EditorV2DataMutationResult,
  EditorV2DataReadResult,
  EditorV2DataRequest,
  EditorV2DataValue,
  EditorV2DataWriteRequest,
  EditorV2SubtitleGenerateRequest,
  SubtitleEffect,
  V2DataLocator,
} from '@/types/editor-v2';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isValidDataValue = (value: EditorV2DataValue): boolean => {
  switch (value.kind) {
    case 'cursor':
      return isValidCursorData(value.value);
    case 'keyboard':
      return validateKeyboardData(value.value);
    case 'subtitles':
      return isValidSubtitleData(value.value);
  }
};

const mutationFailure = (error: unknown): EditorV2DataMutationResult =>
  error instanceof ProjectStaleRevisionError
    ? { status: 'stale', diskRevision: error.diskRevision }
    : { status: 'failed', error: errorMessage(error) };

const attachSubtitles = (
  project: EditorProjectV2,
  assetId: string,
  locator: V2DataLocator
): EditorProjectV2 => {
  const next = structuredClone(project);
  const asset = next.assets[assetId];
  if (asset?.kind !== 'capty-recording') {
    throw new Error('Subtitle generation requires a Capty recording');
  }
  const recordingOffsetTicks =
    asset.sources.microphoneAudio?.recordingOffsetTicks ?? 0;
  asset.sources.subtitles = { locator, recordingOffsetTicks };
  Object.values(next.sequence.clips).forEach(clip => {
    if (clip.assetId !== assetId || clip.kind === 'audio') return;
    const existing = clip.effects.find(effect => effect.kind === 'subtitle');
    if (existing?.kind === 'subtitle') {
      existing.data = locator;
      return;
    }
    const style = { ...DEFAULT_SUBTITLE_STYLE };
    delete (style as Partial<typeof style>).visible;
    const effect: SubtitleEffect = {
      id: randomUUID(),
      kind: 'subtitle',
      enabled: true,
      timeDomain: 'asset-source',
      data: locator,
      style,
    };
    clip.effects.push(effect);
  });
  return next;
};

export function registerEditorV2DataHandlers(): void {
  ipcMain.handle(
    'editor-v2:data:read',
    async (
      event,
      request: EditorV2DataRequest
    ): Promise<EditorV2DataReadResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized || authorized.session.location.kind !== 'capty-package') {
        return { status: 'failed', error: 'Unauthorized Editor V2 data read' };
      }
      try {
        const project = editorProjectService.readActiveProject(
          authorized.session
        );
        return {
          status: 'loaded',
          data: await readEditorData(
            authorized.session.location.packagePath,
            project,
            request.kind,
            request.locator
          ),
        };
      } catch (error) {
        return { status: 'failed', error: errorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    'editor-v2:data:write',
    async (
      event,
      request: EditorV2DataWriteRequest
    ): Promise<EditorV2DataMutationResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized || authorized.session.location.kind !== 'capty-package') {
        return { status: 'failed', error: 'Unauthorized Editor V2 data write' };
      }
      const packagePath = authorized.session.location.packagePath;
      if (
        request.value.kind !== request.kind ||
        !isValidDataValue(request.value)
      ) {
        return { status: 'failed', error: 'Editor data is malformed' };
      }
      try {
        const project = await editorProjectService.runProjectMutation(
          authorized.session,
          request.expectedRevision,
          async (active, commitProject) => {
            const result = await writeEditorDataCopyOnWrite({
              packagePath,
              project: active,
              assetId: request.assetId,
              kind: request.kind,
              expectedLocator: request.locator,
              value: request.value.value,
              commitProject,
            });
            return result.project;
          }
        );
        return { status: 'updated', project, revision: project.revision };
      } catch (error) {
        return mutationFailure(error);
      }
    }
  );

  ipcMain.handle(
    'editor-v2:data:import-cursor',
    async (
      event,
      request: EditorV2DataMutationRequest
    ): Promise<EditorV2DataMutationResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized || authorized.session.location.kind !== 'capty-package') {
        return { status: 'failed', error: 'Unauthorized cursor import' };
      }
      if (request.kind !== 'cursor') {
        return { status: 'failed', error: 'Cursor import kind is invalid' };
      }
      try {
        const selection = await dialog.showOpenDialog(authorized.data.window, {
          title: 'Import Cursor Data',
          filters: [{ name: 'Cursor Data', extensions: ['json'] }],
          properties: ['openFile'],
        });
        if (selection.canceled || selection.filePaths.length === 0) {
          return { status: 'failed', error: 'Cursor import was cancelled' };
        }
        const parsed: unknown = JSON.parse(
          await fs.readFile(selection.filePaths[0], 'utf-8')
        );
        const validation = validateCursorData(parsed);
        if (!validation.valid || !validation.data) {
          throw new Error(validation.error ?? 'Cursor data is malformed');
        }
        const packagePath = authorized.session.location.packagePath;
        const project = await editorProjectService.runProjectMutation(
          authorized.session,
          request.expectedRevision,
          async (active, commitProject) => {
            const result = await writeEditorDataCopyOnWrite({
              packagePath,
              project: active,
              assetId: request.assetId,
              kind: 'cursor',
              expectedLocator: request.locator,
              value: validation.data,
              commitProject,
            });
            return result.project;
          }
        );
        return { status: 'updated', project, revision: project.revision };
      } catch (error) {
        return mutationFailure(error);
      }
    }
  );

  ipcMain.handle(
    'editor-v2:data:import-subtitles',
    async (
      event,
      request: EditorV2DataCreateRequest
    ): Promise<EditorV2DataMutationResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized || authorized.session.location.kind !== 'capty-package') {
        return { status: 'failed', error: 'Unauthorized subtitle import' };
      }
      try {
        const selection = await dialog.showOpenDialog(authorized.data.window, {
          title: 'Import Subtitles',
          filters: [{ name: 'Subtitles', extensions: ['srt', 'json'] }],
          properties: ['openFile'],
        });
        if (selection.canceled || selection.filePaths.length === 0) {
          return { status: 'failed', error: 'Subtitle import was cancelled' };
        }
        const filePath = selection.filePaths[0];
        const content = await fs.readFile(filePath, 'utf-8');
        const value: unknown = filePath.toLowerCase().endsWith('.srt')
          ? parseSrtToSubtitleData(content, new Date().toISOString())
          : JSON.parse(content);
        const validation = validateSubtitleData(value);
        if (!validation.valid || !validation.data) {
          throw new Error(validation.error ?? 'Subtitle data is malformed');
        }
        const packagePath = authorized.session.location.packagePath;
        const project = await editorProjectService.runProjectMutation(
          authorized.session,
          request.expectedRevision,
          async (active, commitProject) => {
            const result = await createEditorData({
              packagePath,
              project: active,
              assetId: request.assetId,
              kind: 'subtitles',
              value: validation.data,
              attach: (current, locator) =>
                attachSubtitles(current, request.assetId, locator),
              commitProject,
            });
            return result.project;
          }
        );
        return { status: 'updated', project, revision: project.revision };
      } catch (error) {
        return mutationFailure(error);
      }
    }
  );

  ipcMain.handle(
    'editor-v2:data:generate-subtitles',
    async (
      event,
      request: EditorV2SubtitleGenerateRequest
    ): Promise<EditorV2DataMutationResult> => {
      const authorized = await authorizeEditorV2Sender(
        event.sender.id,
        request.projectToken
      );
      if (!authorized || authorized.session.location.kind !== 'capty-package') {
        return { status: 'failed', error: 'Unauthorized subtitle generation' };
      }
      try {
        const packagePath = authorized.session.location.packagePath;
        const active = editorProjectService.readActiveProject(
          authorized.session
        );
        const asset = active.assets[request.assetId];
        if (asset?.kind !== 'capty-recording') {
          throw new Error('Subtitle generation requires a Capty recording');
        }
        const audio = asset.sources.microphoneAudio;
        if (!audio) throw new Error('No microphone audio is available');
        const audioPath = await resolveAuthorizedMediaLocator(
          authorized.session,
          audio.locator
        );
        await ensureWhisperReady(request.model, () => undefined);
        const transcription = await transcribeAudio(
          audioPath,
          { model: request.model, prompt: request.prompt },
          () => undefined
        );
        if (!transcription.success || !transcription.data) {
          throw new Error(transcription.error ?? 'Subtitle generation failed');
        }
        const project = await editorProjectService.runProjectMutation(
          authorized.session,
          request.expectedRevision,
          async (current, commitProject) => {
            const currentAsset = current.assets[request.assetId];
            if (currentAsset?.kind !== 'capty-recording') {
              throw new Error('Subtitle generation requires a Capty recording');
            }
            const result = await createEditorData({
              packagePath,
              project: current,
              assetId: request.assetId,
              kind: 'subtitles',
              value: transcription.data,
              attach: (candidate, locator) =>
                attachSubtitles(candidate, request.assetId, locator),
              commitProject,
            });
            return result.project;
          }
        );
        return { status: 'updated', project, revision: project.revision };
      } catch (error) {
        return mutationFailure(error);
      }
    }
  );

  const registerReferenceMutation = (
    channel: 'editor-v2:data:delete' | 'editor-v2:data:reset',
    mutate: typeof deleteEditorData | typeof resetEditorDataToV1
  ) => {
    ipcMain.handle(
      channel,
      async (
        event,
        request: EditorV2DataMutationRequest
      ): Promise<EditorV2DataMutationResult> => {
        const authorized = await authorizeEditorV2Sender(
          event.sender.id,
          request.projectToken
        );
        if (
          !authorized ||
          authorized.session.location.kind !== 'capty-package'
        ) {
          return {
            status: 'failed',
            error: 'Unauthorized Editor V2 data mutation',
          };
        }
        const packagePath = authorized.session.location.packagePath;
        try {
          const project = await editorProjectService.runProjectMutation(
            authorized.session,
            request.expectedRevision,
            (active, commitProject) =>
              mutate({
                packagePath,
                project: active,
                assetId: request.assetId,
                kind: request.kind,
                expectedLocator: request.locator,
                commitProject,
              })
          );
          return { status: 'updated', project, revision: project.revision };
        } catch (error) {
          return mutationFailure(error);
        }
      }
    );
  };

  registerReferenceMutation('editor-v2:data:delete', deleteEditorData);
  registerReferenceMutation('editor-v2:data:reset', resetEditorDataToV1);
}
