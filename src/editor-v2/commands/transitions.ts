import { getStreamDuration } from '../timeline/media-source';
import { scaleTicks } from '../time/timebase';
import { EditorCommandError, type EditorCommand } from './command';
import {
  createAddTransitionCommand,
  createRemoveTransitionCommand,
} from './operations';
import type {
  EditorClip,
  EditorProjectV2,
  EditorTransition,
} from '@/types/editor-v2';

const getAvailableDuration = (
  project: EditorProjectV2,
  clip: EditorClip
): number | null => {
  const asset = project.assets[clip.assetId];
  if (!asset || asset.kind === 'image') return null;
  return getStreamDuration(
    asset,
    'sourceStreamId' in clip ? clip.sourceStreamId : undefined,
    'sourceRole' in clip ? clip.sourceRole : undefined,
    clip.kind === 'audio' ? 'audio' : 'video'
  );
};

const validateLinkedParticipants = (
  project: EditorProjectV2,
  clips: readonly EditorClip[]
): void => {
  const groupIds = new Set(
    clips
      .map(clip => clip.linkedGroupId)
      .filter((groupId): groupId is string => Boolean(groupId))
  );
  if (groupIds.size === 0) return;
  const lockedSibling = Object.values(project.sequence.clips).find(
    clip =>
      clip.linkedGroupId &&
      groupIds.has(clip.linkedGroupId) &&
      project.sequence.tracks[clip.trackId].locked
  );
  if (lockedSibling) {
    throw new EditorCommandError('A linked sibling track is locked');
  }
};

const validateCenteredTransition = (
  project: EditorProjectV2,
  transition: Exclude<EditorTransition, { type: 'video-fade-black' }>,
  ignoreTransitionId?: string
): void => {
  const from = project.sequence.clips[transition.fromClipId];
  const to = project.sequence.clips[transition.toClipId];
  if (!from || !to)
    throw new EditorCommandError('Transition clips do not exist');
  const track = project.sequence.tracks[transition.trackId];
  if (!track || track.locked) {
    throw new EditorCommandError(`Track ${transition.trackId} is unavailable`);
  }
  const expectedKind =
    transition.type === 'audio-crossfade' ? 'audio' : 'video';
  const kindsMatch =
    expectedKind === 'audio'
      ? from.kind === 'audio' && to.kind === 'audio'
      : from.kind !== 'audio' && to.kind !== 'audio';
  if (!kindsMatch || from.trackId !== track.id || to.trackId !== track.id) {
    throw new EditorCommandError('Transition participants are incompatible');
  }
  validateLinkedParticipants(project, [from, to]);
  const cutTick = from.timelineStart + from.timelineDuration;
  if (to.timelineStart !== cutTick || transition.cutTick !== cutTick) {
    throw new EditorCommandError(
      'Transition clips must be adjacent at the cut'
    );
  }
  if (
    !Number.isSafeInteger(transition.durationTicks) ||
    transition.durationTicks <= 0
  ) {
    throw new EditorCommandError('Transition duration must be positive');
  }
  const left = Math.floor(transition.durationTicks / 2);
  const right = transition.durationTicks - left;
  if (left > from.timelineDuration || right > to.timelineDuration) {
    throw new EditorCommandError('Transition exceeds a participant duration');
  }
  const fromDuration = getAvailableDuration(project, from);
  const toDuration = getAvailableDuration(project, to);
  if (from.kind !== 'image' && fromDuration !== null) {
    const required = scaleTicks(right, from.playbackRate, 'ceil');
    if (from.sourceStart + from.sourceDuration + required > fromDuration) {
      throw new EditorCommandError(
        'Outgoing clip has insufficient source handle'
      );
    }
  }
  if (to.kind !== 'image' && toDuration !== null) {
    const required = scaleTicks(left, to.playbackRate, 'ceil');
    if (to.sourceStart < required) {
      throw new EditorCommandError(
        'Incoming clip has insufficient source handle'
      );
    }
  }
  const duplicate = Object.values(project.sequence.transitions).some(current =>
    current.id === ignoreTransitionId || current.type === 'video-fade-black'
      ? false
      : current.trackId === transition.trackId &&
        (current.fromClipId === transition.fromClipId ||
          current.toClipId === transition.toClipId)
  );
  if (duplicate)
    throw new EditorCommandError('A participant already has a transition');
};

const validateFadeBlack = (
  project: EditorProjectV2,
  transition: Extract<EditorTransition, { type: 'video-fade-black' }>,
  ignoreTransitionId?: string
): void => {
  const clip = project.sequence.clips[transition.clipId];
  const track = project.sequence.tracks[transition.trackId];
  if (!clip || clip.kind === 'audio' || clip.trackId !== track?.id) {
    throw new EditorCommandError('Fade participant is incompatible');
  }
  if (track.locked) throw new EditorCommandError(`Track ${track.id} is locked`);
  validateLinkedParticipants(project, [clip]);
  if (
    !Number.isSafeInteger(transition.durationTicks) ||
    transition.durationTicks <= 0 ||
    transition.durationTicks > clip.timelineDuration
  ) {
    throw new EditorCommandError('Fade duration is invalid');
  }
  const duplicate = Object.values(project.sequence.transitions).some(
    current =>
      current.id !== ignoreTransitionId &&
      current.type === 'video-fade-black' &&
      current.clipId === clip.id &&
      current.edge === transition.edge
  );
  if (duplicate)
    throw new EditorCommandError('This clip edge already has a fade');
};

export const validateEditorTransition = (
  project: EditorProjectV2,
  transition: EditorTransition,
  ignoreTransitionId?: string
): void => {
  if (transition.type === 'video-fade-black') {
    validateFadeBlack(project, transition, ignoreTransitionId);
    return;
  }
  validateCenteredTransition(project, transition, ignoreTransitionId);
};

export const createValidatedTransitionCommand = (
  transition: EditorTransition
): EditorCommand => ({
  id: 'transition.add',
  label: 'Add transition',
  apply(document) {
    validateEditorTransition(document, transition);
    return createAddTransitionCommand(transition).apply(document);
  },
});

export const createChangeTransitionDurationCommand = (
  transitionId: string,
  durationTicks: number
): EditorCommand => ({
  id: 'transition.change-duration',
  label: 'Change transition duration',
  apply(document) {
    const transition = document.sequence.transitions[transitionId];
    if (!transition) throw new EditorCommandError('Transition does not exist');
    const replacement = { ...transition, durationTicks } as EditorTransition;
    const without = createRemoveTransitionCommand(transitionId).apply(document);
    const added = createValidatedTransitionCommand(replacement).apply(
      without.document
    );
    return {
      document: added.document,
      affectedIds: [transitionId, transition.trackId],
      inverse: createChangeTransitionDurationCommand(
        transitionId,
        transition.durationTicks
      ),
    };
  },
});
