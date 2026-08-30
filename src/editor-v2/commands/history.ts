import { executeEditorCommand } from './execute';
import type { EditorCommand, EditorCommandExecution } from './command';
import type { EditorProjectV2 } from '@/types/editor-v2';

interface HistoryEntry {
  undo: EditorCommand;
  redo: EditorCommand;
}

export class EditorCommandHistory {
  private undoEntries: HistoryEntry[] = [];
  private redoEntries: HistoryEntry[] = [];

  get canUndo(): boolean {
    return this.undoEntries.length > 0;
  }

  get canRedo(): boolean {
    return this.redoEntries.length > 0;
  }

  execute(
    document: EditorProjectV2,
    command: EditorCommand
  ): EditorCommandExecution {
    const execution = executeEditorCommand(document, command);
    this.undoEntries.push({ undo: execution.inverse, redo: command });
    this.redoEntries = [];
    return execution;
  }

  executeWithoutHistory(
    document: EditorProjectV2,
    command: EditorCommand
  ): EditorCommandExecution {
    const execution = executeEditorCommand(document, command);
    this.redoEntries = [];
    return execution;
  }

  undo(document: EditorProjectV2): EditorCommandExecution | null {
    const entry = this.undoEntries.pop();
    if (!entry) return null;
    const execution = executeEditorCommand(document, entry.undo);
    this.redoEntries.push({ undo: execution.inverse, redo: entry.redo });
    return execution;
  }

  redo(document: EditorProjectV2): EditorCommandExecution | null {
    const entry = this.redoEntries.pop();
    if (!entry) return null;
    const execution = executeEditorCommand(document, entry.redo);
    this.undoEntries.push({ undo: execution.inverse, redo: entry.redo });
    return execution;
  }

  clear(): void {
    this.undoEntries = [];
    this.redoEntries = [];
  }
}
