import React from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { COMMAND_CATEGORY_LABELS } from './command-groups';
import { formatCommandBinding, getCommandBinding } from './command-display';
import type {
  EditorCommandCategory,
  EditorCommandMetadata,
  SerializedCommandBinding,
} from '@/types/editor-v2';

interface ShortcutSheetProps {
  open: boolean;
  commands: readonly EditorCommandMetadata[];
  bindings: readonly SerializedCommandBinding[];
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_ORDER = Object.keys(
  COMMAND_CATEGORY_LABELS
) as EditorCommandCategory[];

export default function ShortcutSheet({
  open,
  commands,
  bindings,
  onOpenChange,
}: ShortcutSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="motion-reduce:duration-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editor V2 Shortcuts</DialogTitle>
          <DialogDescription>
            Current bindings from Settings. Unassigned commands are omitted.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-5 overflow-y-auto sm:grid-cols-2">
          {CATEGORY_ORDER.map(category => {
            const entries = commands.flatMap(command => {
              if (
                command.category !== category ||
                !command.placements.includes('shortcut-sheet')
              ) {
                return [];
              }
              const binding = formatCommandBinding(
                getCommandBinding(command.id, bindings)
              );
              return binding ? [{ command, binding }] : [];
            });
            if (entries.length === 0) return null;
            return (
              <section
                key={category}
                aria-label={COMMAND_CATEGORY_LABELS[category]}
              >
                <h3 className="mb-2 text-sm font-medium">
                  {COMMAND_CATEGORY_LABELS[category]}
                </h3>
                <dl className="space-y-1.5">
                  {entries.map(({ command, binding }) => (
                    <div
                      key={command.id}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <dt>{command.label}</dt>
                      <dd>
                        <kbd className="bg-muted rounded px-1.5 py-0.5">
                          {binding}
                        </kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
