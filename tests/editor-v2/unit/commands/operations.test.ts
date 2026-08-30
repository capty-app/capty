import { describe, expect, it } from 'vitest';

import { executeEditorCommand } from '@/editor-v2/commands/execute';
import {
  createAddClipCommand,
  createAddClipEffectCommand,
  createAddTransitionCommand,
  createRemoveClipCommand,
  createRemoveTransitionCommand,
  createUpdateClipCommand,
} from '@/editor-v2/commands/operations';
import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import type { EditorProjectV2, ImageClip } from '@/types/editor-v2';

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-08-30T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.image = {
    id: 'image',
    kind: 'image',
    name: 'Image',
    locator: { kind: 'managed', relativePath: 'media/image/image.png' },
    importedAt: '2026-08-30T00:00:00.000Z',
    width: 100,
    height: 100,
    orientation: 1,
    defaultStillDurationTicks: 100,
  };
  return project;
};

const createClip = (
  id: string,
  timelineStart: number,
  timelineDuration = 100
): ImageClip => ({
  id,
  kind: 'image',
  trackId: 'video',
  assetId: 'image',
  name: id,
  timelineStart,
  timelineDuration,
  sourceStart: 0,
  sourceDuration: timelineDuration,
  playbackRate: { numerator: 1, denominator: 1 },
  effects: [],
});

describe('Editor V2 basic document operations', () => {
  it('adds, sorts, updates, and removes clips through validated commands', () => {
    let project = createProject();
    project = executeEditorCommand(
      project,
      createAddClipCommand(createClip('later', 100))
    ).document;
    project = executeEditorCommand(
      project,
      createAddClipCommand(createClip('first', 0))
    ).document;
    expect(project.sequence.tracks.video.clipIds).toEqual(['first', 'later']);

    project = executeEditorCommand(
      project,
      createUpdateClipCommand('later', { name: 'Updated' })
    ).document;
    expect(project.sequence.clips.later.name).toBe('Updated');
    project = executeEditorCommand(
      project,
      createRemoveClipCommand('first')
    ).document;
    expect(project.sequence.clips.first).toBeUndefined();
  });

  it('rejects overlap, identity changes, and edits on locked tracks', () => {
    let project = executeEditorCommand(
      createProject(),
      createAddClipCommand(createClip('first', 0))
    ).document;
    expect(() =>
      executeEditorCommand(
        project,
        createAddClipCommand(createClip('overlap', 50))
      )
    ).toThrow('overlaps');
    expect(() =>
      executeEditorCommand(
        project,
        createUpdateClipCommand('first', { kind: 'audio' } as never)
      )
    ).toThrow('identity cannot be changed');

    project = structuredClone(project);
    project.sequence.tracks.video.locked = true;
    expect(() =>
      executeEditorCommand(
        project,
        createAddClipEffectCommand('first', {
          id: 'transform',
          kind: 'transform',
          enabled: true,
          value: {
            positionX: 0,
            positionY: 0,
            scaleX: 1,
            scaleY: 1,
            rotationDegrees: 0,
            anchorX: 0.5,
            anchorY: 0.5,
            cropTop: 0,
            cropRight: 0,
            cropBottom: 0,
            cropLeft: 0,
          },
        })
      )
    ).toThrow('locked');
  });

  it('validates transition track state and keeps removal undoable', () => {
    let project = executeEditorCommand(
      createProject(),
      createAddClipCommand(createClip('first', 0))
    ).document;
    const transition = {
      id: 'fade',
      type: 'video-fade-black' as const,
      trackId: 'video',
      clipId: 'first',
      edge: 'in' as const,
      durationTicks: 20,
    };
    const added = executeEditorCommand(
      project,
      createAddTransitionCommand(transition)
    );
    expect(added.document.sequence.transitions.fade).toEqual(transition);
    const removed = executeEditorCommand(
      added.document,
      createRemoveTransitionCommand('fade')
    );
    expect(removed.document.sequence.transitions.fade).toBeUndefined();
    expect(
      executeEditorCommand(removed.document, removed.inverse).document.sequence
        .transitions.fade
    ).toEqual(transition);

    project = structuredClone(added.document);
    project.sequence.tracks.video.locked = true;
    expect(() =>
      executeEditorCommand(project, createRemoveTransitionCommand('fade'))
    ).toThrow('locked');
  });
});
