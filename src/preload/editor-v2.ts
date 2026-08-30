import { contextBridge, ipcRenderer } from 'electron';

import type {
  EditorV2Bridge,
  EditorV2CreateProjectRequest,
  EditorV2CreateProjectResult,
  EditorV2DataCreateRequest,
  EditorV2DataMutationRequest,
  EditorV2DataMutationResult,
  EditorV2DataReadResult,
  EditorV2DataRequest,
  EditorV2DataWriteRequest,
  EditorV2FlushRequest,
  EditorV2FlushResult,
  EditorV2LoadErrorPayload,
  EditorV2LoadPayload,
  EditorV2ManagedMediaRemoveRequest,
  EditorV2ManagedMediaRemoveResult,
  EditorV2MediaAssetRequest,
  EditorV2MediaImportRequest,
  EditorV2MediaImportResult,
  EditorV2MediaRelinkResult,
  EditorV2MediaRevealResult,
  EditorV2MediaStatusRequest,
  EditorV2MediaStatusResult,
  EditorV2MutationUnfreezeRequest,
  EditorV2ReloadRequest,
  EditorV2ReloadResult,
  EditorV2SaveCopyRequest,
  EditorV2SaveCopyResult,
  EditorV2SaveRequest,
  EditorV2SaveResult,
  EditorV2SubtitleGenerateRequest,
  EditorV2WorkspaceSaveRequest,
  EditorV2WorkspaceSaveResult,
  EditorVersionSwitchRequest,
  EditorVersionSwitchResult,
} from '@/types/editor-v2';

const bridge: EditorV2Bridge = {
  onLoad(listener: (payload: EditorV2LoadPayload) => void) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: EditorV2LoadPayload
    ) => listener(payload);
    ipcRenderer.on('editor-v2:project:load', handler);
    return () => ipcRenderer.off('editor-v2:project:load', handler);
  },
  onLoadError(listener: (payload: EditorV2LoadErrorPayload) => void) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: EditorV2LoadErrorPayload
    ) => listener(payload);
    ipcRenderer.on('editor-v2:project:load-error', handler);
    return () => ipcRenderer.off('editor-v2:project:load-error', handler);
  },
  onFlushRequest(listener: (request: EditorV2FlushRequest) => void) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: EditorV2FlushRequest
    ) => listener(request);
    ipcRenderer.on('editor-v2:project:flush-request', handler);
    return () => ipcRenderer.off('editor-v2:project:flush-request', handler);
  },
  onMutationUnfreeze(
    listener: (request: EditorV2MutationUnfreezeRequest) => void
  ) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      request: EditorV2MutationUnfreezeRequest
    ) => listener(request);
    ipcRenderer.on('editor-v2:project:mutation-unfreeze', handler);
    return () =>
      ipcRenderer.off('editor-v2:project:mutation-unfreeze', handler);
  },
  acknowledgeFlush(result: EditorV2FlushResult) {
    ipcRenderer.send('editor-v2:project:flush-result', result);
  },
  saveProject(request: EditorV2SaveRequest) {
    return ipcRenderer.invoke(
      'editor-v2:project:save',
      request
    ) as Promise<EditorV2SaveResult>;
  },
  reloadProject(request: EditorV2ReloadRequest) {
    return ipcRenderer.invoke(
      'editor-v2:project:reload',
      request
    ) as Promise<EditorV2ReloadResult>;
  },
  saveProjectCopy(request: EditorV2SaveCopyRequest) {
    return ipcRenderer.invoke(
      'editor-v2:project:save-copy',
      request
    ) as Promise<EditorV2SaveCopyResult>;
  },
  createProject(request: EditorV2CreateProjectRequest) {
    return ipcRenderer.invoke(
      'editor-v2:project:create',
      request
    ) as Promise<EditorV2CreateProjectResult>;
  },
  saveWorkspace(request: EditorV2WorkspaceSaveRequest) {
    return ipcRenderer.invoke(
      'editor-v2:workspace:save',
      request
    ) as Promise<EditorV2WorkspaceSaveResult>;
  },
  importMedia(request: EditorV2MediaImportRequest) {
    return ipcRenderer.invoke(
      'editor-v2:media:import',
      request
    ) as Promise<EditorV2MediaImportResult>;
  },
  getMediaStatus(request: EditorV2MediaStatusRequest) {
    return ipcRenderer.invoke(
      'editor-v2:media:status',
      request
    ) as Promise<EditorV2MediaStatusResult>;
  },
  relinkMedia(request: EditorV2MediaAssetRequest) {
    return ipcRenderer.invoke(
      'editor-v2:media:relink',
      request
    ) as Promise<EditorV2MediaRelinkResult>;
  },
  revealMedia(request: EditorV2MediaAssetRequest) {
    return ipcRenderer.invoke(
      'editor-v2:media:reveal',
      request
    ) as Promise<EditorV2MediaRevealResult>;
  },
  removeManagedMedia(request: EditorV2ManagedMediaRemoveRequest) {
    return ipcRenderer.invoke(
      'editor-v2:media:remove-managed',
      request
    ) as Promise<EditorV2ManagedMediaRemoveResult>;
  },
  readData(request: EditorV2DataRequest) {
    return ipcRenderer.invoke(
      'editor-v2:data:read',
      request
    ) as Promise<EditorV2DataReadResult>;
  },
  writeData(request: EditorV2DataWriteRequest) {
    return ipcRenderer.invoke(
      'editor-v2:data:write',
      request
    ) as Promise<EditorV2DataMutationResult>;
  },
  deleteData(request: EditorV2DataMutationRequest) {
    return ipcRenderer.invoke(
      'editor-v2:data:delete',
      request
    ) as Promise<EditorV2DataMutationResult>;
  },
  resetData(request: EditorV2DataMutationRequest) {
    return ipcRenderer.invoke(
      'editor-v2:data:reset',
      request
    ) as Promise<EditorV2DataMutationResult>;
  },
  importCursor(request: EditorV2DataMutationRequest) {
    return ipcRenderer.invoke(
      'editor-v2:data:import-cursor',
      request
    ) as Promise<EditorV2DataMutationResult>;
  },
  importSubtitles(request: EditorV2DataCreateRequest) {
    return ipcRenderer.invoke(
      'editor-v2:data:import-subtitles',
      request
    ) as Promise<EditorV2DataMutationResult>;
  },
  generateSubtitles(request: EditorV2SubtitleGenerateRequest) {
    return ipcRenderer.invoke(
      'editor-v2:data:generate-subtitles',
      request
    ) as Promise<EditorV2DataMutationResult>;
  },
  switchVersion(request: EditorVersionSwitchRequest) {
    return ipcRenderer.invoke(
      'editor-v2:version:switch',
      request
    ) as Promise<EditorVersionSwitchResult>;
  },
};

contextBridge.exposeInMainWorld('editorV2', bridge);
