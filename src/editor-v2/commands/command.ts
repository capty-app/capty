import type { EditorProjectV2 } from '@/types/editor-v2';

export interface EditorCommandMutation {
  document: EditorProjectV2;
  affectedIds: string[];
  inverse: EditorCommand;
}

export interface EditorCommand {
  id: string;
  label: string;
  apply: (document: EditorProjectV2) => EditorCommandMutation;
}

export interface EditorCommandExecution {
  document: EditorProjectV2;
  affectedIds: string[];
  label: string;
  inverse: EditorCommand;
}

export class EditorCommandError extends Error {}
