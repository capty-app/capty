import React from 'react';

import TimelineEditor from '../timeline/timeline-editor';
import type { RuntimeEditorCommand } from '../commands/command-registry';
import type { EditorV2LoadPayload, EditorV2Workspace } from '@/types/editor-v2';

interface TimelineDockProps {
  projectToken: string;
  workspace: EditorV2Workspace;
  commandBindings: EditorV2LoadPayload['commandBindings'];
  playheadTick: number;
  onPlayheadChange: (tick: number) => void;
  onWorkspaceChange: (
    update: (workspace: EditorV2Workspace) => EditorV2Workspace
  ) => void;
  onWorkspaceCommit: () => void;
  onCollapse: () => void;
  onCommandRegistryChange: (
    commands: readonly RuntimeEditorCommand[] | null
  ) => void;
}

export default function TimelineDock(props: TimelineDockProps) {
  return <TimelineEditor {...props} />;
}
