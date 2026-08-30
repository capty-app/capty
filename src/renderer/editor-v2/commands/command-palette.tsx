import React, { useMemo, useState } from 'react';

import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import { Input } from '@/renderer/components/ui/input';
import { formatCommandBinding, getCommandBinding } from './command-display';
import type { RuntimeEditorCommand } from './command-registry';
import type { SerializedCommandBinding } from '@/types/editor-v2';

interface CommandPaletteProps {
  open: boolean;
  commands: readonly RuntimeEditorCommand[];
  bindings: readonly SerializedCommandBinding[];
  onOpenChange: (open: boolean) => void;
  onExecuted: (label: string) => void;
}

export default function CommandPalette({
  open,
  commands,
  bindings,
  onOpenChange,
  onExecuted,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const visibleCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return commands.filter(command => {
      if (!command.placements.includes('command-palette')) return false;
      if (!normalized) return true;
      return `${command.label} ${command.description} ${command.category}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [commands, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) setQuery('');
      }}
    >
      <DialogContent className="motion-reduce:duration-0 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>
            Search every Editor V2 command and run available actions.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Search commands"
          value={query}
          onChange={event => setQuery(event.currentTarget.value)}
          placeholder="Type a command"
        />
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {visibleCommands.map(command => {
            const binding = formatCommandBinding(
              getCommandBinding(command.id, bindings)
            );
            const available = command.isAvailable();
            return (
              <li key={command.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-between px-2 py-2 text-left"
                  disabled={!available}
                  onClick={() => {
                    void command.execute().then(executed => {
                      if (!executed) return;
                      onExecuted(command.label);
                      onOpenChange(false);
                    });
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {command.label}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {command.description}
                    </span>
                  </span>
                  {binding ? (
                    <kbd className="bg-muted ml-3 rounded px-1.5 py-0.5 text-xs">
                      {binding}
                    </kbd>
                  ) : null}
                </Button>
              </li>
            );
          })}
          {visibleCommands.length === 0 ? (
            <li
              role="status"
              className="text-muted-foreground py-6 text-center text-sm"
            >
              No commands match your search.
            </li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
