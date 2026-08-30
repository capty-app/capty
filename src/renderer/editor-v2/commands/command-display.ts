import { EDITOR_COMMAND_BY_ID } from '@/editor-v2/commands/catalog';
import { formatAccelerator } from '@/renderer/utils/shortcuts';
import type { SerializedCommandBinding } from '@/types/editor-v2';

export const getCommandBinding = (
  commandId: string,
  bindings: readonly SerializedCommandBinding[] | undefined
): string | null => {
  const configured = bindings?.find(binding => binding.commandId === commandId);
  if (configured) return configured.chord;
  return EDITOR_COMMAND_BY_ID.get(commandId)?.defaultBinding ?? null;
};

export const formatCommandBinding = (binding: string | null): string =>
  binding ? formatAccelerator(binding, ' ') : '';

export const getCommandTooltip = (
  commandId: string,
  bindings: readonly SerializedCommandBinding[] | undefined
): string => {
  const command = EDITOR_COMMAND_BY_ID.get(commandId);
  if (!command) return '';
  const binding = formatCommandBinding(getCommandBinding(commandId, bindings));
  return binding ? `${command.label} (${binding})` : command.label;
};
