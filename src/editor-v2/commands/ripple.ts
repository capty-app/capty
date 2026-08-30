import { EditorCommandError, type EditorCommand } from './command';
import type { EditorProjectV2, EditorTransition } from '@/types/editor-v2';

const transitionRange = (
  transition: EditorTransition,
  project: EditorProjectV2
) => {
  if (transition.type === 'video-fade-black') {
    const clip = project.sequence.clips[transition.clipId];
    if (!clip) return null;
    const edge =
      transition.edge === 'in'
        ? clip.timelineStart
        : clip.timelineStart + clip.timelineDuration;
    const other =
      transition.edge === 'in'
        ? edge + transition.durationTicks
        : edge - transition.durationTicks;
    return { start: Math.min(edge, other), end: Math.max(edge, other) };
  }
  const left = Math.floor(transition.durationTicks / 2);
  return {
    start: transition.cutTick - left,
    end: transition.cutTick + transition.durationTicks - left,
  };
};

const createRestoreRippleCommand = (
  before: EditorProjectV2,
  after: EditorProjectV2,
  label: string,
  affectedIds: string[]
): EditorCommand => ({
  id: 'ripple.restore',
  label,
  apply() {
    return {
      document: structuredClone(before),
      affectedIds,
      inverse: createRestoreRippleCommand(after, before, label, affectedIds),
    };
  },
});

export interface RippleShiftInput {
  boundaryTick: number;
  deltaTicks: number;
  excludedClipIds?: ReadonlySet<string>;
}

export const createRippleShiftCommand = (
  input: RippleShiftInput
): EditorCommand => ({
  id: 'ripple.shift',
  label: 'Ripple timeline',
  apply(document) {
    if (!Number.isSafeInteger(input.boundaryTick) || input.boundaryTick < 0) {
      throw new EditorCommandError('Ripple boundary is invalid');
    }
    if (!Number.isSafeInteger(input.deltaTicks) || input.deltaTicks === 0) {
      throw new EditorCommandError('Ripple shift must be a non-zero integer');
    }
    for (const transition of Object.values(document.sequence.transitions)) {
      const range = transitionRange(transition, document);
      if (
        range &&
        input.boundaryTick > range.start &&
        input.boundaryTick < range.end
      ) {
        throw new EditorCommandError(
          'Remove the transition before rippling inside it'
        );
      }
    }

    const movedIds = new Set<string>();
    for (const clip of Object.values(document.sequence.clips)) {
      if (input.excludedClipIds?.has(clip.id)) continue;
      const track = document.sequence.tracks[clip.trackId];
      if (!track.locked && clip.timelineStart >= input.boundaryTick) {
        movedIds.add(clip.id);
      }
    }
    for (const clipId of [...movedIds]) {
      const clip = document.sequence.clips[clipId];
      if (!clip.linkedGroupId) continue;
      const siblings = Object.values(document.sequence.clips).filter(
        candidate => candidate.linkedGroupId === clip.linkedGroupId
      );
      if (
        siblings.some(
          sibling => document.sequence.tracks[sibling.trackId].locked
        )
      ) {
        throw new EditorCommandError('A linked sibling track is locked');
      }
      for (const sibling of siblings) movedIds.add(sibling.id);
    }
    if (movedIds.size === 0) {
      throw new EditorCommandError('No unlocked clips are available to ripple');
    }

    const next = structuredClone(document);
    for (const clipId of movedIds) {
      const clip = next.sequence.clips[clipId];
      const nextStart = clip.timelineStart + input.deltaTicks;
      if (nextStart < 0) {
        throw new EditorCommandError(
          'Ripple shift would move a clip before zero'
        );
      }
      clip.timelineStart = nextStart;
    }
    for (const [transitionId, transition] of Object.entries(
      next.sequence.transitions
    )) {
      if (transition.type === 'video-fade-black') continue;
      const fromMoved = movedIds.has(transition.fromClipId);
      const toMoved = movedIds.has(transition.toClipId);
      if (fromMoved && toMoved) {
        transition.cutTick += input.deltaTicks;
        continue;
      }
      if (fromMoved || toMoved) delete next.sequence.transitions[transitionId];
    }
    for (const track of Object.values(next.sequence.tracks)) {
      track.clipIds.sort(
        (left, right) =>
          next.sequence.clips[left].timelineStart -
          next.sequence.clips[right].timelineStart
      );
    }
    const affectedIds = [...movedIds];
    return {
      document: next,
      affectedIds,
      inverse: createRestoreRippleCommand(
        document,
        next,
        'Undo ripple timeline',
        affectedIds
      ),
    };
  },
});
