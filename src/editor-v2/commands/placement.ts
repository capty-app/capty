import { EditorCommandError, type EditorCommand } from './command';
import { createAddClipCommand } from './operations';
import { createRippleShiftCommand } from './ripple';
import type {
  EditorClip,
  EditorProjectV2,
  MediaAsset,
  MediaSourceRole,
} from '@/types/editor-v2';

export interface PlaceAssetInput {
  assetId: string;
  trackId: string;
  timelineStart: number;
  clipId: string;
  sourceStreamId?: string;
  sourceRole?: MediaSourceRole;
  ripple?: boolean;
}

const getAssetDuration = (asset: MediaAsset): number =>
  asset.kind === 'image'
    ? asset.defaultStillDurationTicks
    : asset.durationTicks;

const createClip = (
  project: EditorProjectV2,
  input: PlaceAssetInput
): EditorClip => {
  const asset = project.assets[input.assetId];
  const track = project.sequence.tracks[input.trackId];
  if (!asset)
    throw new EditorCommandError(`Asset ${input.assetId} does not exist`);
  if (!track)
    throw new EditorCommandError(`Track ${input.trackId} does not exist`);
  if (!Number.isSafeInteger(input.timelineStart) || input.timelineStart < 0) {
    throw new EditorCommandError('Clip placement time is invalid');
  }
  const duration = getAssetDuration(asset);
  const base = {
    id: input.clipId,
    trackId: track.id,
    assetId: asset.id,
    name: asset.name,
    timelineStart: input.timelineStart,
    timelineDuration: duration,
    sourceStart: 0,
    sourceDuration: duration,
    playbackRate: { numerator: 1, denominator: 1 },
    effects: [],
  };
  if (track.kind === 'video') {
    if (asset.kind === 'audio') {
      throw new EditorCommandError('Audio media requires an audio track');
    }
    if (asset.kind === 'image') return { ...base, kind: 'image' };
    return {
      ...base,
      kind: 'video',
      sourceStreamId: input.sourceStreamId ?? asset.videoStreams[0]?.id,
      sourceRole: input.sourceRole ?? 'primary',
    };
  }
  if (asset.kind === 'image') {
    throw new EditorCommandError('Image media requires a video track');
  }
  const audioStreams = asset.audioStreams;
  if (audioStreams.length === 0) {
    throw new EditorCommandError('This media has no audio stream');
  }
  return {
    ...base,
    kind: 'audio',
    sourceStreamId: input.sourceStreamId ?? audioStreams[0]?.id,
    sourceRole: input.sourceRole,
    gain: 1,
    fadeInTicks: 0,
    fadeOutTicks: 0,
  };
};

export const createPlaceAssetCommand = (
  input: PlaceAssetInput
): EditorCommand => ({
  id: 'clip.place',
  label: input.ripple ? 'Ripple place media' : 'Place media',
  apply(document) {
    const clip = createClip(document, input);
    const hasRippleTargets = Object.values(document.sequence.clips).some(
      current =>
        current.timelineStart >= input.timelineStart &&
        !document.sequence.tracks[current.trackId].locked
    );
    const base =
      input.ripple && hasRippleTargets
        ? createRippleShiftCommand({
            boundaryTick: input.timelineStart,
            deltaTicks: clip.timelineDuration,
          }).apply(document).document
        : document;
    const added = createAddClipCommand(clip).apply(base);
    return {
      ...added,
      inverse: {
        id: 'clip.place.restore',
        label: 'Undo place media',
        apply() {
          return {
            document: structuredClone(document),
            affectedIds: [clip.id, clip.trackId],
            inverse: createPlaceAssetCommand(input),
          };
        },
      },
    };
  },
});
