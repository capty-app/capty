import React, { act, useState } from 'react';

import { createDefaultCommandBindings } from '@/editor-v2/commands/bindings';
import { EDITOR_COMMAND_CATALOG } from '@/editor-v2/commands/catalog';
import EditorCommandShortcutInput from '@/renderer/components/settings/editor-command-shortcut-input';
import { SHORTCUTS_ITEMS } from '@/renderer/components/settings/registry/shortcuts';
import { DEFAULT_SETTINGS, type SettingsConfig } from '@/types/settings';
import { render, type RenderResult } from '../helpers/render';

let rendered: RenderResult | null = null;

function Harness({
  commandId,
  withConflict = false,
}: {
  commandId: string;
  withConflict?: boolean;
}) {
  const [settings, setSettings] = useState<SettingsConfig>(() => ({
    ...structuredClone(DEFAULT_SETTINGS),
    shortcuts: {
      ...structuredClone(DEFAULT_SETTINGS.shortcuts),
      editorV2: createDefaultCommandBindings('darwin').map(binding =>
        withConflict && binding.commandId === 'tool.selection'
          ? { ...binding, chord: 'B' }
          : binding
      ),
    },
  }));
  return (
    <EditorCommandShortcutInput
      commandId={commandId}
      settings={settings}
      onUpdate={update => setSettings(current => ({ ...current, ...update }))}
    />
  );
}

function ConflictHarness() {
  const [settings, setSettings] = useState<SettingsConfig>(() => ({
    ...structuredClone(DEFAULT_SETTINGS),
    shortcuts: {
      ...structuredClone(DEFAULT_SETTINGS.shortcuts),
      editorV2: createDefaultCommandBindings('darwin'),
    },
  }));
  const update = (changes: Partial<SettingsConfig>) =>
    setSettings(current => ({ ...current, ...changes }));
  return (
    <>
      <EditorCommandShortcutInput
        commandId="tool.selection"
        settings={settings}
        onUpdate={update}
      />
      <EditorCommandShortcutInput
        commandId="tool.blade"
        settings={settings}
        onUpdate={update}
      />
    </>
  );
}

const record = (label: string, event: KeyboardEventInit) => {
  const button = rendered?.container.querySelector<HTMLButtonElement>(
    `[aria-label="${label} shortcut"]`
  );
  act(() => button?.click());
  act(() => button?.dispatchEvent(new KeyboardEvent('keydown', event)));
};

describe('Editor V2 shortcut settings', () => {
  afterEach(() => {
    rendered?.unmount();
    rendered?.container.remove();
    rendered = null;
  });

  it('derives searchable Settings groups from the command catalog', () => {
    const items = SHORTCUTS_ITEMS.filter(
      item => item.type === 'editor-command-shortcut'
    );
    expect(items).toHaveLength(EDITOR_COMMAND_CATALOG.length);
    expect(items.map(item => item.label)).toEqual(
      EDITOR_COMMAND_CATALOG.map(command => command.label)
    );
    expect(new Set(items.map(item => item.section))).toEqual(
      new Set([
        'Editor V2 Project',
        'Editor V2 Edit',
        'Editor V2 Tools and Effects',
        'Editor V2 Playback',
        'Editor V2 Timeline and Tracks',
        'Editor V2 Workspace and Focus',
      ])
    );
  });

  it('offers actionable conflict replacement', () => {
    rendered = render(<Harness commandId="tool.selection" />);

    record('Selection Tool', { key: 'b', bubbles: true });

    expect(rendered.container.textContent).toContain(
      'B is assigned to Blade Tool'
    );
    const replace = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent === 'Replace existing'
    );
    act(() => replace?.click());

    expect(
      rendered.container.querySelector<HTMLButtonElement>(
        '[aria-label="Selection Tool shortcut"]'
      )?.textContent
    ).toBe('B');
  });

  it('revalidates conflicts before replacing a shortcut', () => {
    rendered = render(<ConflictHarness />);
    record('Selection Tool', { key: 'b', bubbles: true });
    record('Blade Tool', { key: 'k', bubbles: true });

    const replace = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent === 'Replace existing'
    );
    act(() => replace?.click());

    expect(
      rendered.container.querySelector<HTMLButtonElement>(
        '[aria-label="Selection Tool shortcut"]'
      )?.textContent
    ).toBe('B');
    expect(
      rendered.container.querySelector<HTMLButtonElement>(
        '[aria-label="Blade Tool shortcut"]'
      )?.textContent
    ).toBe('K');
  });

  it('surfaces and resolves conflicts already present in saved settings', () => {
    rendered = render(<Harness commandId="tool.selection" withConflict />);
    expect(rendered.container.textContent).toContain(
      'B also belongs to Blade Tool'
    );
    const keep = [...rendered.container.querySelectorAll('button')].find(
      button => button.textContent === 'Keep this shortcut'
    );
    act(() => keep?.click());
    expect(rendered.container.textContent).not.toContain(
      'B also belongs to Blade Tool'
    );
  });

  it('rejects reserved macOS shortcuts and keeps fixed commands disabled', () => {
    rendered = render(<Harness commandId="tool.selection" />);
    record('Selection Tool', {
      key: 'q',
      metaKey: true,
      bubbles: true,
    });
    expect(rendered.container.textContent).toContain(
      '⌘ Q is reserved by macOS'
    );
    record('Selection Tool', {
      key: 's',
      metaKey: true,
      bubbles: true,
    });
    expect(rendered.container.textContent).toContain(
      '⌘ S is fixed to Save Project and cannot be replaced'
    );

    rendered.unmount();
    rendered.container.remove();
    rendered = render(<Harness commandId="project.save" />);
    expect(
      rendered.container.querySelector<HTMLButtonElement>(
        '[aria-label="Save Project shortcut"]'
      )?.disabled
    ).toBe(true);
  });
});
