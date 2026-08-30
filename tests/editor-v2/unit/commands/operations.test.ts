import { describe, expect, it } from 'vitest';

import { executeEditorCommand } from '@/editor-v2/commands/execute';
import {
  createAddAssetCommand,
  createAddClipCommand,
  createAddClipEffectCommand,
  createAddTransitionCommand,
  createRemoveAssetCommand,
  createRemoveClipCommand,
  createRemoveTransitionCommand,
  createUpdateAssetCommand,
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

  it('adds and removes linked media with undoable locator updates', () => {
    const asset = {
      id: 'linked',
      kind: 'image' as const,
      name: 'Linked',
      locator: {
        kind: 'linked' as const,
        absolutePath: '/Media/linked.png',
        fingerprint: { byteLength: 10, sha256: 'first' },
      },
      importedAt: '2026-08-30T00:00:00.000Z',
      width: 100,
      height: 100,
      orientation: 1,
      defaultStillDurationTicks: 100,
    };
    const added = executeEditorCommand(
      createProject(),
      createAddAssetCommand(asset)
    );
    const detached = executeEditorCommand(added.document, added.inverse);
    expect(detached.document.assets.linked).toBeUndefined();
    expect(
      executeEditorCommand(detached.document, detached.inverse).document.assets
        .linked
    ).toEqual(asset);

    const relinkedLocator = {
      kind: 'linked' as const,
      absolutePath: '/Media/relinked.png',
      fingerprint: { byteLength: 20, sha256: 'second' },
    };
    const relinked = executeEditorCommand(
      added.document,
      createUpdateAssetCommand(asset.id, {
        ...asset,
        locator: relinkedLocator,
      })
    );
    expect(relinked.document.assets.linked.locator).toEqual(relinkedLocator);
    expect(
      executeEditorCommand(relinked.document, relinked.inverse).document.assets
        .linked.locator
    ).toEqual(asset.locator);
    const removed = executeEditorCommand(
      added.document,
      createRemoveAssetCommand(asset.id)
    );
    expect(removed.document.assets.linked).toBeUndefined();
    expect(
      executeEditorCommand(removed.document, removed.inverse).document.assets
        .linked
    ).toEqual(asset);
  });

  it('rejects direct or referenced managed removal', () => {
    const project = createProject();
    expect(() =>
      executeEditorCommand(project, createRemoveAssetCommand('image'))
    ).toThrow('permanent removal');

    project.assets.legacy = {
      id: 'legacy',
      kind: 'image',
      name: 'Legacy',
      locator: {
        kind: 'legacy-package-read-only',
        relativePath: 'wallpaper.png',
        fingerprint: { byteLength: 10, sha256: 'legacy' },
      },
      importedAt: '2026-08-30T00:00:00.000Z',
      width: 100,
      height: 100,
      orientation: 1,
      defaultStillDurationTicks: 100,
    };
    project.sequence.effects.push({
      id: 'wallpaper',
      kind: 'wallpaper',
      enabled: true,
      background: { kind: 'image', assetId: 'legacy' },
      padding: 0,
      corners: 0,
      shadow: 0,
    });
    expect(() =>
      executeEditorCommand(project, createRemoveAssetCommand('legacy'))
    ).toThrow('still in use');
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
