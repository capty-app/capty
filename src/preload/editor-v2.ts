import { contextBridge, ipcRenderer } from 'electron';

import type {
  EditorV2Bridge,
  EditorV2FlushRequest,
  EditorV2FlushResult,
  EditorV2LoadErrorPayload,
  EditorV2LoadPayload,
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
  acknowledgeFlush(result: EditorV2FlushResult) {
    ipcRenderer.send('editor-v2:project:flush-result', result);
  },
  saveWorkspace(request: EditorV2WorkspaceSaveRequest) {
    return ipcRenderer.invoke(
      'editor-v2:workspace:save',
      request
    ) as Promise<EditorV2WorkspaceSaveResult>;
  },
  switchVersion(request: EditorVersionSwitchRequest) {
    return ipcRenderer.invoke(
      'editor-v2:version:switch',
      request
    ) as Promise<EditorVersionSwitchResult>;
  },
};

contextBridge.exposeInMainWorld('editorV2', bridge);
