import { EditorCommandError, type EditorCommand } from './command';
import type {
  ClipEffect,
  EditorClip,
  EditorProjectV2,
  EditorTrack,
  EditorTransition,
  MediaAsset,
  OutputFrameCountPreRoll,
  SequenceEffect,
} from '@/types/editor-v2';

const cloneDocument = (document: EditorProjectV2): EditorProjectV2 =>
  structuredClone(document);

const sortTrackClips = (document: EditorProjectV2, trackId: string): void => {
  const track = document.sequence.tracks[trackId];
  if (!track) return;
  track.clipIds.sort(
    (leftId, rightId) =>
      document.sequence.clips[leftId].timelineStart -
      document.sequence.clips[rightId].timelineStart
  );
};

const assetIsReferenced = (
  document: EditorProjectV2,
  assetId: string
): boolean =>
  document.sequence.preRoll?.assetId === assetId ||
  Object.values(document.sequence.clips).some(
    clip => clip.assetId === assetId
  ) ||
  document.sequence.effects.some(
    effect =>
      effect.kind === 'wallpaper' &&
      effect.background.kind === 'image' &&
      effect.background.assetId === assetId
  );

const createDetachAssetReferenceCommand = (
  asset: MediaAsset
): EditorCommand => ({
  id: 'asset.detach',
  label: 'Detach media',
  apply(document) {
    if (!document.assets[asset.id]) {
      throw new EditorCommandError(`Asset ${asset.id} does not exist`);
    }
    if (assetIsReferenced(document, asset.id)) {
      throw new EditorCommandError(`Asset ${asset.id} is still in use`);
    }
    const next = cloneDocument(document);
    delete next.assets[asset.id];
    return {
      document: next,
      affectedIds: [asset.id],
      inverse: createAddAssetCommand(asset),
    };
  },
});

export const createAddAssetCommand = (asset: MediaAsset): EditorCommand => ({
  id: 'asset.add',
  label: 'Add media',
  apply(document) {
    if (document.assets[asset.id]) {
      throw new EditorCommandError(`Asset ${asset.id} already exists`);
    }
    const next = cloneDocument(document);
    next.assets[asset.id] = structuredClone(asset);
    return {
      document: next,
      affectedIds: [asset.id],
      inverse: createDetachAssetReferenceCommand(asset),
    };
  },
});

export const createRemoveAssetCommand = (assetId: string): EditorCommand => ({
  id: 'asset.remove',
  label: 'Remove media',
  apply(document) {
    const asset = document.assets[assetId];
    if (!asset) throw new EditorCommandError(`Asset ${assetId} does not exist`);
    if (asset.locator.kind === 'managed') {
      throw new EditorCommandError('Managed media requires permanent removal');
    }
    if (assetIsReferenced(document, assetId)) {
      throw new EditorCommandError(`Asset ${assetId} is still in use`);
    }
    const next = cloneDocument(document);
    delete next.assets[assetId];
    return {
      document: next,
      affectedIds: [assetId],
      inverse: createAddAssetCommand(asset),
    };
  },
});

export const createUpdateAssetCommand = (
  assetId: string,
  replacement: MediaAsset
): EditorCommand => ({
  id: 'asset.relink',
  label: 'Relink media',
  apply(document) {
    const asset = document.assets[assetId];
    if (!asset) throw new EditorCommandError(`Asset ${assetId} does not exist`);
    if (replacement.id !== assetId || replacement.kind !== asset.kind) {
      throw new EditorCommandError('Asset identity cannot be changed');
    }
    const next = cloneDocument(document);
    next.assets[assetId] = structuredClone(replacement);
    return {
      document: next,
      affectedIds: [assetId],
      inverse: createUpdateAssetCommand(assetId, asset),
    };
  },
});

export const createAddTrackCommand = (
  track: EditorTrack,
  index?: number
): EditorCommand => ({
  id: 'track.add',
  label: `Add ${track.kind} track`,
  apply(document) {
    if (document.sequence.tracks[track.id]) {
      throw new EditorCommandError(`Track ${track.id} already exists`);
    }
    const next = cloneDocument(document);
    next.sequence.tracks[track.id] = structuredClone(track);
    const order =
      track.kind === 'video'
        ? next.sequence.videoTrackIds
        : next.sequence.audioTrackIds;
    const targetIndex = index ?? order.length;
    if (targetIndex < 0 || targetIndex > order.length) {
      throw new EditorCommandError('Track insertion index is invalid');
    }
    order.splice(targetIndex, 0, track.id);
    order.forEach((trackId, orderIndex) => {
      const current = next.sequence.tracks[trackId];
      if (current.kind === 'video') current.compositingOrder = orderIndex;
      if (current.kind === 'audio') current.mixOrder = orderIndex;
    });
    return {
      document: next,
      affectedIds: [track.id],
      inverse: createRemoveTrackCommand(track.id),
    };
  },
});

export const createRemoveTrackCommand = (trackId: string): EditorCommand => ({
  id: 'track.remove',
  label: 'Remove track',
  apply(document) {
    const track = document.sequence.tracks[trackId];
    if (!track) throw new EditorCommandError(`Track ${trackId} does not exist`);
    if (track.locked)
      throw new EditorCommandError(`Track ${trackId} is locked`);
    if (track.clipIds.length > 0) {
      throw new EditorCommandError(`Track ${trackId} is not empty`);
    }
    const next = cloneDocument(document);
    const order =
      track.kind === 'video'
        ? next.sequence.videoTrackIds
        : next.sequence.audioTrackIds;
    const index = order.indexOf(trackId);
    order.splice(index, 1);
    delete next.sequence.tracks[trackId];
    order.forEach((currentId, orderIndex) => {
      const current = next.sequence.tracks[currentId];
      if (current.kind === 'video') current.compositingOrder = orderIndex;
      if (current.kind === 'audio') current.mixOrder = orderIndex;
    });
    return {
      document: next,
      affectedIds: [trackId],
      inverse: createAddTrackCommand(track, index),
    };
  },
});

export const createAddClipCommand = (clip: EditorClip): EditorCommand => ({
  id: 'clip.add',
  label: 'Add clip',
  apply(document) {
    const track = document.sequence.tracks[clip.trackId];
    if (!track)
      throw new EditorCommandError(`Track ${clip.trackId} does not exist`);
    if (track.locked)
      throw new EditorCommandError(`Track ${track.id} is locked`);
    if (document.sequence.clips[clip.id]) {
      throw new EditorCommandError(`Clip ${clip.id} already exists`);
    }
    const next = cloneDocument(document);
    next.sequence.clips[clip.id] = structuredClone(clip);
    next.sequence.tracks[clip.trackId].clipIds.push(clip.id);
    sortTrackClips(next, clip.trackId);
    return {
      document: next,
      affectedIds: [clip.id, clip.trackId],
      inverse: createRemoveClipCommand(clip.id),
    };
  },
});

const transitionReferencesClip = (
  transition: EditorTransition,
  clipId: string
): boolean =>
  transition.type === 'video-fade-black'
    ? transition.clipId === clipId
    : transition.fromClipId === clipId || transition.toClipId === clipId;

const createRestoreClipsCommand = (
  clips: readonly EditorClip[],
  transitions: readonly EditorTransition[]
): EditorCommand => ({
  id: 'clip.restore',
  label: 'Restore clips',
  apply(document) {
    const next = cloneDocument(document);
    for (const clip of clips) {
      if (next.sequence.clips[clip.id]) {
        throw new EditorCommandError(`Clip ${clip.id} already exists`);
      }
      const track = next.sequence.tracks[clip.trackId];
      if (!track || track.locked) {
        throw new EditorCommandError(`Track ${clip.trackId} is unavailable`);
      }
      next.sequence.clips[clip.id] = structuredClone(clip);
      track.clipIds.push(clip.id);
      sortTrackClips(next, clip.trackId);
    }
    for (const transition of transitions) {
      next.sequence.transitions[transition.id] = structuredClone(transition);
    }
    return {
      document: next,
      affectedIds: clips.flatMap(clip => [clip.id, clip.trackId]),
      inverse: createRemoveClipCommand(clips[0].id),
    };
  },
});

export const createRemoveClipCommand = (clipId: string): EditorCommand => ({
  id: 'clip.remove',
  label: 'Remove clip',
  apply(document) {
    const clip = document.sequence.clips[clipId];
    if (!clip) throw new EditorCommandError(`Clip ${clipId} does not exist`);
    const clips = clip.linkedGroupId
      ? Object.values(document.sequence.clips).filter(
          current => current.linkedGroupId === clip.linkedGroupId
        )
      : [clip];
    const clipIds = new Set(clips.map(current => current.id));
    for (const current of clips) {
      const track = document.sequence.tracks[current.trackId];
      if (track.locked) {
        throw new EditorCommandError(`Track ${track.id} is locked`);
      }
    }
    const transitions = Object.values(document.sequence.transitions).filter(
      transition =>
        [...clipIds].some(currentId =>
          transitionReferencesClip(transition, currentId)
        )
    );
    const next = cloneDocument(document);
    for (const current of clips) {
      const track = next.sequence.tracks[current.trackId];
      track.clipIds = track.clipIds.filter(id => id !== current.id);
      delete next.sequence.clips[current.id];
    }
    for (const transition of transitions) {
      delete next.sequence.transitions[transition.id];
    }
    return {
      document: next,
      affectedIds: clips.flatMap(current => [current.id, current.trackId]),
      inverse: createRestoreClipsCommand(clips, transitions),
    };
  },
});

export const createUpdateClipCommand = (
  clipId: string,
  update: Partial<EditorClip>
): EditorCommand => ({
  id: 'clip.update',
  label: 'Update clip',
  apply(document) {
    const clip = document.sequence.clips[clipId];
    if (!clip) throw new EditorCommandError(`Clip ${clipId} does not exist`);
    const track = document.sequence.tracks[clip.trackId];
    if (track.locked)
      throw new EditorCommandError(`Track ${track.id} is locked`);
    if (clip.linkedGroupId) {
      throw new EditorCommandError('Linked clips require a compound update');
    }
    const nextClip = { ...clip, ...update } as EditorClip;
    if (
      nextClip.id !== clipId ||
      nextClip.trackId !== clip.trackId ||
      nextClip.kind !== clip.kind
    ) {
      throw new EditorCommandError('Clip identity cannot be changed');
    }
    const next = cloneDocument(document);
    next.sequence.clips[clipId] = structuredClone(nextClip);
    sortTrackClips(next, clip.trackId);
    return {
      document: next,
      affectedIds: [clipId, clip.trackId],
      inverse: createUpdateClipCommand(clipId, clip),
    };
  },
});

export const createAddClipEffectCommand = (
  clipId: string,
  effect: ClipEffect
): EditorCommand => ({
  id: 'effect.add',
  label: 'Add effect',
  apply(document) {
    const clip = document.sequence.clips[clipId];
    if (!clip) throw new EditorCommandError(`Clip ${clipId} does not exist`);
    const track = document.sequence.tracks[clip.trackId];
    if (track.locked)
      throw new EditorCommandError(`Track ${track.id} is locked`);
    if (clip.effects.some(current => current.id === effect.id)) {
      throw new EditorCommandError(`Effect ${effect.id} already exists`);
    }
    const next = cloneDocument(document);
    next.sequence.clips[clipId].effects.push(structuredClone(effect));
    return {
      document: next,
      affectedIds: [clipId, effect.id],
      inverse: createRemoveClipEffectCommand(clipId, effect.id),
    };
  },
});

export const createUpdateClipEffectCommand = (
  clipId: string,
  effectId: string,
  replacement: ClipEffect
): EditorCommand => ({
  id: 'effect.update',
  label: 'Update effect',
  apply(document) {
    const clip = document.sequence.clips[clipId];
    const effect = clip?.effects.find(current => current.id === effectId);
    if (!clip || !effect) {
      throw new EditorCommandError(`Effect ${effectId} does not exist`);
    }
    const track = document.sequence.tracks[clip.trackId];
    if (track.locked) {
      throw new EditorCommandError(`Track ${track.id} is locked`);
    }
    if (replacement.id !== effectId || replacement.kind !== effect.kind) {
      throw new EditorCommandError('Effect identity cannot be changed');
    }
    const next = cloneDocument(document);
    const index = next.sequence.clips[clipId].effects.findIndex(
      current => current.id === effectId
    );
    next.sequence.clips[clipId].effects[index] = structuredClone(replacement);
    return {
      document: next,
      affectedIds: [clipId, effectId],
      inverse: createUpdateClipEffectCommand(clipId, effectId, effect),
    };
  },
});

export const createRemoveClipEffectCommand = (
  clipId: string,
  effectId: string
): EditorCommand => ({
  id: 'effect.remove',
  label: 'Remove effect',
  apply(document) {
    const clip = document.sequence.clips[clipId];
    const effect = clip?.effects.find(current => current.id === effectId);
    if (!clip || !effect) {
      throw new EditorCommandError(`Effect ${effectId} does not exist`);
    }
    const track = document.sequence.tracks[clip.trackId];
    if (track.locked)
      throw new EditorCommandError(`Track ${track.id} is locked`);
    const next = cloneDocument(document);
    next.sequence.clips[clipId].effects = clip.effects.filter(
      current => current.id !== effectId
    );
    return {
      document: next,
      affectedIds: [clipId, effectId],
      inverse: createAddClipEffectCommand(clipId, effect),
    };
  },
});

export const createUpdatePreRollCommand = (
  replacement?: OutputFrameCountPreRoll
): EditorCommand => ({
  id: 'sequence.pre-roll.update',
  label: replacement ? 'Update First Frame' : 'Remove First Frame',
  apply(document) {
    if (replacement) {
      const asset = document.assets[replacement.assetId];
      if (asset?.kind !== 'image') {
        throw new EditorCommandError(
          'First Frame must reference an image asset'
        );
      }
      if (
        !Number.isSafeInteger(replacement.frames) ||
        replacement.frames <= 0
      ) {
        throw new EditorCommandError('First Frame duration is invalid');
      }
    }
    const previous = document.sequence.preRoll;
    const next = cloneDocument(document);
    if (replacement) {
      next.sequence.preRoll = structuredClone(replacement);
    } else {
      delete next.sequence.preRoll;
    }
    return {
      document: next,
      affectedIds: [
        'sequence.pre-roll',
        ...(replacement ? [replacement.assetId] : []),
      ],
      inverse: createUpdatePreRollCommand(previous),
    };
  },
});

export const createAddSequenceEffectCommand = (
  effect: SequenceEffect
): EditorCommand => ({
  id: 'sequence-effect.add',
  label: 'Add canvas effect',
  apply(document) {
    if (document.sequence.effects.some(current => current.id === effect.id)) {
      throw new EditorCommandError(`Effect ${effect.id} already exists`);
    }
    const next = cloneDocument(document);
    next.sequence.effects.push(structuredClone(effect));
    return {
      document: next,
      affectedIds: [effect.id],
      inverse: createRemoveSequenceEffectCommand(effect.id),
    };
  },
});

export const createUpdateSequenceEffectCommand = (
  effectId: string,
  replacement: SequenceEffect
): EditorCommand => ({
  id: 'sequence-effect.update',
  label: 'Update canvas effect',
  apply(document) {
    const effect = document.sequence.effects.find(
      current => current.id === effectId
    );
    if (!effect) {
      throw new EditorCommandError(`Effect ${effectId} does not exist`);
    }
    if (replacement.id !== effectId || replacement.kind !== effect.kind) {
      throw new EditorCommandError('Effect identity cannot be changed');
    }
    const next = cloneDocument(document);
    const index = next.sequence.effects.findIndex(
      current => current.id === effectId
    );
    next.sequence.effects[index] = structuredClone(replacement);
    return {
      document: next,
      affectedIds: [effectId],
      inverse: createUpdateSequenceEffectCommand(effectId, effect),
    };
  },
});

export const createRemoveSequenceEffectCommand = (
  effectId: string
): EditorCommand => ({
  id: 'sequence-effect.remove',
  label: 'Remove canvas effect',
  apply(document) {
    const effect = document.sequence.effects.find(
      current => current.id === effectId
    );
    if (!effect)
      throw new EditorCommandError(`Effect ${effectId} does not exist`);
    const next = cloneDocument(document);
    next.sequence.effects = document.sequence.effects.filter(
      current => current.id !== effectId
    );
    return {
      document: next,
      affectedIds: [effectId],
      inverse: createAddSequenceEffectCommand(effect),
    };
  },
});

export const createAddTransitionCommand = (
  transition: EditorTransition
): EditorCommand => ({
  id: 'transition.add',
  label: 'Add transition',
  apply(document) {
    if (document.sequence.transitions[transition.id]) {
      throw new EditorCommandError(
        `Transition ${transition.id} already exists`
      );
    }
    const track = document.sequence.tracks[transition.trackId];
    if (!track) {
      throw new EditorCommandError(
        `Track ${transition.trackId} does not exist`
      );
    }
    if (track.locked)
      throw new EditorCommandError(`Track ${track.id} is locked`);
    const next = cloneDocument(document);
    next.sequence.transitions[transition.id] = structuredClone(transition);
    return {
      document: next,
      affectedIds: [transition.id, transition.trackId],
      inverse: createRemoveTransitionCommand(transition.id),
    };
  },
});

export const createRemoveTransitionCommand = (
  transitionId: string
): EditorCommand => ({
  id: 'transition.remove',
  label: 'Remove transition',
  apply(document) {
    const transition = document.sequence.transitions[transitionId];
    if (!transition) {
      throw new EditorCommandError(`Transition ${transitionId} does not exist`);
    }
    const track = document.sequence.tracks[transition.trackId];
    if (track.locked)
      throw new EditorCommandError(`Track ${track.id} is locked`);
    const next = cloneDocument(document);
    delete next.sequence.transitions[transitionId];
    return {
      document: next,
      affectedIds: [transitionId, transition.trackId],
      inverse: createAddTransitionCommand(transition),
    };
  },
});
