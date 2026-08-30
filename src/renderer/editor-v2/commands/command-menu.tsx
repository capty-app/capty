import React from 'react';

import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { COMMAND_CATEGORY_LABELS } from './command-groups';
import { formatCommandBinding, getCommandBinding } from './command-display';
import type { RuntimeEditorCommand } from './command-registry';
import type {
  EditorCommandCategory,
  SerializedCommandBinding,
} from '@/types/editor-v2';

interface CommandMenuProps {
  open: boolean;
  commands: readonly RuntimeEditorCommand[];
  bindings: readonly SerializedCommandBinding[];
  onOpenChange: (open: boolean) => void;
  onExecuted: (label: string) => void;
}

const CATEGORY_ORDER = Object.keys(
  COMMAND_CATEGORY_LABELS
) as EditorCommandCategory[];

export default function CommandMenu({
  open,
  commands,
  bindings,
  onOpenChange,
  onExecuted,
}: CommandMenuProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="motion-reduce:duration-0 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editor Commands</DialogTitle>
          <DialogDescription>
            Menu actions and their current configurable shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-4 overflow-y-auto">
          {CATEGORY_ORDER.map(category => {
            const entries = commands.filter(
              command =>
                command.category === category &&
                command.placements.includes('menu')
            );
            if (entries.length === 0) return null;
            return (
              <section
                key={category}
                aria-label={COMMAND_CATEGORY_LABELS[category]}
              >
                <h3 className="text-muted-foreground mb-1 px-2 text-xs font-medium">
                  {COMMAND_CATEGORY_LABELS[category]}
                </h3>
                <div className="space-y-1">
                  {entries.map(command => {
                    const binding = formatCommandBinding(
                      getCommandBinding(command.id, bindings)
                    );
                    return (
                      <Button
                        key={command.id}
                        type="button"
                        variant="ghost"
                        className="w-full justify-between"
                        disabled={!command.isAvailable()}
                        onClick={() => {
                          void command.execute().then(executed => {
                            if (!executed) return;
                            onExecuted(command.label);
                            onOpenChange(false);
                          });
                        }}
                      >
                        <span>{command.label}</span>
                        {binding ? (
                          <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">
                            {binding}
                          </kbd>
                        ) : null}
                      </Button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
