import { containsTick } from '../time/range';
import { scaleTicks } from '../time/timebase';
import { cloneImmutable, freezeImmutable } from './immutable';
import { isClipSourceAvailable, mapClipSourceTick } from './media-source';
import type {
  ClipFrameLayerPlan,
  EvaluatedProject,
  EvaluatedTransform,
  PreRollFrameLayerPlan,
  VisualLayerPlan,
} from './types';
import type {
  EditorClip,
  EditorTransition,
  TimelineTick,
  VideoTrack,
} from '@/types/editor-v2';

const DEFAULT_TRANSFORM: EvaluatedTransform = {
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
};

interface OrderedVideoTrack {
  track: VideoTrack;
  order: number;
  sequenceIndex: number;
}

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const isCrossDissolve = (
  transition: EditorTransition
): transition is Extract<EditorTransition, { type: 'video-cross-dissolve' }> =>
  transition.type === 'video-cross-dissolve';

const isFadeBlack = (
  transition: EditorTransition
): transition is Extract<EditorTransition, { type: 'video-fade-black' }> =>
  transition.type === 'video-fade-black';

const getVisualTracks = (project: EvaluatedProject): OrderedVideoTrack[] =>
  project.sequence.videoTrackIds
    .map((trackId, sequenceIndex) => ({
      track: project.sequence.tracks[trackId],
      sequenceIndex,
    }))
    .filter(
      (entry): entry is { track: VideoTrack; sequenceIndex: number } =>
        entry.track?.kind === 'video' && entry.track.visible
    )
    .map(entry => ({
      ...entry,
      order: entry.track.compositingOrder,
    }))
    .sort(
      (left, right) =>
        left.order - right.order || left.sequenceIndex - right.sequenceIndex
    );

const evaluateTransform = (clip: EditorClip): EvaluatedTransform => {
  const effect = [...clip.effects]
    .reverse()
    .find(candidate => candidate.kind === 'transform' && candidate.enabled);
  return effect?.kind === 'transform'
    ? cloneImmutable(effect.value)
    : cloneImmutable(DEFAULT_TRANSFORM);
};

const evaluateOpacity = (clip: EditorClip): number =>
  clampUnit(
    clip.effects.reduce(
      (opacity, effect) =>
        effect.kind === 'opacity' && effect.enabled
          ? opacity * effect.opacity
          : opacity,
      1
    )
  );

const createClipLayer = (
  project: EvaluatedProject,
  clip: EditorClip,
  trackId: string,
  trackOrder: number,
  contentTick: TimelineTick,
  transition?: ClipFrameLayerPlan['transition'],
  transitionSourceTick?: TimelineTick
): ClipFrameLayerPlan | null => {
  const asset = project.assets[clip.assetId];
  if (!asset || clip.kind === 'audio') return null;
  const sourceTick =
    asset.kind === 'image'
      ? clip.sourceStart
      : (transitionSourceTick ?? mapClipSourceTick(clip, contentTick));
  if (!isClipSourceAvailable(asset, clip, sourceTick, Boolean(transition))) {
    return null;
  }
  const transitionOpacity = transition
    ? transition.role === 'outgoing'
      ? 1 - transition.progress
      : transition.progress
    : 1;

  const layer: ClipFrameLayerPlan = {
    kind: 'media',
    origin: 'clip',
    layerId: transition
      ? `${clip.id}:${transition.transitionId}:${transition.role}`
      : clip.id,
    clipId: clip.id,
    trackId,
    trackOrder,
    assetId: asset.id,
    assetKind: asset.kind,
    sourceStreamId: 'sourceStreamId' in clip ? clip.sourceStreamId : undefined,
    sourceRole: 'sourceRole' in clip ? clip.sourceRole : undefined,
    sourceTick,
    transform: evaluateTransform(clip),
    opacity: clampUnit(evaluateOpacity(clip) * transitionOpacity),
    effects: cloneImmutable(clip.effects),
    transition,
  };
  return freezeImmutable(layer);
};

const getTransitionRange = (
  transition: Extract<EditorTransition, { type: 'video-cross-dissolve' }>
) => {
  const left = Math.floor(transition.durationTicks / 2);
  return {
    start: transition.cutTick - left,
    end: transition.cutTick + transition.durationTicks - left,
  };
};

const mapTransitionSourceTick = (
  clip: EditorClip,
  contentTick: TimelineTick,
  cutTick: TimelineTick,
  role: 'outgoing' | 'incoming'
): TimelineTick => {
  const anchor =
    role === 'outgoing'
      ? clip.sourceStart + clip.sourceDuration
      : clip.sourceStart;
  const offset = contentTick - cutTick;
  if (offset === 0) return anchor;
  return (
    anchor +
    scaleTicks(offset, clip.playbackRate, offset < 0 ? 'floor' : 'ceil')
  );
};

const evaluateCrossDissolve = (
  project: EvaluatedProject,
  track: OrderedVideoTrack,
  contentTick: TimelineTick
): ClipFrameLayerPlan[] | null => {
  const transitions = Object.values(project.sequence.transitions)
    .filter(isCrossDissolve)
    .filter(transition => transition.trackId === track.track.id)
    .sort(
      (left, right) =>
        left.cutTick - right.cutTick || left.id.localeCompare(right.id)
    );

  for (const transition of transitions) {
    const range = getTransitionRange(transition);
    if (!containsTick(range, contentTick)) continue;
    const progress = (contentTick - range.start) / transition.durationTicks;
    const outgoing = project.sequence.clips[transition.fromClipId];
    const incoming = project.sequence.clips[transition.toClipId];
    if (!outgoing || !incoming) return [];
    const outgoingLayer = createClipLayer(
      project,
      outgoing,
      track.track.id,
      track.order,
      contentTick,
      {
        type: 'cross-dissolve',
        transitionId: transition.id,
        role: 'outgoing',
        progress,
      },
      mapTransitionSourceTick(
        outgoing,
        contentTick,
        transition.cutTick,
        'outgoing'
      )
    );
    const incomingLayer = createClipLayer(
      project,
      incoming,
      track.track.id,
      track.order,
      contentTick,
      {
        type: 'cross-dissolve',
        transitionId: transition.id,
        role: 'incoming',
        progress,
      },
      mapTransitionSourceTick(
        incoming,
        contentTick,
        transition.cutTick,
        'incoming'
      )
    );
    return [outgoingLayer, incomingLayer].filter(
      (layer): layer is ClipFrameLayerPlan => layer !== null
    );
  }
  return null;
};

const evaluateFadeBlack = (
  project: EvaluatedProject,
  track: OrderedVideoTrack,
  contentTick: TimelineTick
): VisualLayerPlan[] => {
  const layers: VisualLayerPlan[] = [];
  const transitions = Object.values(project.sequence.transitions)
    .filter(isFadeBlack)
    .filter(transition => transition.trackId === track.track.id)
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const transition of transitions) {
    const clip = project.sequence.clips[transition.clipId];
    if (!clip) continue;
    const clipEnd = clip.timelineStart + clip.timelineDuration;
    const range =
      transition.edge === 'in'
        ? {
            start: clip.timelineStart,
            end: clip.timelineStart + transition.durationTicks,
          }
        : { start: clipEnd - transition.durationTicks, end: clipEnd };
    if (!containsTick(range, contentTick)) continue;
    const progress = (contentTick - range.start) / transition.durationTicks;
    const opacity = transition.edge === 'in' ? 1 - progress : progress;
    const layer: VisualLayerPlan = {
      kind: 'black',
      layerId: `black:${transition.id}`,
      trackId: track.track.id,
      trackOrder: track.order,
      opacity: clampUnit(opacity),
      transition: {
        type: 'fade-black',
        transitionId: transition.id,
        opacity: clampUnit(opacity),
      },
    };
    layers.push(freezeImmutable(layer));
  }
  return layers;
};

const createPreRollLayer = (
  project: EvaluatedProject
): PreRollFrameLayerPlan[] => {
  const preRoll = project.sequence.preRoll;
  if (!preRoll) return [];
  const asset = project.assets[preRoll.assetId];
  if (!asset || asset.kind !== 'image') return [];
  const layer: PreRollFrameLayerPlan = {
    kind: 'media',
    origin: 'pre-roll',
    layerId: `pre-roll:${asset.id}`,
    preRollAssetId: asset.id,
    trackId: 'pre-roll',
    trackOrder: -1,
    assetId: asset.id,
    assetKind: asset.kind,
    sourceTick: 0,
    fit: preRoll.fit,
    transform: cloneImmutable(DEFAULT_TRANSFORM),
    opacity: 1,
    effects: [],
  };
  return [freezeImmutable(layer)];
};

export const evaluateFramePlan = (
  project: EvaluatedProject,
  contentTick: TimelineTick | null
): readonly VisualLayerPlan[] => {
  if (contentTick === null) return freezeImmutable(createPreRollLayer(project));
  if (contentTick < 0) return freezeImmutable([]);

  const layers: VisualLayerPlan[] = [];
  for (const track of getVisualTracks(project)) {
    const transitionLayers = evaluateCrossDissolve(project, track, contentTick);
    if (transitionLayers) {
      layers.push(...transitionLayers);
    } else {
      const clip = track.track.clipIds
        .map(clipId => project.sequence.clips[clipId])
        .find(
          candidate =>
            candidate &&
            containsTick(
              {
                start: candidate.timelineStart,
                end: candidate.timelineStart + candidate.timelineDuration,
              },
              contentTick
            )
        );
      if (clip) {
        const layer = createClipLayer(
          project,
          clip,
          track.track.id,
          track.order,
          contentTick
        );
        if (layer) layers.push(layer);
      }
    }
    layers.push(...evaluateFadeBlack(project, track, contentTick));
  }
  return freezeImmutable(layers);
};
