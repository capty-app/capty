import { EDITOR_COMMAND_CATALOG } from '@/editor-v2/commands/catalog';
import type { EditorCommandMetadata } from '@/types/editor-v2';

export interface RuntimeCommandHandler {
  execute: () => void | Promise<void>;
  isAvailable: () => boolean;
}

export interface RuntimeEditorCommand extends EditorCommandMetadata {
  execute: () => Promise<boolean>;
  isAvailable: () => boolean;
}

export const createCommandRegistry = (
  handlers: Readonly<Record<string, RuntimeCommandHandler | undefined>>
): RuntimeEditorCommand[] =>
  EDITOR_COMMAND_CATALOG.map(command => {
    const handler = handlers[command.id];
    return {
      ...command,
      isAvailable: () => handler?.isAvailable() ?? false,
      execute: async () => {
        if (!handler?.isAvailable()) return false;
        await handler.execute();
        return true;
      },
    };
  });
