export type EditorCommandCategory =
  | 'project'
  | 'edit'
  | 'tools-effects'
  | 'playback'
  | 'timeline-tracks'
  | 'workspace-focus';

export type CommandPlacement =
  'menu' | 'tooltip' | 'shortcut-sheet' | 'command-palette';

export interface EditorCommandMetadata {
  id: string;
  category: EditorCommandCategory;
  label: string;
  description: string;
  defaultBinding?: string;
  configurable: boolean;
  placements: CommandPlacement[];
}

export interface EditorCommandResultMetadata {
  label: string;
  affectedIds: string[];
}

export interface SerializedCommandBinding {
  commandId: string;
  chord: string | null;
}
