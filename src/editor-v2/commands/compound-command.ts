import { executeEditorCommand } from './execute';
import type { EditorCommand } from './command';

export const createCompoundCommand = (
  id: string,
  label: string,
  commands: readonly EditorCommand[]
): EditorCommand => ({
  id,
  label,
  apply(document) {
    let nextDocument = document;
    const inverses: EditorCommand[] = [];
    const affectedIds: string[] = [];
    for (const command of commands) {
      const execution = executeEditorCommand(nextDocument, command);
      nextDocument = execution.document;
      inverses.unshift(execution.inverse);
      affectedIds.push(...execution.affectedIds);
    }
    return {
      document: nextDocument,
      affectedIds,
      inverse: createCompoundCommand(
        `${id}:inverse`,
        `Undo ${label}`,
        inverses
      ),
    };
  },
});
