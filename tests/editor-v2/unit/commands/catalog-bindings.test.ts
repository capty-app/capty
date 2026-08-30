import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultCommandBindings,
  findCommandBindingConflicts,
  isReservedCommandChord,
  migrateLegacyEditorBindings,
  normalizeCommandBindings,
  normalizeCommandChord,
} from '@/editor-v2/commands/bindings';
import {
  EDITOR_COMMAND_BY_ID,
  EDITOR_COMMAND_CATALOG,
} from '@/editor-v2/commands/catalog';
import { createCommandRegistry } from '@/renderer/editor-v2/commands/command-registry';

const REQUIRED_COMMAND_IDS = [
  'project.create',
  'project.import-media',
  'project.save',
  'project.rename',
  'project.reveal',
  'project.export',
  'project.cancel-export',
  'project.command-palette',
  'project.shortcut-sheet',
  'edit.undo',
  'edit.redo',
  'edit.select-all-clips',
  'edit.clear-selection',
  'edit.duplicate',
  'edit.delete-selection',
  'edit.split-at-playhead',
  'edit.toggle-snapping',
  'edit.toggle-ripple',
  'tool.selection',
  'tool.blade',
  'tool.transform-crop',
  'effect.add-zoom',
  'effect.add-annotation',
  'effect.add-caption',
  'annotation.select',
  'annotation.pen',
  'annotation.highlight',
  'annotation.rectangle',
  'annotation.circle',
  'annotation.line',
  'annotation.arrow',
  'annotation.text',
  'annotation.number',
  'annotation.redact',
  'playback.toggle',
  'playback.previous-frame',
  'playback.next-frame',
  'playback.sequence-start',
  'playback.sequence-end',
  'playback.previous-edit',
  'playback.next-edit',
  'playback.seek-backward-short',
  'playback.seek-forward-short',
  'playback.seek-backward-long',
  'playback.seek-forward-long',
  'playback.toggle-scrub-audio',
  'timeline.zoom-in',
  'timeline.zoom-out',
  'timeline.zoom-reset',
  'timeline.zoom-fit',
  'track.add-video',
  'track.add-audio',
  'clip.move-track-up',
  'clip.move-track-down',
  'clip.nudge-left',
  'clip.nudge-right',
  'track.toggle-lock',
  'track.toggle-output',
  'workspace.cycle-regions',
  'workspace.focus-title',
  'workspace.focus-browser',
  'workspace.focus-viewer',
  'workspace.focus-inspector',
  'workspace.focus-timeline',
  'workspace.toggle-browser',
  'workspace.toggle-inspector',
  'workspace.toggle-timeline',
  'workspace.reset',
] as const;

describe('Editor V2 command catalog and bindings', () => {
  it('contains the complete unique static inventory', () => {
    const ids = EDITOR_COMMAND_CATALOG.map(command => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED_COMMAND_IDS));
    expect(EDITOR_COMMAND_BY_ID.size).toBe(EDITOR_COMMAND_CATALOG.length);
    for (const command of EDITOR_COMMAND_CATALOG) {
      expect(command.placements).toEqual(
        expect.arrayContaining([
          'menu',
          'tooltip',
          'command-palette',
          'shortcut-sheet',
        ])
      );
    }
  });

  it('normalizes platform modifiers and rejects malformed chords', () => {
    expect(normalizeCommandChord('shift+cmd+k', 'darwin')).toBe('Meta+Shift+K');
    expect(normalizeCommandChord('mod+k', 'other')).toBe('Control+K');
    expect(normalizeCommandChord('option+ArrowLeft', 'darwin')).toBe(
      'Alt+ArrowLeft'
    );
    expect(normalizeCommandChord('A+B', 'darwin')).toBeNull();
    expect(normalizeCommandChord(' ', 'darwin')).toBe('Space');
    expect(isReservedCommandChord('Command+Q', 'darwin')).toBe(true);
  });

  it('provides conflict-free defaults and reports configured conflicts', () => {
    const defaults = createDefaultCommandBindings('darwin');
    expect(findCommandBindingConflicts(defaults)).toEqual([]);
    expect(
      findCommandBindingConflicts([
        { commandId: 'one', chord: 'Meta+K' },
        { commandId: 'two', chord: 'Meta+K' },
      ])
    ).toEqual([{ chord: 'Meta+K', commandIds: ['one', 'two'] }]);
  });

  it('normalizes saved bindings and migrates only non-conflicting legacy keys', () => {
    const normalized = normalizeCommandBindings(
      [{ commandId: 'tool.selection', chord: 'cmd+k' }],
      'darwin'
    );
    expect(
      normalized.find(binding => binding.commandId === 'tool.selection')
    ).toEqual({ commandId: 'tool.selection', chord: 'Meta+K' });
    const guarded = normalizeCommandBindings(
      [
        { commandId: 'project.save', chord: null },
        { commandId: 'tool.selection', chord: 'Command+Q' },
      ],
      'darwin'
    );
    expect(
      guarded.find(binding => binding.commandId === 'project.save')
    ).toEqual({ commandId: 'project.save', chord: 'Meta+S' });
    expect(
      guarded.find(binding => binding.commandId === 'tool.selection')
    ).toEqual({ commandId: 'tool.selection', chord: 'V' });

    const migrated = migrateLegacyEditorBindings(
      undefined,
      {
        editor: { select: 'F', pen: 'Command+Q' },
        videoEditorSidebar: { zoom: 'G' },
      },
      'darwin'
    );
    expect(
      migrated.find(binding => binding.commandId === 'tool.selection')?.chord
    ).toBe('V');
    expect(
      migrated.find(binding => binding.commandId === 'annotation.pen')?.chord
    ).toBe('P');
    expect(
      migrated.find(binding => binding.commandId === 'effect.add-zoom')?.chord
    ).toBe('G');
  });

  it('resolves every timeline keyboard equivalent through catalog IDs', () => {
    const timelineShortcutIds = [
      'edit.undo',
      'edit.redo',
      'edit.select-all-clips',
      'edit.clear-selection',
      'edit.delete-selection',
      'edit.split-at-playhead',
      'edit.toggle-snapping',
      'edit.toggle-ripple',
      'timeline.zoom-in',
      'timeline.zoom-out',
      'timeline.zoom-fit',
      'clip.nudge-left',
      'clip.nudge-right',
    ];
    const handlers = Object.fromEntries(
      timelineShortcutIds.map(id => [
        id,
        { execute: vi.fn(), isAvailable: () => true },
      ])
    );
    const registry = createCommandRegistry(handlers);
    for (const id of timelineShortcutIds) {
      const command = registry.find(candidate => candidate.id === id);
      expect(command?.defaultBinding).toBeTruthy();
      expect(command?.isAvailable()).toBe(true);
    }
  });

  it('injects runtime availability and dispatch without mutable global state', async () => {
    const execute = vi.fn();
    const registry = createCommandRegistry({
      'edit.undo': { execute, isAvailable: () => true },
    });
    const undo = registry.find(command => command.id === 'edit.undo')!;
    const redo = registry.find(command => command.id === 'edit.redo')!;

    expect(undo.isAvailable()).toBe(true);
    await expect(undo.execute()).resolves.toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    expect(redo.isAvailable()).toBe(false);
    await expect(redo.execute()).resolves.toBe(false);
  });
});
