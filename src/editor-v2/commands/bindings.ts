import { EDITOR_COMMAND_CATALOG } from './catalog';
import type { SerializedCommandBinding } from '@/types/editor-v2';
import type {
  EditorShortcuts,
  VideoEditorSidebarShortcuts,
} from '@/types/settings';

export type EditorBindingPlatform = 'darwin' | 'other';

export interface CommandBindingConflict {
  chord: string;
  commandIds: string[];
}

const MODIFIER_ORDER = ['Meta', 'Control', 'Alt', 'Shift'] as const;
const KEY_NAMES: Readonly<Record<string, string>> = {
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  backspace: 'Backspace',
  delete: 'Delete',
  end: 'End',
  enter: 'Enter',
  escape: 'Escape',
  home: 'Home',
  space: 'Space',
  tab: 'Tab',
};

const normalizeToken = (
  token: string,
  platform: EditorBindingPlatform
): string | null => {
  if (token === ' ') return 'Space';
  const normalized = token.trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === 'commandorcontrol' ||
    normalized === 'cmdorctrl' ||
    normalized === 'mod'
  ) {
    return platform === 'darwin' ? 'Meta' : 'Control';
  }
  if (
    normalized === 'command' ||
    normalized === 'cmd' ||
    normalized === 'meta'
  ) {
    return 'Meta';
  }
  if (normalized === 'control' || normalized === 'ctrl') return 'Control';
  if (normalized === 'option' || normalized === 'alt') return 'Alt';
  if (normalized === 'shift') return 'Shift';
  if (KEY_NAMES[normalized]) return KEY_NAMES[normalized];
  if (/^f\d{1,2}$/.test(normalized)) return normalized.toUpperCase();
  if (normalized.length === 1) return normalized.toUpperCase();
  return `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
};

export const normalizeCommandChord = (
  chord: string,
  platform: EditorBindingPlatform
): string | null => {
  const tokens = chord
    .split('+')
    .map(token => normalizeToken(token, platform))
    .filter((token): token is string => token !== null);
  if (tokens.length === 0) return null;

  const modifiers = new Set(
    tokens.filter(token =>
      MODIFIER_ORDER.includes(token as (typeof MODIFIER_ORDER)[number])
    )
  );
  const keys = tokens.filter(
    token => !MODIFIER_ORDER.includes(token as (typeof MODIFIER_ORDER)[number])
  );
  if (keys.length !== 1) return null;
  return [
    ...MODIFIER_ORDER.filter(modifier => modifiers.has(modifier)),
    keys[0],
  ].join('+');
};

export const isReservedCommandChord = (
  chord: string,
  platform: EditorBindingPlatform
): boolean => {
  const normalized = normalizeCommandChord(chord, platform);
  if (!normalized) return false;
  if (normalized === 'Alt+F4') return true;
  if (platform !== 'darwin') return false;
  return ['Meta+Q', 'Meta+W', 'Meta+H', 'Meta+M'].includes(normalized);
};

export const createDefaultCommandBindings = (
  platform: EditorBindingPlatform
): SerializedCommandBinding[] =>
  EDITOR_COMMAND_CATALOG.map(command => ({
    commandId: command.id,
    chord: command.defaultBinding
      ? normalizeCommandChord(command.defaultBinding, platform)
      : null,
  }));

export const normalizeCommandBindings = (
  bindings: readonly SerializedCommandBinding[] | undefined,
  platform: EditorBindingPlatform
): SerializedCommandBinding[] => {
  const saved = new Map(
    bindings?.map(binding => [binding.commandId, binding.chord])
  );
  return EDITOR_COMMAND_CATALOG.map(command => {
    const defaultChord = command.defaultBinding
      ? normalizeCommandChord(command.defaultBinding, platform)
      : null;
    const savedChord = saved.get(command.id);
    if (!command.configurable || savedChord === undefined) {
      return { commandId: command.id, chord: defaultChord };
    }
    if (savedChord === null) return { commandId: command.id, chord: null };
    const normalized = normalizeCommandChord(savedChord, platform);
    return {
      commandId: command.id,
      chord:
        normalized && !isReservedCommandChord(normalized, platform)
          ? normalized
          : defaultChord,
    };
  });
};

export const findCommandBindingConflicts = (
  bindings: readonly SerializedCommandBinding[]
): CommandBindingConflict[] => {
  const commandsByChord = new Map<string, string[]>();
  for (const binding of bindings) {
    if (!binding.chord) continue;
    const commandIds = commandsByChord.get(binding.chord) ?? [];
    commandIds.push(binding.commandId);
    commandsByChord.set(binding.chord, commandIds);
  }
  return [...commandsByChord.entries()]
    .filter(([, commandIds]) => commandIds.length > 1)
    .map(([chord, commandIds]) => ({ chord, commandIds }));
};

interface LegacyEditorBindings {
  editor?: Partial<EditorShortcuts>;
  videoEditorSidebar?: Partial<VideoEditorSidebarShortcuts>;
}

export const migrateLegacyEditorBindings = (
  savedBindings: readonly SerializedCommandBinding[] | undefined,
  legacy: LegacyEditorBindings,
  platform: EditorBindingPlatform
): SerializedCommandBinding[] => {
  if (savedBindings) return normalizeCommandBindings(savedBindings, platform);

  const bindings = createDefaultCommandBindings(platform);
  const candidates: Array<[string, string | undefined]> = [
    ['tool.selection', legacy.editor?.select],
    ['tool.transform-crop', legacy.editor?.crop],
    ['annotation.pen', legacy.editor?.pen],
    ['annotation.highlight', legacy.editor?.highlight],
    ['annotation.rectangle', legacy.editor?.rectangle],
    ['annotation.circle', legacy.editor?.circle],
    ['annotation.line', legacy.editor?.line],
    ['annotation.arrow', legacy.editor?.arrow],
    ['annotation.text', legacy.editor?.text],
    ['annotation.number', legacy.editor?.number],
    ['annotation.redact', legacy.editor?.redact],
    ['effect.add-zoom', legacy.videoEditorSidebar?.zoom],
    ['effect.add-annotation', legacy.videoEditorSidebar?.drawing],
  ];

  for (const [commandId, chord] of candidates) {
    if (!chord) continue;
    const normalized = normalizeCommandChord(chord, platform);
    if (!normalized || isReservedCommandChord(normalized, platform)) continue;
    const target = bindings.find(binding => binding.commandId === commandId);
    if (!target) continue;
    const conflicts = bindings.some(
      binding => binding.commandId !== commandId && binding.chord === normalized
    );
    if (!conflicts) target.chord = normalized;
  }
  return bindings;
};
