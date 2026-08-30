import { useCallback, useMemo } from 'react';

import { normalizeCommandChord } from '@/editor-v2/commands/bindings';
import type { RuntimeEditorCommand } from '../commands/command-registry';
import type { SerializedCommandBinding } from '@/types/editor-v2';

export const eventChord = (event: React.KeyboardEvent): string | null => {
  const key = event.key === ' ' ? 'Space' : event.key;
  const tokens = [
    event.metaKey ? 'Meta' : null,
    event.ctrlKey ? 'Control' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
    key,
  ].filter((token): token is string => Boolean(token));
  return normalizeCommandChord(tokens.join('+'), 'darwin');
};

export const useEditorKeybindings = (
  commands: readonly RuntimeEditorCommand[],
  bindings: readonly SerializedCommandBinding[] = []
): React.KeyboardEventHandler => {
  const activeBindings = useMemo(
    () => new Map(bindings.map(binding => [binding.commandId, binding.chord])),
    [bindings]
  );
  return useCallback(
    event => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      const chord = eventChord(event);
      if (!chord) return;
      const command = commands.find(candidate => {
        const configuredChord = activeBindings.get(candidate.id);
        const binding = activeBindings.has(candidate.id)
          ? configuredChord
          : candidate.defaultBinding;
        return binding && normalizeCommandChord(binding, 'darwin') === chord;
      });
      if (!command?.isAvailable()) return;
      event.preventDefault();
      void command.execute();
    },
    [activeBindings, commands]
  );
};
