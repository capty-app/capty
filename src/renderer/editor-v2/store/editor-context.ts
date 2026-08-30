import { createContext } from 'react';

import type { EditorCommand } from '@/editor-v2/commands/command';
import type {
  EditorProjectV2,
  EditorSelection,
  EditorV2SaveResult,
} from '@/types/editor-v2';

export type EditorRecoveryState =
  | { kind: 'none' }
  | { kind: 'stale'; diskRevision: number }
  | { kind: 'save-failed'; error: string };

export interface EditorStoreValue {
  document: EditorProjectV2;
  selection: EditorSelection;
  mutationRevision: number;
  persistedMutationRevision: number;
  frozen: boolean;
  recovery: EditorRecoveryState;
  canUndo: boolean;
  canRedo: boolean;
  execute: (command: EditorCommand) => boolean;
  beginTransaction: () => boolean;
  previewTransaction: (command: EditorCommand) => boolean;
  commitTransaction: (id: string, label: string) => boolean;
  cancelTransaction: () => boolean;
  undo: () => boolean;
  redo: () => boolean;
  setSelection: (selection: EditorSelection) => void;
  freeze: () => void;
  unfreeze: () => void;
  acceptSave: (mutationRevision: number, result: EditorV2SaveResult) => void;
  replaceFromDisk: (document: EditorProjectV2) => void;
  clearRecovery: () => void;
}

export const EditorStoreContext = createContext<EditorStoreValue | null>(null);
