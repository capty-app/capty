import type { EditorCommandCategory } from '@/types/editor-v2';

export const COMMAND_CATEGORY_LABELS: Record<EditorCommandCategory, string> = {
  project: 'Project',
  edit: 'Edit',
  'tools-effects': 'Tools and Effects',
  playback: 'Playback',
  'timeline-tracks': 'Timeline and Tracks',
  'workspace-focus': 'Workspace and Focus',
};
