import { describe, expect, it } from 'vitest';

import { createCompoundCommand } from '@/editor-v2/commands/compound-command';
import { EditorCommandHistory } from '@/editor-v2/commands/history';
import {
  createAddTrackCommand,
  createRemoveTrackCommand,
} from '@/editor-v2/commands/operations';
import { reconcileEditorSelection } from '@/editor-v2/commands/selection-reconciliation';
import { EditorCommandTransaction } from '@/editor-v2/commands/transaction';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import type { EditorCommand } from '@/editor-v2/commands/command';
import type { EditorProjectV2, VideoTrack } from '@/types/editor-v2';

const createProject = () =>
  createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video-1',
    audioTrackId: 'audio-1',
  });

const createRenameCommand = (name: string): EditorCommand => ({
  id: 'project.rename',
  label: `Rename to ${name}`,
  apply(document) {
    const previousName = document.name;
    return {
      document: { ...document, name },
      affectedIds: [document.id],
      inverse: createRenameCommand(previousName),
    };
  },
});

const createVideoTrack = (id: string): VideoTrack => ({
  id,
  kind: 'video',
  name: id,
  clipIds: [],
  locked: false,
  visible: true,
  compositingOrder: 1,
});

const namesThroughHistory = (
  history: EditorCommandHistory,
  project: EditorProjectV2
): string[] => {
  const names = [project.name];
  let document = project;
  while (history.canUndo) {
    document = history.undo(document)!.document;
    names.push(document.name);
  }
  while (history.canRedo) {
    document = history.redo(document)!.document;
    names.push(document.name);
  }
  return names;
};

describe('Editor V2 command engine', () => {
  it('supports repeated inverse undo and redo without losing stack order', () => {
    const history = new EditorCommandHistory();
    let document = createProject();
    document = history.execute(document, createRenameCommand('One')).document;
    document = history.execute(document, createRenameCommand('Two')).document;
    document = history.execute(document, createRenameCommand('Three')).document;

    expect(namesThroughHistory(history, document)).toEqual([
      'Three',
      'Two',
      'One',
      'Project',
      'One',
      'Two',
      'Three',
    ]);
  });

  it('commits compound commands atomically as one history entry', () => {
    const history = new EditorCommandHistory();
    const command = createCompoundCommand('tracks.add', 'Add tracks', [
      createAddTrackCommand(createVideoTrack('video-2')),
      createAddTrackCommand(createVideoTrack('video-3')),
    ]);
    const added = history.execute(createProject(), command).document;

    expect(added.sequence.videoTrackIds).toEqual([
      'video-1',
      'video-2',
      'video-3',
    ]);
    const undone = history.undo(added)!.document;
    expect(undone.sequence.videoTrackIds).toEqual(['video-1']);
    expect(history.canUndo).toBe(false);
  });

  it('validates every transaction preview and groups commit into one command', () => {
    const project = createProject();
    const transaction = new EditorCommandTransaction(project);
    expect(
      transaction.preview(createAddTrackCommand(createVideoTrack('video-2')))
        .sequence.videoTrackIds
    ).toEqual(['video-1', 'video-2']);
    expect(
      transaction.preview(createAddTrackCommand(createVideoTrack('video-3')))
        .sequence.videoTrackIds
    ).toEqual(['video-1', 'video-2', 'video-3']);

    const history = new EditorCommandHistory();
    const committed = history.execute(
      project,
      transaction.commit('gesture', 'Track gesture')!
    ).document;
    expect(committed.sequence.videoTrackIds).toEqual([
      'video-1',
      'video-2',
      'video-3',
    ]);
    expect(history.undo(committed)!.document.sequence.videoTrackIds).toEqual([
      'video-1',
    ]);
    expect(transaction.cancel()).toBe(project);
  });

  it('does not commit a compound command when a later operation is invalid', () => {
    const project = createProject();
    const command = createCompoundCommand('invalid', 'Invalid', [
      createAddTrackCommand(createVideoTrack('video-2')),
      createRemoveTrackCommand('missing'),
    ]);
    const history = new EditorCommandHistory();

    expect(() => history.execute(project, command)).toThrow(
      'Track missing does not exist'
    );
    expect(project.sequence.videoTrackIds).toEqual(['video-1']);
    expect(history.canUndo).toBe(false);
  });

  it('reconciles removed and partially valid selections', () => {
    const project = createProject();
    project.sequence.clips.first = {
      id: 'first',
      kind: 'image',
      trackId: 'video-1',
      assetId: 'image',
      name: 'First',
      timelineStart: 0,
      timelineDuration: 10,
      sourceStart: 0,
      sourceDuration: 10,
      playbackRate: { numerator: 1, denominator: 1 },
      effects: [],
    };

    expect(
      reconcileEditorSelection(project, {
        kind: 'clips',
        clipIds: ['missing', 'first'],
        primaryClipId: 'missing',
      })
    ).toEqual({ kind: 'clips', clipIds: ['first'], primaryClipId: 'first' });
    expect(
      reconcileEditorSelection(project, {
        kind: 'transition',
        transitionId: 'missing',
      })
    ).toEqual({ kind: 'none' });
  });
});
