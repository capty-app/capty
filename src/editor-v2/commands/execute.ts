import { findDocumentInvariantViolations } from '../document/invariants';
import {
  EditorCommandError,
  type EditorCommand,
  type EditorCommandExecution,
} from './command';
import type { EditorProjectV2 } from '@/types/editor-v2';

export const executeEditorCommand = (
  document: EditorProjectV2,
  command: EditorCommand
): EditorCommandExecution => {
  let mutation;
  try {
    mutation = command.apply(document);
  } catch (error) {
    if (error instanceof EditorCommandError) throw error;
    throw new EditorCommandError(
      error instanceof Error ? error.message : String(error)
    );
  }

  const violations = findDocumentInvariantViolations(mutation.document);
  if (violations.length > 0) {
    throw new EditorCommandError(violations[0].message);
  }
  return {
    document: mutation.document,
    affectedIds: [...new Set(mutation.affectedIds)],
    label: command.label,
    inverse: mutation.inverse,
  };
};
