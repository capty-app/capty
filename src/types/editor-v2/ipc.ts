import type { EditorProjectV2 } from './document';
import type {
  EditorExportProgress,
  EditorExportResult,
  EditorExportSettings,
} from './export';
import type { EditorV2Workspace } from './workspace';

export type EditorProjectToken = string;
export type EditorVersion = 'v1' | 'v2';

export interface EditorV2LoadPayload {
  projectToken: EditorProjectToken;
  displayName: string;
  displayPath: string;
  project: EditorProjectV2;
  workspace: EditorV2Workspace;
  canSwitchEditorVersion: boolean;
}

export interface EditorV2LoadErrorPayload {
  error: string;
}

export interface EditorV2SaveRequest {
  projectToken: EditorProjectToken;
  expectedRevision: number;
  project: EditorProjectV2;
}

export type EditorV2SaveResult =
  | { status: 'saved'; revision: number }
  | { status: 'stale'; diskRevision: number }
  | { status: 'failed'; error: string };

export interface EditorV2WorkspaceSaveRequest {
  projectToken: EditorProjectToken;
  expectedRevision: number;
  workspace: EditorV2Workspace;
}

export type EditorV2WorkspaceSaveResult =
  | { status: 'saved'; revision: number }
  | { status: 'stale'; diskRevision: number }
  | { status: 'failed'; error: string };

export interface EditorV2StartExportRequest {
  projectToken: EditorProjectToken;
  expectedRevision: number;
  settings: EditorExportSettings;
}

export interface EditorV2StartExportResult {
  jobId: string;
}

export interface EditorV2CancelExportRequest {
  jobId: string;
}

export interface EditorV2FlushRequest {
  requestId: string;
}

export interface EditorV2FlushResult {
  requestId: string;
  status: 'flushed' | 'failed';
  projectRevision: number;
  workspaceRevision: number;
  error?: string;
}

export interface EditorVersionSwitchRequest {
  targetVersion: EditorVersion;
}

export type EditorVersionSwitchResult =
  { status: 'switched' } | { status: 'cancelled'; error: string };

export interface EditorV2IpcRequestMap {
  'editor-v2:project:save': EditorV2SaveRequest;
  'editor-v2:workspace:save': EditorV2WorkspaceSaveRequest;
  'editor-v2:export:start': EditorV2StartExportRequest;
  'editor-v2:export:cancel': EditorV2CancelExportRequest;
  'editor-v2:version:switch': EditorVersionSwitchRequest;
}

export interface EditorV2IpcResultMap {
  'editor-v2:project:save': EditorV2SaveResult;
  'editor-v2:workspace:save': EditorV2WorkspaceSaveResult;
  'editor-v2:export:start': EditorV2StartExportResult;
  'editor-v2:export:cancel': { accepted: boolean };
  'editor-v2:version:switch': EditorVersionSwitchResult;
}

export interface EditorV2IpcEventMap {
  'editor-v2:project:load': EditorV2LoadPayload;
  'editor-v2:project:load-error': EditorV2LoadErrorPayload;
  'editor-v2:project:flush-request': EditorV2FlushRequest;
  'editor-v2:export:progress': EditorExportProgress;
  'editor-v2:export:complete': EditorExportResult;
}

export interface EditorV2Bridge {
  onLoad: (listener: (payload: EditorV2LoadPayload) => void) => () => void;
  onLoadError: (
    listener: (payload: EditorV2LoadErrorPayload) => void
  ) => () => void;
  onFlushRequest: (
    listener: (request: EditorV2FlushRequest) => void
  ) => () => void;
  acknowledgeFlush: (result: EditorV2FlushResult) => void;
  saveWorkspace: (
    request: EditorV2WorkspaceSaveRequest
  ) => Promise<EditorV2WorkspaceSaveResult>;
  switchVersion: (
    request: EditorVersionSwitchRequest
  ) => Promise<EditorVersionSwitchResult>;
}
