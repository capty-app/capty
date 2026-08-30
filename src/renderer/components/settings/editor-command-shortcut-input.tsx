import React, { useMemo, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';

import {
  findCommandBindingConflicts,
  isReservedCommandChord,
  normalizeCommandBindings,
  normalizeCommandChord,
} from '@/editor-v2/commands/bindings';
import { EDITOR_COMMAND_BY_ID } from '@/editor-v2/commands/catalog';
import { Button } from '@/renderer/components/ui/button';
import { formatAccelerator } from '@/renderer/utils/shortcuts';
import type { SettingsConfig } from '@/types/settings';

interface EditorCommandShortcutInputProps {
  commandId: string;
  settings: SettingsConfig;
  onUpdate: (updates: Partial<SettingsConfig>) => void;
}

const updateBindings = (
  settings: SettingsConfig,
  commandId: string,
  chord: string | null,
  clearCommandIds: readonly string[] = []
): SettingsConfig['shortcuts'] => {
  const cleared = new Set(clearCommandIds);
  const bindings = normalizeCommandBindings(
    settings.shortcuts.editorV2,
    'darwin'
  ).map(binding => {
    if (binding.commandId === commandId) return { ...binding, chord };
    return cleared.has(binding.commandId)
      ? { ...binding, chord: null }
      : binding;
  });
  return { ...settings.shortcuts, editorV2: bindings };
};

const displayChord = (chord: string | null): string =>
  chord ? formatAccelerator(chord, ' ') : 'Not assigned';

export default function EditorCommandShortcutInput({
  commandId,
  settings,
  onUpdate,
}: EditorCommandShortcutInputProps) {
  const command = EDITOR_COMMAND_BY_ID.get(commandId);
  const bindings = useMemo(
    () => normalizeCommandBindings(settings.shortcuts.editorV2, 'darwin'),
    [settings.shortcuts.editorV2]
  );
  const binding = bindings.find(candidate => candidate.commandId === commandId);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    chord: string;
    commandIds: string[];
  } | null>(null);

  if (!command || !binding) return null;

  const apply = (chord: string | null, clearCommandIds: string[] = []) => {
    onUpdate({
      shortcuts: updateBindings(settings, commandId, chord, clearCommandIds),
    });
    setPending(null);
    setError(null);
    setRecording(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      setError(null);
      return;
    }
    const tokens = [
      event.metaKey ? 'Meta' : null,
      event.ctrlKey ? 'Control' : null,
      event.altKey ? 'Alt' : null,
      event.shiftKey ? 'Shift' : null,
      event.key === ' ' ? 'Space' : event.key,
    ].filter((token): token is string => Boolean(token));
    const chord = normalizeCommandChord(tokens.join('+'), 'darwin');
    if (!chord) return;
    if (isReservedCommandChord(chord, 'darwin')) {
      setError(`${displayChord(chord)} is reserved by macOS`);
      setRecording(false);
      return;
    }
    const conflicts = findCommandBindingConflicts(
      bindings.map(candidate =>
        candidate.commandId === commandId ? { ...candidate, chord } : candidate
      )
    ).find(conflict => conflict.chord === chord);
    const conflictingIds =
      conflicts?.commandIds.filter(candidate => candidate !== commandId) ?? [];
    if (conflictingIds.length > 0) {
      const fixedConflicts = conflictingIds.filter(
        id => !EDITOR_COMMAND_BY_ID.get(id)?.configurable
      );
      if (fixedConflicts.length > 0) {
        const labels = fixedConflicts.map(
          id => EDITOR_COMMAND_BY_ID.get(id)?.label ?? id
        );
        setError(
          `${displayChord(chord)} is fixed to ${labels.join(', ')} and cannot be replaced`
        );
        setRecording(false);
        return;
      }
      setPending({ chord, commandIds: conflictingIds });
      setRecording(false);
      return;
    }
    apply(chord);
  };

  const defaultChord = command.defaultBinding
    ? normalizeCommandChord(command.defaultBinding, 'darwin')
    : null;
  const conflictLabels = pending?.commandIds.map(
    id => EDITOR_COMMAND_BY_ID.get(id)?.label ?? id
  );
  const existingConflict = findCommandBindingConflicts(bindings).find(
    conflict => conflict.commandIds.includes(commandId)
  );
  const existingOtherIds =
    existingConflict?.commandIds.filter(id => id !== commandId) ?? [];
  const existingOtherLabels = existingOtherIds.map(
    id => EDITOR_COMMAND_BY_ID.get(id)?.label ?? id
  );
  const existingHasFixedCommand = existingOtherIds.some(
    id => !EDITOR_COMMAND_BY_ID.get(id)?.configurable
  );
  const replacePendingBinding = () => {
    if (!pending) return;
    const currentConflictingIds = bindings
      .filter(
        candidate =>
          candidate.commandId !== commandId && candidate.chord === pending.chord
      )
      .map(candidate => candidate.commandId);
    const fixedConflicts = currentConflictingIds.filter(
      id => !EDITOR_COMMAND_BY_ID.get(id)?.configurable
    );
    if (fixedConflicts.length > 0) {
      const labels = fixedConflicts.map(
        id => EDITOR_COMMAND_BY_ID.get(id)?.label ?? id
      );
      setPending(null);
      setError(
        `${displayChord(pending.chord)} is fixed to ${labels.join(', ')} and cannot be replaced`
      );
      return;
    }
    apply(pending.chord, currentConflictingIds);
  };

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{command.label}</p>
          <p className="text-muted-foreground text-xs">{command.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {command.configurable ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Clear ${command.label} shortcut`}
                disabled={!binding.chord}
                onClick={() => apply(null)}
              >
                <X className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Reset ${command.label} shortcut`}
                disabled={binding.chord === defaultChord}
                onClick={() => apply(defaultChord)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant={recording ? 'default' : 'outline'}
            className="min-w-32"
            disabled={!command.configurable}
            aria-label={`${command.label} shortcut`}
            aria-pressed={recording}
            onClick={() => {
              setPending(null);
              setError(null);
              setRecording(true);
            }}
            onKeyDown={handleKeyDown}
          >
            {recording ? 'Press shortcut' : displayChord(binding.chord)}
          </Button>
        </div>
      </div>
      {existingConflict && binding.chord && !pending ? (
        <div
          role="alert"
          className="border-destructive/50 rounded border p-2 text-xs"
        >
          <p>
            {displayChord(binding.chord)} also belongs to{' '}
            {existingOtherLabels.join(', ')}.
          </p>
          {command.configurable ? (
            <Button
              type="button"
              size="sm"
              className="mt-2"
              onClick={() =>
                existingHasFixedCommand
                  ? apply(null)
                  : apply(binding.chord, existingOtherIds)
              }
            >
              {existingHasFixedCommand
                ? 'Clear this shortcut'
                : 'Keep this shortcut'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {pending ? (
        <div
          role="alert"
          className="border-destructive/50 rounded border p-2 text-xs"
        >
          <p>
            {displayChord(pending.chord)} is assigned to{' '}
            {conflictLabels?.join(', ')}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={replacePendingBinding}>
              Replace existing
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
