import { getStreamDuration } from '../timeline/media-source';
import { scaleTicks } from '../time/timebase';
import { EditorCommandError, type EditorCommand } from './command';
import { validateEditorTransition } from './transitions';
import type {
  AudioTrack,
  EditorClip,
  EditorProjectV2,
  VideoTrack,
} from '@/types/editor-v2';

const restoreDocumentCommand = (
  before: EditorProjectV2,
  after: EditorProjectV2,
  affectedIds: string[],
  label: string
): EditorCommand => ({
  id: 'timeline.restore',
  label,
  apply() {
    return {
      document: structuredClone(before),
      affectedIds,
      inverse: restoreDocumentCommand(after, before, affectedIds, label),
    };
  },
});

const expandLinkedClipIds = (
  document: EditorProjectV2,
  clipIds: readonly string[]
): Set<string> => {
  const expanded = new Set(clipIds);
  const groupIds = new Set(
    clipIds
      .map(clipId => document.sequence.clips[clipId]?.linkedGroupId)
      .filter((groupId): groupId is string => Boolean(groupId))
  );
  for (const clip of Object.values(document.sequence.clips)) {
    if (clip.linkedGroupId && groupIds.has(clip.linkedGroupId)) {
      expanded.add(clip.id);
    }
  }
  return expanded;
};

const removeParticipantTransitions = (
  document: EditorProjectV2,
  clipIds: ReadonlySet<string>
): void => {
  for (const [transitionId, transition] of Object.entries(
    document.sequence.transitions
  )) {
    const participates =
      transition.type === 'video-fade-black'
        ? clipIds.has(transition.clipId)
        : clipIds.has(transition.fromClipId) ||
          clipIds.has(transition.toClipId);
    if (participates) delete document.sequence.transitions[transitionId];
  }
};

const transitionRange = (
  document: EditorProjectV2,
  transitionId: string
): { start: number; end: number } | null => {
  const transition = document.sequence.transitions[transitionId];
  if (!transition) return null;
  if (transition.type === 'video-fade-black') {
    const clip = document.sequence.clips[transition.clipId];
    if (!clip) return null;
    const clipEnd = clip.timelineStart + clip.timelineDuration;
    return transition.edge === 'in'
      ? {
          start: clip.timelineStart,
          end: clip.timelineStart + transition.durationTicks,
        }
      : { start: clipEnd - transition.durationTicks, end: clipEnd };
  }
  const left = Math.floor(transition.durationTicks / 2);
  return {
    start: transition.cutTick - left,
    end: transition.cutTick + transition.durationTicks - left,
  };
};

const assertRippleBoundaryAllowed = (
  document: EditorProjectV2,
  boundaryTick: number
): void => {
  for (const transitionId of Object.keys(document.sequence.transitions)) {
    const range = transitionRange(document, transitionId);
    if (range && boundaryTick > range.start && boundaryTick < range.end) {
      throw new EditorCommandError(
        'Remove the transition before rippling inside it'
      );
    }
  }
};

const sourceTicksToTimelineTicks = (
  sourceTicks: number,
  clip: EditorClip,
  rounding: 'floor' | 'ceil' | 'nearest'
): number =>
  scaleTicks(
    sourceTicks,
    {
      numerator: clip.playbackRate.denominator,
      denominator: clip.playbackRate.numerator,
    },
    rounding
  );

const getClipSourceDuration = (
  document: EditorProjectV2,
  clip: EditorClip
): number | null => {
  const asset = document.assets[clip.assetId];
  if (!asset || asset.kind === 'image') return null;
  return getStreamDuration(
    asset,
    'sourceStreamId' in clip ? clip.sourceStreamId : undefined,
    'sourceRole' in clip ? clip.sourceRole : undefined,
    clip.kind === 'audio' ? 'audio' : 'video'
  );
};

export const createMoveClipsToAdjacentTrackCommand = (
  clipIds: readonly string[],
  direction: -1 | 1
): EditorCommand => ({
  id: direction === -1 ? 'clip.move-track-up' : 'clip.move-track-down',
  label: direction === -1 ? 'Move clips up a track' : 'Move clips down a track',
  apply(document) {
    const expanded = expandLinkedClipIds(document, clipIds);
    if (expanded.size === 0)
      throw new EditorCommandError('No clips are selected');
    const next = structuredClone(document);
    for (const clipId of expanded) {
      const clip = next.sequence.clips[clipId];
      if (!clip) throw new EditorCommandError(`Clip ${clipId} does not exist`);
      const source = next.sequence.tracks[clip.trackId];
      if (source.locked)
        throw new EditorCommandError(`Track ${source.id} is locked`);
      const order =
        source.kind === 'video'
          ? next.sequence.videoTrackIds
          : next.sequence.audioTrackIds;
      const targetId = order[order.indexOf(source.id) + direction];
      const target = next.sequence.tracks[targetId];
      if (!target || target.locked) {
        throw new EditorCommandError(
          'A compatible adjacent track is unavailable'
        );
      }
      source.clipIds = source.clipIds.filter(id => id !== clip.id);
      target.clipIds.push(clip.id);
      clip.trackId = target.id;
    }
    removeParticipantTransitions(next, expanded);
    for (const track of Object.values(next.sequence.tracks)) {
      track.clipIds.sort(
        (left, right) =>
          next.sequence.clips[left].timelineStart -
          next.sequence.clips[right].timelineStart
      );
    }
    const affectedIds = [...expanded];
    return {
      document: next,
      affectedIds,
      inverse: restoreDocumentCommand(
        document,
        next,
        affectedIds,
        'Undo move clips between tracks'
      ),
    };
  },
});

export const createMoveClipsCommand = (
  clipIds: readonly string[],
  deltaTicks: number
): EditorCommand => ({
  id: 'clip.move',
  label: 'Move clips',
  apply(document) {
    if (!Number.isSafeInteger(deltaTicks) || deltaTicks === 0) {
      throw new EditorCommandError('Clip move delta is invalid');
    }
    const expanded = expandLinkedClipIds(document, clipIds);
    if (expanded.size === 0)
      throw new EditorCommandError('No clips are selected');
    const next = structuredClone(document);
    for (const clipId of expanded) {
      const clip = next.sequence.clips[clipId];
      if (!clip) throw new EditorCommandError(`Clip ${clipId} does not exist`);
      const track = next.sequence.tracks[clip.trackId];
      if (track.locked)
        throw new EditorCommandError(`Track ${track.id} is locked`);
      const start = clip.timelineStart + deltaTicks;
      if (start < 0)
        throw new EditorCommandError('Clip cannot move before zero');
      clip.timelineStart = start;
    }
    removeParticipantTransitions(next, expanded);
    for (const track of Object.values(next.sequence.tracks)) {
      track.clipIds.sort(
        (left, right) =>
          next.sequence.clips[left].timelineStart -
          next.sequence.clips[right].timelineStart
      );
    }
    const affectedIds = [...expanded];
    return {
      document: next,
      affectedIds,
      inverse: restoreDocumentCommand(
        document,
        next,
        affectedIds,
        'Undo move clips'
      ),
    };
  },
});

export const createSplitClipsCommand = (
  clipIds: readonly string[],
  splitTick: number,
  createId: (clip: EditorClip) => string
): EditorCommand => ({
  id: 'clip.split',
  label: 'Split clips',
  apply(document) {
    const expanded = expandLinkedClipIds(document, clipIds);
    const crossing = [...expanded]
      .map(clipId => document.sequence.clips[clipId])
      .filter(
        (clip): clip is EditorClip =>
          Boolean(clip) &&
          splitTick > clip.timelineStart &&
          splitTick < clip.timelineStart + clip.timelineDuration
      );
    if (crossing.length === 0) {
      throw new EditorCommandError('No selected clip crosses the split point');
    }
    const crossingIds = new Set(crossing.map(clip => clip.id));
    for (const transitionId of Object.keys(document.sequence.transitions)) {
      const range = transitionRange(document, transitionId);
      const transition = document.sequence.transitions[transitionId];
      const participates =
        transition.type === 'video-fade-black'
          ? crossingIds.has(transition.clipId)
          : crossingIds.has(transition.fromClipId) ||
            crossingIds.has(transition.toClipId);
      if (
        participates &&
        range &&
        splitTick > range.start &&
        splitTick < range.end
      ) {
        throw new EditorCommandError(
          'Remove the transition before splitting inside it'
        );
      }
    }
    const next = structuredClone(document);
    const affectedIds: string[] = [];
    const rightIds = new Map<string, string>();
    for (const original of crossing) {
      const track = next.sequence.tracks[original.trackId];
      if (track.locked)
        throw new EditorCommandError(`Track ${track.id} is locked`);
      const leftDuration = splitTick - original.timelineStart;
      const sourceOffset = scaleTicks(
        leftDuration,
        original.playbackRate,
        'nearest'
      );
      const rightId = createId(original);
      if (!rightId || next.sequence.clips[rightId]) {
        throw new EditorCommandError('Split clip ID is invalid');
      }
      const left = next.sequence.clips[original.id];
      left.timelineDuration = leftDuration;
      left.sourceDuration = sourceOffset;
      const right: EditorClip = {
        ...structuredClone(original),
        id: rightId,
        name: `${original.name} 2`,
        timelineStart: splitTick,
        timelineDuration: original.timelineDuration - leftDuration,
        sourceStart: original.sourceStart + sourceOffset,
        sourceDuration: original.sourceDuration - sourceOffset,
      };
      next.sequence.clips[rightId] = right;
      track.clipIds.push(rightId);
      rightIds.set(original.id, rightId);
      affectedIds.push(original.id, rightId);
    }
    for (const transition of Object.values(next.sequence.transitions)) {
      if (transition.type === 'video-fade-black') {
        const rightId = rightIds.get(transition.clipId);
        if (rightId && transition.edge === 'out') transition.clipId = rightId;
        continue;
      }
      const rightId = rightIds.get(transition.fromClipId);
      if (rightId) transition.fromClipId = rightId;
    }
    for (const track of Object.values(next.sequence.tracks)) {
      track.clipIds.sort(
        (left, right) =>
          next.sequence.clips[left].timelineStart -
          next.sequence.clips[right].timelineStart
      );
    }
    return {
      document: next,
      affectedIds,
      inverse: restoreDocumentCommand(
        document,
        next,
        affectedIds,
        'Undo split clips'
      ),
    };
  },
});

export type TrackUpdate =
  | Partial<Pick<VideoTrack, 'name' | 'locked' | 'visible'>>
  | Partial<Pick<AudioTrack, 'name' | 'locked' | 'muted' | 'solo' | 'gain'>>;

export const createUpdateTrackCommand = (
  trackId: string,
  update: TrackUpdate
): EditorCommand => ({
  id: 'track.update',
  label: 'Update track',
  apply(document) {
    const track = document.sequence.tracks[trackId];
    if (!track) throw new EditorCommandError(`Track ${trackId} does not exist`);
    const next = structuredClone(document);
    const nextTrack = { ...next.sequence.tracks[trackId], ...update };
    if (nextTrack.id !== track.id || nextTrack.kind !== track.kind) {
      throw new EditorCommandError('Track identity cannot be changed');
    }
    next.sequence.tracks[trackId] = nextTrack as typeof track;
    return {
      document: next,
      affectedIds: [trackId],
      inverse: restoreDocumentCommand(
        document,
        next,
        [trackId],
        'Undo update track'
      ),
    };
  },
});

export const createReorderTrackCommand = (
  trackId: string,
  targetIndex: number
): EditorCommand => ({
  id: 'track.reorder',
  label: 'Reorder track',
  apply(document) {
    const track = document.sequence.tracks[trackId];
    if (!track) throw new EditorCommandError(`Track ${trackId} does not exist`);
    if (track.locked)
      throw new EditorCommandError(`Track ${trackId} is locked`);
    const order =
      track.kind === 'video'
        ? document.sequence.videoTrackIds
        : document.sequence.audioTrackIds;
    const currentIndex = order.indexOf(trackId);
    if (targetIndex < 0 || targetIndex >= order.length || currentIndex < 0) {
      throw new EditorCommandError('Track reorder target is invalid');
    }
    const next = structuredClone(document);
    const nextOrder =
      track.kind === 'video'
        ? next.sequence.videoTrackIds
        : next.sequence.audioTrackIds;
    nextOrder.splice(currentIndex, 1);
    nextOrder.splice(targetIndex, 0, trackId);
    nextOrder.forEach((id, index) => {
      const candidate = next.sequence.tracks[id];
      if (candidate.kind === 'video') candidate.compositingOrder = index;
      if (candidate.kind === 'audio') candidate.mixOrder = index;
    });
    return {
      document: next,
      affectedIds: [trackId],
      inverse: restoreDocumentCommand(
        document,
        next,
        [trackId],
        'Undo reorder track'
      ),
    };
  },
});

export const createDeleteTrackCommand = (trackId: string): EditorCommand => ({
  id: 'track.delete',
  label: 'Delete track',
  apply(document) {
    const track = document.sequence.tracks[trackId];
    if (!track) throw new EditorCommandError(`Track ${trackId} does not exist`);
    if (track.locked)
      throw new EditorCommandError(`Track ${trackId} is locked`);
    const removedClipIds = expandLinkedClipIds(document, track.clipIds);
    for (const clipId of removedClipIds) {
      const clip = document.sequence.clips[clipId];
      const clipTrack = document.sequence.tracks[clip.trackId];
      if (clipTrack.locked) {
        throw new EditorCommandError('A linked sibling track is locked');
      }
    }
    const next = structuredClone(document);
    removeParticipantTransitions(next, removedClipIds);
    for (const clipId of removedClipIds) {
      const clip = next.sequence.clips[clipId];
      const clipTrack = next.sequence.tracks[clip.trackId];
      clipTrack.clipIds = clipTrack.clipIds.filter(id => id !== clipId);
      delete next.sequence.clips[clipId];
    }
    const order =
      track.kind === 'video'
        ? next.sequence.videoTrackIds
        : next.sequence.audioTrackIds;
    order.splice(order.indexOf(trackId), 1);
    delete next.sequence.tracks[trackId];
    order.forEach((id, index) => {
      const current = next.sequence.tracks[id];
      if (current.kind === 'video') current.compositingOrder = index;
      if (current.kind === 'audio') current.mixOrder = index;
    });
    const affectedIds = [trackId, ...removedClipIds];
    return {
      document: next,
      affectedIds,
      inverse: restoreDocumentCommand(
        document,
        next,
        affectedIds,
        'Undo delete track'
      ),
    };
  },
});

export interface DeleteClipsInput {
  clipIds: readonly string[];
  ripple: boolean;
}

export const createDeleteClipsCommand = ({
  clipIds,
  ripple,
}: DeleteClipsInput): EditorCommand => ({
  id: 'clip.delete',
  label: ripple ? 'Ripple delete clips' : 'Delete clips',
  apply(document) {
    const expanded = expandLinkedClipIds(document, clipIds);
    const clips = [...expanded].map(clipId => document.sequence.clips[clipId]);
    if (clips.length === 0 || clips.some(clip => !clip)) {
      throw new EditorCommandError('No valid clips are selected');
    }
    for (const clip of clips) {
      const track = document.sequence.tracks[clip.trackId];
      if (track.locked)
        throw new EditorCommandError(`Track ${track.id} is locked`);
    }
    const rangeStart = Math.min(...clips.map(clip => clip.timelineStart));
    const rangeEnd = Math.max(
      ...clips.map(clip => clip.timelineStart + clip.timelineDuration)
    );
    if (ripple) assertRippleBoundaryAllowed(document, rangeEnd);
    const next = structuredClone(document);
    removeParticipantTransitions(next, expanded);
    for (const clip of clips) {
      const track = next.sequence.tracks[clip.trackId];
      track.clipIds = track.clipIds.filter(id => id !== clip.id);
      delete next.sequence.clips[clip.id];
    }
    if (ripple) {
      const deltaTicks = rangeStart - rangeEnd;
      const moving = new Set(
        Object.values(next.sequence.clips)
          .filter(clip => {
            const track = next.sequence.tracks[clip.trackId];
            return !track.locked && clip.timelineStart >= rangeEnd;
          })
          .map(clip => clip.id)
      );
      for (const clipId of [...moving]) {
        const clip = next.sequence.clips[clipId];
        if (!clip.linkedGroupId) continue;
        const siblings = Object.values(next.sequence.clips).filter(
          sibling => sibling.linkedGroupId === clip.linkedGroupId
        );
        if (
          siblings.some(sibling => next.sequence.tracks[sibling.trackId].locked)
        ) {
          throw new EditorCommandError('A linked sibling track is locked');
        }
        for (const sibling of siblings) moving.add(sibling.id);
      }
      for (const clipId of moving) {
        const clip = next.sequence.clips[clipId];
        if (clip.timelineStart + deltaTicks < 0) {
          throw new EditorCommandError(
            'Ripple delete would move media before zero'
          );
        }
        clip.timelineStart += deltaTicks;
      }
      for (const [transitionId, transition] of Object.entries(
        next.sequence.transitions
      )) {
        if (transition.type === 'video-fade-black') continue;
        const fromMoved = moving.has(transition.fromClipId);
        const toMoved = moving.has(transition.toClipId);
        if (fromMoved && toMoved) {
          transition.cutTick += deltaTicks;
          continue;
        }
        if (fromMoved || toMoved)
          delete next.sequence.transitions[transitionId];
      }
    }
    for (const track of Object.values(next.sequence.tracks)) {
      track.clipIds.sort(
        (left, right) =>
          next.sequence.clips[left].timelineStart -
          next.sequence.clips[right].timelineStart
      );
    }
    const affectedIds = [...expanded];
    return {
      document: next,
      affectedIds,
      inverse: restoreDocumentCommand(
        document,
        next,
        affectedIds,
        'Undo delete clips'
      ),
    };
  },
});

export const createTrimClipsCommand = (
  clipIds: readonly string[],
  edge: 'start' | 'end',
  deltaTicks: number,
  ripple = false
): EditorCommand => ({
  id: 'clip.trim',
  label: 'Trim clips',
  apply(document) {
    if (!Number.isSafeInteger(deltaTicks) || deltaTicks === 0) {
      throw new EditorCommandError('Trim delta is invalid');
    }
    const expanded = expandLinkedClipIds(document, clipIds);
    if (expanded.size === 0) {
      throw new EditorCommandError('No clips are selected');
    }
    const originals = [...expanded].map(
      clipId => document.sequence.clips[clipId]
    );
    if (originals.some(clip => !clip)) {
      throw new EditorCommandError('A selected clip does not exist');
    }
    const originalEnd = Math.max(
      ...originals.map(clip => clip.timelineStart + clip.timelineDuration)
    );
    if (ripple) assertRippleBoundaryAllowed(document, originalEnd);
    const trimRanges = new Map<string, { start: number; end: number }>();
    for (const clipId of clipIds) {
      const clip = document.sequence.clips[clipId];
      if (!clip) throw new EditorCommandError(`Clip ${clipId} does not exist`);
      const key = clip.linkedGroupId ?? clip.id;
      if (trimRanges.has(key)) continue;
      trimRanges.set(key, {
        start:
          edge === 'start'
            ? clip.timelineStart + deltaTicks
            : clip.timelineStart,
        end:
          edge === 'end'
            ? clip.timelineStart + clip.timelineDuration + deltaTicks
            : clip.timelineStart + clip.timelineDuration,
      });
    }
    const next = structuredClone(document);
    const removedIds = new Set<string>();
    for (const clipId of expanded) {
      const original = document.sequence.clips[clipId];
      if (!original)
        throw new EditorCommandError(`Clip ${clipId} does not exist`);
      const track = next.sequence.tracks[original.trackId];
      if (track.locked)
        throw new EditorCommandError(`Track ${track.id} is locked`);
      const key = original.linkedGroupId ?? original.id;
      const trimRange = trimRanges.get(key);
      if (!trimRange)
        throw new EditorCommandError('Linked trim range is missing');
      const availableDuration = getClipSourceDuration(document, original);
      const availableStart =
        original.kind === 'image' || availableDuration === null
          ? trimRange.start
          : original.timelineStart -
            sourceTicksToTimelineTicks(original.sourceStart, original, 'floor');
      const availableEnd =
        original.kind === 'image' || availableDuration === null
          ? trimRange.end
          : original.timelineStart +
            sourceTicksToTimelineTicks(
              availableDuration - original.sourceStart,
              original,
              'ceil'
            );
      const nextStart = Math.max(trimRange.start, availableStart);
      const nextEnd = Math.min(trimRange.end, availableEnd);
      if (nextEnd <= nextStart) {
        removedIds.add(clipId);
        continue;
      }
      const clip = next.sequence.clips[clipId];
      const sourceDelta = scaleTicks(
        nextStart - original.timelineStart,
        original.playbackRate,
        'nearest'
      );
      clip.timelineStart = nextStart;
      clip.timelineDuration = nextEnd - nextStart;
      clip.sourceStart = original.sourceStart + sourceDelta;
      clip.sourceDuration = scaleTicks(
        clip.timelineDuration,
        original.playbackRate,
        'nearest'
      );
      if (
        clip.timelineStart < 0 ||
        clip.timelineDuration <= 0 ||
        clip.sourceStart < 0 ||
        clip.sourceDuration <= 0 ||
        (availableDuration !== null &&
          clip.sourceStart + clip.sourceDuration > availableDuration)
      ) {
        throw new EditorCommandError('Trim exceeds available clip media');
      }
    }
    for (const clipId of removedIds) {
      const clip = next.sequence.clips[clipId];
      const track = next.sequence.tracks[clip.trackId];
      track.clipIds = track.clipIds.filter(id => id !== clipId);
      delete next.sequence.clips[clipId];
    }
    removeParticipantTransitions(next, removedIds);
    const participantTransitionIds = Object.values(next.sequence.transitions)
      .filter(transition =>
        transition.type === 'video-fade-black'
          ? expanded.has(transition.clipId)
          : expanded.has(transition.fromClipId) ||
            expanded.has(transition.toClipId)
      )
      .map(transition => transition.id);
    const rippleMoved = new Set<string>();
    if (ripple) {
      const rippleDelta = edge === 'start' ? -deltaTicks : deltaTicks;
      if (edge === 'start') {
        for (const clipId of expanded) {
          const clip = next.sequence.clips[clipId];
          if (clip) clip.timelineStart -= deltaTicks;
        }
      }
      for (const clip of Object.values(next.sequence.clips)) {
        const track = next.sequence.tracks[clip.trackId];
        if (
          !expanded.has(clip.id) &&
          !track.locked &&
          clip.timelineStart >= originalEnd
        ) {
          rippleMoved.add(clip.id);
        }
      }
      for (const clipId of [...rippleMoved]) {
        const clip = next.sequence.clips[clipId];
        if (!clip.linkedGroupId) continue;
        const siblings = Object.values(next.sequence.clips).filter(
          sibling => sibling.linkedGroupId === clip.linkedGroupId
        );
        if (
          siblings.some(sibling => next.sequence.tracks[sibling.trackId].locked)
        ) {
          throw new EditorCommandError('A linked sibling track is locked');
        }
        for (const sibling of siblings) rippleMoved.add(sibling.id);
      }
      for (const clipId of rippleMoved) {
        const clip = next.sequence.clips[clipId];
        if (clip.timelineStart + rippleDelta < 0) {
          throw new EditorCommandError(
            'Ripple trim would move media before zero'
          );
        }
        clip.timelineStart += rippleDelta;
      }
      for (const [transitionId, transition] of Object.entries(
        next.sequence.transitions
      )) {
        if (transition.type === 'video-fade-black') continue;
        const fromMoved = rippleMoved.has(transition.fromClipId);
        const toMoved = rippleMoved.has(transition.toClipId);
        if (fromMoved && toMoved) {
          transition.cutTick += rippleDelta;
          continue;
        }
        if (
          (fromMoved || toMoved) &&
          !participantTransitionIds.includes(transitionId)
        ) {
          delete next.sequence.transitions[transitionId];
        }
      }
      for (const track of Object.values(next.sequence.tracks)) {
        track.clipIds.sort(
          (left, right) =>
            next.sequence.clips[left].timelineStart -
            next.sequence.clips[right].timelineStart
        );
      }
    }
    for (const transitionId of participantTransitionIds) {
      const transition = next.sequence.transitions[transitionId];
      if (transition.type !== 'video-fade-black') {
        const from = next.sequence.clips[transition.fromClipId];
        transition.cutTick = from.timelineStart + from.timelineDuration;
      }
      validateEditorTransition(next, transition, transition.id);
    }
    const affectedIds = [
      ...expanded,
      ...rippleMoved,
      ...participantTransitionIds,
    ];
    return {
      document: next,
      affectedIds,
      inverse: restoreDocumentCommand(
        document,
        next,
        affectedIds,
        'Undo trim clips'
      ),
    };
  },
});
