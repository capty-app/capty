import type {
  EditorCommandCategory,
  EditorCommandMetadata,
} from '@/types/editor-v2';

interface CommandDefinition {
  id: string;
  category: EditorCommandCategory;
  label: string;
  binding?: string;
  configurable?: boolean;
  placements?: EditorCommandMetadata['placements'];
}

const defineCommand = ({
  id,
  category,
  label,
  binding,
  configurable = true,
  placements = ['menu', 'tooltip', 'command-palette', 'shortcut-sheet'],
}: CommandDefinition): EditorCommandMetadata => ({
  id,
  category,
  label,
  description: label,
  defaultBinding: binding,
  configurable,
  placements,
});

const definitions: CommandDefinition[] = [
  { id: 'project.create', category: 'project', label: 'Create Project' },
  {
    id: 'project.import-media',
    category: 'project',
    label: 'Import Media',
    binding: 'CommandOrControl+I',
  },
  {
    id: 'project.save',
    category: 'project',
    label: 'Save Project',
    binding: 'CommandOrControl+S',
    configurable: false,
  },
  { id: 'project.rename', category: 'project', label: 'Rename Project' },
  { id: 'project.reveal', category: 'project', label: 'Reveal Project' },
  {
    id: 'project.export',
    category: 'project',
    label: 'Export',
    binding: 'CommandOrControl+E',
  },
  { id: 'project.cancel-export', category: 'project', label: 'Cancel Export' },
  {
    id: 'project.command-palette',
    category: 'project',
    label: 'Command Palette',
    binding: 'CommandOrControl+Shift+P',
  },
  {
    id: 'project.shortcut-sheet',
    category: 'project',
    label: 'Shortcut Sheet',
    binding: 'CommandOrControl+/',
  },
  {
    id: 'edit.undo',
    category: 'edit',
    label: 'Undo',
    binding: 'CommandOrControl+Z',
    configurable: false,
  },
  {
    id: 'edit.redo',
    category: 'edit',
    label: 'Redo',
    binding: 'CommandOrControl+Shift+Z',
    configurable: false,
  },
  {
    id: 'edit.select-all-clips',
    category: 'edit',
    label: 'Select All Clips',
    binding: 'CommandOrControl+A',
  },
  {
    id: 'edit.clear-selection',
    category: 'edit',
    label: 'Clear Selection',
    binding: 'Escape',
  },
  {
    id: 'edit.duplicate',
    category: 'edit',
    label: 'Duplicate',
    binding: 'CommandOrControl+D',
  },
  {
    id: 'edit.delete-selection',
    category: 'edit',
    label: 'Delete Selection',
    binding: 'Backspace',
  },
  {
    id: 'edit.split-at-playhead',
    category: 'edit',
    label: 'Split at Playhead',
    binding: 'CommandOrControl+B',
  },
  {
    id: 'edit.toggle-snapping',
    category: 'edit',
    label: 'Toggle Snapping',
    binding: 'N',
  },
  {
    id: 'edit.toggle-ripple',
    category: 'edit',
    label: 'Toggle Ripple',
    binding: 'R',
  },
  {
    id: 'tool.selection',
    category: 'tools-effects',
    label: 'Selection Tool',
    binding: 'V',
  },
  {
    id: 'tool.blade',
    category: 'tools-effects',
    label: 'Blade Tool',
    binding: 'B',
  },
  {
    id: 'tool.transform-crop',
    category: 'tools-effects',
    label: 'Transform and Crop',
    binding: 'C',
  },
  {
    id: 'effect.add-zoom',
    category: 'tools-effects',
    label: 'Add Zoom',
    binding: 'Z',
  },
  {
    id: 'effect.add-annotation',
    category: 'tools-effects',
    label: 'Add Annotation',
    binding: 'D',
  },
  { id: 'effect.add-caption', category: 'tools-effects', label: 'Add Caption' },
  {
    id: 'annotation.select',
    category: 'tools-effects',
    label: 'Annotation Select',
    binding: 'A',
  },
  {
    id: 'annotation.pen',
    category: 'tools-effects',
    label: 'Pen',
    binding: 'P',
  },
  {
    id: 'annotation.highlight',
    category: 'tools-effects',
    label: 'Highlight',
    binding: 'H',
  },
  { id: 'annotation.rectangle', category: 'tools-effects', label: 'Rectangle' },
  {
    id: 'annotation.circle',
    category: 'tools-effects',
    label: 'Circle',
    binding: 'O',
  },
  {
    id: 'annotation.line',
    category: 'tools-effects',
    label: 'Line',
    binding: 'L',
  },
  { id: 'annotation.arrow', category: 'tools-effects', label: 'Arrow' },
  {
    id: 'annotation.text',
    category: 'tools-effects',
    label: 'Text',
    binding: 'T',
  },
  { id: 'annotation.number', category: 'tools-effects', label: 'Number' },
  {
    id: 'annotation.redact',
    category: 'tools-effects',
    label: 'Redact',
    binding: 'X',
  },
  {
    id: 'playback.toggle',
    category: 'playback',
    label: 'Play or Pause',
    binding: 'Space',
  },
  {
    id: 'playback.previous-frame',
    category: 'playback',
    label: 'Previous Frame',
    binding: 'ArrowLeft',
  },
  {
    id: 'playback.next-frame',
    category: 'playback',
    label: 'Next Frame',
    binding: 'ArrowRight',
  },
  {
    id: 'playback.sequence-start',
    category: 'playback',
    label: 'Sequence Start',
    binding: 'Home',
  },
  {
    id: 'playback.sequence-end',
    category: 'playback',
    label: 'Sequence End',
    binding: 'End',
  },
  {
    id: 'playback.previous-edit',
    category: 'playback',
    label: 'Previous Edit',
    binding: 'ArrowUp',
  },
  {
    id: 'playback.next-edit',
    category: 'playback',
    label: 'Next Edit',
    binding: 'ArrowDown',
  },
  {
    id: 'playback.seek-backward-short',
    category: 'playback',
    label: 'Seek Backward',
  },
  {
    id: 'playback.seek-forward-short',
    category: 'playback',
    label: 'Seek Forward',
  },
  {
    id: 'playback.seek-backward-long',
    category: 'playback',
    label: 'Seek Backward Long',
  },
  {
    id: 'playback.seek-forward-long',
    category: 'playback',
    label: 'Seek Forward Long',
  },
  {
    id: 'playback.toggle-scrub-audio',
    category: 'playback',
    label: 'Toggle Scrub Audio',
  },
  {
    id: 'timeline.zoom-in',
    category: 'timeline-tracks',
    label: 'Timeline Zoom In',
    binding: 'CommandOrControl+=',
  },
  {
    id: 'timeline.zoom-out',
    category: 'timeline-tracks',
    label: 'Timeline Zoom Out',
    binding: 'CommandOrControl+-',
  },
  {
    id: 'timeline.zoom-reset',
    category: 'timeline-tracks',
    label: 'Reset Timeline Zoom',
  },
  {
    id: 'timeline.zoom-fit',
    category: 'timeline-tracks',
    label: 'Fit Timeline',
    binding: 'F',
  },
  {
    id: 'track.add-video',
    category: 'timeline-tracks',
    label: 'Add Video Track',
  },
  {
    id: 'track.add-audio',
    category: 'timeline-tracks',
    label: 'Add Audio Track',
  },
  {
    id: 'clip.move-track-up',
    category: 'timeline-tracks',
    label: 'Move Clips Up a Track',
  },
  {
    id: 'clip.move-track-down',
    category: 'timeline-tracks',
    label: 'Move Clips Down a Track',
  },
  {
    id: 'clip.nudge-left',
    category: 'timeline-tracks',
    label: 'Nudge Clips Left',
    binding: 'Option+ArrowLeft',
  },
  {
    id: 'clip.nudge-right',
    category: 'timeline-tracks',
    label: 'Nudge Clips Right',
    binding: 'Option+ArrowRight',
  },
  {
    id: 'track.toggle-lock',
    category: 'timeline-tracks',
    label: 'Toggle Track Lock',
  },
  {
    id: 'track.toggle-output',
    category: 'timeline-tracks',
    label: 'Toggle Track Output',
  },
  {
    id: 'workspace.cycle-regions',
    category: 'workspace-focus',
    label: 'Cycle Workspace Regions',
    binding: 'F6',
  },
  {
    id: 'workspace.focus-title',
    category: 'workspace-focus',
    label: 'Focus Title Bar',
  },
  {
    id: 'workspace.focus-browser',
    category: 'workspace-focus',
    label: 'Focus Browser',
  },
  {
    id: 'workspace.focus-viewer',
    category: 'workspace-focus',
    label: 'Focus Viewer',
  },
  {
    id: 'workspace.focus-inspector',
    category: 'workspace-focus',
    label: 'Focus Inspector',
  },
  {
    id: 'workspace.focus-timeline',
    category: 'workspace-focus',
    label: 'Focus Timeline',
  },
  {
    id: 'workspace.toggle-browser',
    category: 'workspace-focus',
    label: 'Toggle Browser',
  },
  {
    id: 'workspace.toggle-inspector',
    category: 'workspace-focus',
    label: 'Toggle Inspector',
  },
  {
    id: 'workspace.toggle-timeline',
    category: 'workspace-focus',
    label: 'Toggle Timeline',
  },
  {
    id: 'workspace.reset',
    category: 'workspace-focus',
    label: 'Reset Workspace',
  },
];

export const EDITOR_COMMAND_CATALOG: readonly EditorCommandMetadata[] =
  definitions.map(defineCommand);

export const EDITOR_COMMAND_BY_ID = new Map(
  EDITOR_COMMAND_CATALOG.map(command => [command.id, command])
);
