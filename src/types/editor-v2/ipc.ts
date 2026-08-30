import type { EditorProjectV2 } from './document';
import type {
  EditorExportProgress,
  EditorExportResult,
  EditorExportSettings,
} from './export';

export type EditorProjectToken = string;

export interface EditorV2LoadPayload {
  projectToken: EditorProjectToken;
  displayName: string;
  displayPath: string;
  project: EditorProjectV2;
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

export interface EditorV2IpcRequestMap {
  'editor-v2:project:save': EditorV2SaveRequest;
  'editor-v2:export:start': EditorV2StartExportRequest;
  'editor-v2:export:cancel': EditorV2CancelExportRequest;
}

export interface EditorV2IpcResultMap {
  'editor-v2:project:save': EditorV2SaveResult;
  'editor-v2:export:start': EditorV2StartExportResult;
  'editor-v2:export:cancel': { accepted: boolean };
}

export interface EditorV2IpcEventMap {
  'editor-v2:project:load': EditorV2LoadPayload;
  'editor-v2:project:flush-request': EditorV2FlushRequest;
  'editor-v2:export:progress': EditorExportProgress;
  'editor-v2:export:complete': EditorExportResult;
}
