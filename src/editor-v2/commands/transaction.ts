import { createCompoundCommand } from './compound-command';
import { executeEditorCommand } from './execute';
import type { EditorCommand } from './command';
import type { EditorProjectV2 } from '@/types/editor-v2';

export class EditorCommandTransaction {
  private readonly initialDocument: EditorProjectV2;
  private currentDocument: EditorProjectV2;
  private commands: EditorCommand[] = [];

  constructor(document: EditorProjectV2) {
    this.initialDocument = document;
    this.currentDocument = document;
  }

  preview(command: EditorCommand): EditorProjectV2 {
    const execution = executeEditorCommand(this.currentDocument, command);
    this.currentDocument = execution.document;
    this.commands.push(command);
    return this.currentDocument;
  }

  commit(id: string, label: string): EditorCommand | null {
    if (this.commands.length === 0) return null;
    return createCompoundCommand(id, label, this.commands);
  }

  cancel(): EditorProjectV2 {
    return this.initialDocument;
  }
}
