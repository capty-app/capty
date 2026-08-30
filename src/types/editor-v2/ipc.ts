import type { CursorData } from '../cursor';
import type { KeyboardData } from '../keyboard';
import type { SubtitleData } from '../subtitle';
import type { SerializedCommandBinding } from './commands';
import type { EditorProjectV2 } from './document';
import type {
  EditableDataLocator,
  MediaAsset,
  MediaAssetStatus,
  MediaImportPolicy,
  MediaSourceRole,
} from './media';
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
  commandBindings: SerializedCommandBinding[];
  canSwitchEditorVersion: boolean;
  requiresProjectCreation: boolean;
  mediaRecoveryWarnings: string[];
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

export interface EditorV2ReloadRequest {
  projectToken: EditorProjectToken;
}

export type EditorV2ReloadResult =
  | {
      status: 'loaded';
      project: EditorProjectV2;
      workspace: EditorV2Workspace;
      mediaRecoveryWarnings: string[];
    }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export interface EditorV2SaveCopyRequest {
  projectToken: EditorProjectToken;
  project: EditorProjectV2;
  workspace: EditorV2Workspace;
}

export type EditorV2SaveCopyResult =
  | { status: 'saved' }
  | { status: 'cancelled' }
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

export interface EditorV2CreateProjectRequest {
  projectToken: EditorProjectToken;
  policy: MediaImportPolicy;
  workspace: EditorV2Workspace;
}

export type EditorV2CreateProjectResult =
  | {
      status: 'created';
      project: EditorProjectV2;
      displayName: string;
      displayPath: string;
    }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export interface EditorV2MediaImportRequest {
  projectToken: EditorProjectToken;
  policy: MediaImportPolicy;
}

export type EditorV2MediaImportResult =
  | { status: 'imported'; asset: MediaAsset; media: MediaAssetStatus }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export interface EditorV2MediaAssetRequest {
  projectToken: EditorProjectToken;
  assetId: string;
}

export interface EditorV2MediaStatusRequest extends EditorV2MediaAssetRequest {
  sourceStreamId?: string;
  sourceRole?: MediaSourceRole;
}

export type EditorV2MediaStatusResult =
  | { status: 'resolved'; asset: MediaAssetStatus }
  | { status: 'failed'; error: string };

export type EditorV2MediaRelinkResult =
  | {
      status: 'relinked';
      asset: MediaAsset;
      media: MediaAssetStatus;
    }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export type EditorV2MediaRevealResult =
  { status: 'revealed' } | { status: 'failed'; error: string };

export interface EditorV2ManagedMediaRemoveRequest extends EditorV2MediaAssetRequest {
  expectedRevision: number;
}

export type EditorV2ManagedMediaRemoveResult =
  | {
      status: 'removed';
      project: EditorProjectV2;
      revision: number;
      cleanupWarning?: string;
    }
  | { status: 'cancelled' }
  | { status: 'stale'; diskRevision: number }
  | { status: 'failed'; error: string };

export type EditorV2DataKind = 'cursor' | 'keyboard' | 'subtitles';

export type EditorV2DataValue =
  | { kind: 'cursor'; value: CursorData }
  | { kind: 'keyboard'; value: KeyboardData }
  | { kind: 'subtitles'; value: SubtitleData };

export interface EditorV2DataRequest {
  projectToken: EditorProjectToken;
  kind: EditorV2DataKind;
  locator: EditableDataLocator;
}

export interface EditorV2DataWriteRequest extends EditorV2DataRequest {
  expectedRevision: number;
  assetId: string;
  value: EditorV2DataValue;
}

export interface EditorV2DataMutationRequest extends EditorV2DataRequest {
  expectedRevision: number;
  assetId: string;
}

export interface EditorV2DataCreateRequest {
  projectToken: EditorProjectToken;
  expectedRevision: number;
  assetId: string;
}

export interface EditorV2SubtitleGenerateRequest extends EditorV2DataCreateRequest {
  model: 'base' | 'small' | 'medium';
  prompt?: string;
}

export type EditorV2DataReadResult =
  | { status: 'loaded'; data: EditorV2DataValue }
  | { status: 'failed'; error: string };

export type EditorV2DataMutationResult =
  | { status: 'updated'; project: EditorProjectV2; revision: number }
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

export interface EditorV2MutationUnfreezeRequest {
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
  'editor-v2:project:reload': EditorV2ReloadRequest;
  'editor-v2:project:save-copy': EditorV2SaveCopyRequest;
  'editor-v2:project:create': EditorV2CreateProjectRequest;
  'editor-v2:workspace:save': EditorV2WorkspaceSaveRequest;
  'editor-v2:media:import': EditorV2MediaImportRequest;
  'editor-v2:media:status': EditorV2MediaStatusRequest;
  'editor-v2:media:relink': EditorV2MediaAssetRequest;
  'editor-v2:media:reveal': EditorV2MediaAssetRequest;
  'editor-v2:media:remove-managed': EditorV2ManagedMediaRemoveRequest;
  'editor-v2:data:read': EditorV2DataRequest;
  'editor-v2:data:write': EditorV2DataWriteRequest;
  'editor-v2:data:delete': EditorV2DataMutationRequest;
  'editor-v2:data:reset': EditorV2DataMutationRequest;
  'editor-v2:data:import-cursor': EditorV2DataMutationRequest;
  'editor-v2:data:import-subtitles': EditorV2DataCreateRequest;
  'editor-v2:data:generate-subtitles': EditorV2SubtitleGenerateRequest;
  'editor-v2:export:start': EditorV2StartExportRequest;
  'editor-v2:export:cancel': EditorV2CancelExportRequest;
  'editor-v2:version:switch': EditorVersionSwitchRequest;
}

export interface EditorV2IpcResultMap {
  'editor-v2:project:save': EditorV2SaveResult;
  'editor-v2:project:reload': EditorV2ReloadResult;
  'editor-v2:project:save-copy': EditorV2SaveCopyResult;
  'editor-v2:project:create': EditorV2CreateProjectResult;
  'editor-v2:workspace:save': EditorV2WorkspaceSaveResult;
  'editor-v2:media:import': EditorV2MediaImportResult;
  'editor-v2:media:status': EditorV2MediaStatusResult;
  'editor-v2:media:relink': EditorV2MediaRelinkResult;
  'editor-v2:media:reveal': EditorV2MediaRevealResult;
  'editor-v2:media:remove-managed': EditorV2ManagedMediaRemoveResult;
  'editor-v2:data:read': EditorV2DataReadResult;
  'editor-v2:data:write': EditorV2DataMutationResult;
  'editor-v2:data:delete': EditorV2DataMutationResult;
  'editor-v2:data:reset': EditorV2DataMutationResult;
  'editor-v2:data:import-cursor': EditorV2DataMutationResult;
  'editor-v2:data:import-subtitles': EditorV2DataMutationResult;
  'editor-v2:data:generate-subtitles': EditorV2DataMutationResult;
  'editor-v2:export:start': EditorV2StartExportResult;
  'editor-v2:export:cancel': { accepted: boolean };
  'editor-v2:version:switch': EditorVersionSwitchResult;
}

export interface EditorV2IpcEventMap {
  'editor-v2:project:load': EditorV2LoadPayload;
  'editor-v2:project:load-error': EditorV2LoadErrorPayload;
  'editor-v2:project:flush-request': EditorV2FlushRequest;
  'editor-v2:project:mutation-unfreeze': EditorV2MutationUnfreezeRequest;
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
  onMutationUnfreeze: (
    listener: (request: EditorV2MutationUnfreezeRequest) => void
  ) => () => void;
  acknowledgeFlush: (result: EditorV2FlushResult) => void;
  saveProject: (request: EditorV2SaveRequest) => Promise<EditorV2SaveResult>;
  reloadProject: (
    request: EditorV2ReloadRequest
  ) => Promise<EditorV2ReloadResult>;
  saveProjectCopy: (
    request: EditorV2SaveCopyRequest
  ) => Promise<EditorV2SaveCopyResult>;
  createProject: (
    request: EditorV2CreateProjectRequest
  ) => Promise<EditorV2CreateProjectResult>;
  saveWorkspace: (
    request: EditorV2WorkspaceSaveRequest
  ) => Promise<EditorV2WorkspaceSaveResult>;
  importMedia: (
    request: EditorV2MediaImportRequest
  ) => Promise<EditorV2MediaImportResult>;
  getMediaStatus: (
    request: EditorV2MediaStatusRequest
  ) => Promise<EditorV2MediaStatusResult>;
  relinkMedia: (
    request: EditorV2MediaAssetRequest
  ) => Promise<EditorV2MediaRelinkResult>;
  revealMedia: (
    request: EditorV2MediaAssetRequest
  ) => Promise<EditorV2MediaRevealResult>;
  removeManagedMedia: (
    request: EditorV2ManagedMediaRemoveRequest
  ) => Promise<EditorV2ManagedMediaRemoveResult>;
  readData: (request: EditorV2DataRequest) => Promise<EditorV2DataReadResult>;
  writeData: (
    request: EditorV2DataWriteRequest
  ) => Promise<EditorV2DataMutationResult>;
  deleteData: (
    request: EditorV2DataMutationRequest
  ) => Promise<EditorV2DataMutationResult>;
  resetData: (
    request: EditorV2DataMutationRequest
  ) => Promise<EditorV2DataMutationResult>;
  importCursor: (
    request: EditorV2DataMutationRequest
  ) => Promise<EditorV2DataMutationResult>;
  importSubtitles: (
    request: EditorV2DataCreateRequest
  ) => Promise<EditorV2DataMutationResult>;
  generateSubtitles: (
    request: EditorV2SubtitleGenerateRequest
  ) => Promise<EditorV2DataMutationResult>;
  switchVersion: (
    request: EditorVersionSwitchRequest
  ) => Promise<EditorVersionSwitchResult>;
}
