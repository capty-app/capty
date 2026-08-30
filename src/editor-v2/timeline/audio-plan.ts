import { containsTick } from '../time/range';
import { decimalSecondsToTicks } from '../time/decimal';
import { scaleTicks } from '../time/timebase';
import { cloneImmutable, freezeImmutable } from './immutable';
import { getStreamDuration } from './media-source';
import { getPreRollDuration } from './pre-roll';
import type { EvaluatedProject } from './types';
import {
  type AudioClip,
  type AudioPlan,
  type AudioRegionPlan,
  type AudioTimelinePlan,
  type AudioTimelineRegionPlan,
  type AudioTrack,
  type EditableDataLocator,
  type EditorClip,
  type EditorV2DataValue,
  type KeyboardSoundPlan,
  type TimelineTick,
  type VideoTrack,
} from '@/types/editor-v2';

interface OrderedAudioTrack {
  track: AudioTrack;
  sequenceIndex: number;
}

export type KeyboardDataResolver = (
  locator: EditableDataLocator
) => Promise<EditorV2DataValue | null>;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const getAudioTracks = (project: EvaluatedProject): OrderedAudioTrack[] =>
  project.sequence.audioTrackIds
    .map((trackId, sequenceIndex) => ({
      track: project.sequence.tracks[trackId],
      sequenceIndex,
    }))
    .filter(
      (entry): entry is OrderedAudioTrack => entry.track?.kind === 'audio'
    )
    .sort(
      (left, right) =>
        left.track.mixOrder - right.track.mixOrder ||
        left.sequenceIndex - right.sequenceIndex
    );

const getClipGain = (clip: EditorClip): number =>
  clip.effects.reduce(
    (gain, effect) =>
      effect.kind === 'audio-gain' && effect.enabled
        ? gain * effect.gain
        : gain,
    clip.kind === 'audio' ? clip.gain : 1
  );

const createEnvelope = (clip: AudioClip, preRollTicks: number) => {
  const clipStart = preRollTicks + clip.timelineStart;
  const clipEnd = clipStart + clip.timelineDuration;
  return {
    ...(clip.fadeInTicks > 0
      ? {
          fadeIn: {
            start: clipStart,
            end: Math.min(clipEnd, clipStart + clip.fadeInTicks),
          },
        }
      : {}),
    ...(clip.fadeOutTicks > 0
      ? {
          fadeOut: {
            start: Math.max(clipStart, clipEnd - clip.fadeOutTicks),
            end: clipEnd,
          },
        }
      : {}),
  };
};

const createAudioClipRegion = (
  project: EvaluatedProject,
  clip: AudioClip,
  track: AudioTrack,
  preRollTicks: number,
  muted: boolean
): AudioTimelineRegionPlan | null => {
  const asset = project.assets[clip.assetId];
  if (!asset || asset.kind === 'image') return null;
  const streamDuration = getStreamDuration(
    asset,
    clip.sourceStreamId,
    clip.sourceRole,
    'audio'
  );
  if (streamDuration === null || clip.sourceStart >= streamDuration)
    return null;
  const sourceEnd = Math.min(
    streamDuration,
    clip.sourceStart + clip.sourceDuration
  );
  if (sourceEnd <= clip.sourceStart) return null;
  const availableTimelineDuration = Math.min(
    clip.timelineDuration,
    Math.floor(
      ((sourceEnd - clip.sourceStart) * clip.playbackRate.denominator) /
        clip.playbackRate.numerator
    )
  );
  if (availableTimelineDuration <= 0) return null;
  return {
    kind: 'media',
    id: clip.id,
    clipId: clip.id,
    trackId: track.id,
    assetId: clip.assetId,
    sourceStreamId: clip.sourceStreamId,
    sourceRole: clip.sourceRole,
    outputStart: preRollTicks + clip.timelineStart,
    outputEnd: preRollTicks + clip.timelineStart + availableTimelineDuration,
    sourceStart: clip.sourceStart,
    sourceEnd,
    playbackRate: cloneImmutable(clip.playbackRate),
    gain: track.gain * getClipGain(clip),
    muted,
    solo: track.solo,
    envelope: createEnvelope(clip, preRollTicks),
  };
};

const hasLinkedAudioSibling = (
  project: EvaluatedProject,
  clip: EditorClip
): boolean =>
  Object.values(project.sequence.clips).some(
    candidate =>
      candidate.kind === 'audio' &&
      candidate.assetId === clip.assetId &&
      Boolean(
        clip.linkedGroupId && candidate.linkedGroupId === clip.linkedGroupId
      )
  );

const createEmbeddedAudioRegion = (
  project: EvaluatedProject,
  clip: EditorClip,
  track: VideoTrack,
  preRollTicks: number,
  muted: boolean
): AudioTimelineRegionPlan | null => {
  if (clip.kind !== 'video' || hasLinkedAudioSibling(project, clip))
    return null;
  const asset = project.assets[clip.assetId];
  if (!asset || asset.kind === 'image' || asset.kind === 'audio') return null;
  const stream = asset.audioStreams[0];
  if (!stream || clip.sourceStart >= stream.durationTicks) return null;
  const sourceEnd = Math.min(
    stream.durationTicks,
    clip.sourceStart + clip.sourceDuration
  );
  if (sourceEnd <= clip.sourceStart) return null;
  const availableTimelineDuration = Math.min(
    clip.timelineDuration,
    Math.floor(
      ((sourceEnd - clip.sourceStart) * clip.playbackRate.denominator) /
        clip.playbackRate.numerator
    )
  );
  if (availableTimelineDuration <= 0) return null;
  return {
    kind: 'media',
    id: `${clip.id}:embedded-audio`,
    clipId: clip.id,
    trackId: track.id,
    assetId: clip.assetId,
    sourceStreamId: stream.id,
    sourceRole: 'primary',
    outputStart: preRollTicks + clip.timelineStart,
    outputEnd: preRollTicks + clip.timelineStart + availableTimelineDuration,
    sourceStart: clip.sourceStart,
    sourceEnd,
    playbackRate: cloneImmutable(clip.playbackRate),
    gain: getClipGain(clip),
    muted,
    solo: false,
    envelope: {},
  };
};

const applyCrossfades = (
  project: EvaluatedProject,
  regions: AudioTimelineRegionPlan[],
  preRollTicks: number
): void => {
  for (const transition of Object.values(project.sequence.transitions)) {
    if (transition.type !== 'audio-crossfade') continue;
    const outgoing = regions.find(
      region => region.clipId === transition.fromClipId
    );
    const incoming = regions.find(
      region => region.clipId === transition.toClipId
    );
    if (!outgoing || !incoming) continue;
    const left = Math.floor(transition.durationTicks / 2);
    const right = transition.durationTicks - left;
    const start = preRollTicks + transition.cutTick - left;
    const end = preRollTicks + transition.cutTick + right;
    const outgoingExtension = scaleTicks(right, outgoing.playbackRate, 'ceil');
    const incomingExtension = scaleTicks(left, incoming.playbackRate, 'ceil');
    outgoing.outputEnd = end;
    outgoing.sourceEnd += outgoingExtension;
    outgoing.envelope.crossfade = {
      transitionId: transition.id,
      role: 'outgoing',
      start,
      end,
    };
    incoming.outputStart = start;
    incoming.sourceStart -= incomingExtension;
    incoming.envelope.crossfade = {
      transitionId: transition.id,
      role: 'incoming',
      start,
      end,
    };
  }
};

export const buildAudioTimelinePlan = (
  project: EvaluatedProject
): AudioTimelinePlan => {
  const preRollTicks = getPreRollDuration(project);
  const tracks = getAudioTracks(project);
  const hasSoloTrack = tracks.some(({ track }) => track.solo);
  const regions: AudioTimelineRegionPlan[] = [];
  for (const { track } of tracks) {
    const muted = track.muted || (hasSoloTrack && !track.solo);
    for (const clipId of track.clipIds) {
      const clip = project.sequence.clips[clipId];
      if (!clip || clip.kind !== 'audio') continue;
      const region = createAudioClipRegion(
        project,
        clip,
        track,
        preRollTicks,
        muted
      );
      if (region) regions.push(region);
    }
  }
  for (const trackId of project.sequence.videoTrackIds) {
    const track = project.sequence.tracks[trackId];
    if (!track || track.kind !== 'video') continue;
    for (const clipId of track.clipIds) {
      const clip = project.sequence.clips[clipId];
      if (!clip) continue;
      const region = createEmbeddedAudioRegion(
        project,
        clip,
        track,
        preRollTicks,
        !track.visible || hasSoloTrack
      );
      if (region) regions.push(region);
    }
  }
  applyCrossfades(project, regions, preRollTicks);
  const durationTicks = Object.values(project.sequence.clips).reduce(
    (maximum, clip) =>
      Math.max(
        maximum,
        preRollTicks + clip.timelineStart + clip.timelineDuration
      ),
    preRollTicks
  );
  return freezeImmutable({
    durationTicks,
    regions: regions.map(region => freezeImmutable(region)),
    keyboardSounds: [],
  });
};

export const getAudioEnvelopeGain = (
  region: AudioTimelineRegionPlan,
  outputTick: number
): number => {
  let gain = 1;
  const { fadeIn, fadeOut, crossfade } = region.envelope;
  if (fadeIn && outputTick < fadeIn.end) {
    gain *= clampUnit(
      (outputTick - fadeIn.start) / Math.max(1, fadeIn.end - fadeIn.start)
    );
  }
  if (fadeOut && outputTick >= fadeOut.start) {
    gain *= clampUnit(
      (fadeOut.end - outputTick) / Math.max(1, fadeOut.end - fadeOut.start)
    );
  }
  if (crossfade) {
    const progress = clampUnit(
      (outputTick - crossfade.start) /
        Math.max(1, crossfade.end - crossfade.start)
    );
    gain *= crossfade.role === 'outgoing' ? 1 - progress : progress;
  }
  return clampUnit(gain);
};

export const evaluateAudioPlan = (
  project: EvaluatedProject,
  outputTick: TimelineTick,
  contentTick: TimelineTick | null
): AudioPlan => {
  if (contentTick === null || contentTick < 0) {
    return freezeImmutable({ tick: outputTick, regions: [] });
  }
  const timeline = buildAudioTimelinePlan(project);
  const regions: AudioRegionPlan[] = timeline.regions
    .filter(region =>
      containsTick(
        { start: region.outputStart, end: region.outputEnd },
        outputTick
      )
    )
    .map(region => {
      const sourceTick =
        region.sourceStart +
        scaleTicks(
          outputTick - region.outputStart,
          region.playbackRate,
          'floor'
        );
      const envelopeGain = getAudioEnvelopeGain(region, outputTick);
      return freezeImmutable({
        ...cloneImmutable(region),
        sourceTick,
        envelopeGain,
        gain: region.gain * envelopeGain,
      });
    });
  return freezeImmutable({ tick: outputTick, regions });
};

const keyboardRecordingOffset = (
  project: EvaluatedProject,
  clip: EditorClip
): number => {
  const asset = project.assets[clip.assetId];
  return asset?.kind === 'capty-recording'
    ? (asset.sources.keyboard?.recordingOffsetTicks ?? 0)
    : 0;
};

export const buildKeyboardSoundPlan = async (
  project: EvaluatedProject,
  resolveData: KeyboardDataResolver
): Promise<readonly KeyboardSoundPlan[]> => {
  const preRollTicks = getPreRollDuration(project);
  const sounds: KeyboardSoundPlan[] = [];
  const cache = new Map<string, Promise<EditorV2DataValue | null>>();
  for (const clip of Object.values(project.sequence.clips)) {
    const effects = clip.effects.filter(
      effect =>
        effect.kind === 'keyboard' && effect.enabled && effect.sound.enabled
    );
    for (const effect of effects) {
      if (effect.kind !== 'keyboard') continue;
      const key = JSON.stringify([
        effect.data.kind,
        effect.data.relativePath,
        effect.data.fingerprint.sha256,
      ]);
      let pending = cache.get(key);
      if (!pending) {
        pending = resolveData(effect.data);
        cache.set(key, pending);
      }
      const data = await pending;
      if (data?.kind !== 'keyboard') continue;
      const sourceOffset = keyboardRecordingOffset(project, clip);
      let downIndex = 0;
      data.value.events.forEach((event, eventIndex) => {
        if (event.type !== 'down') return;
        const sampleIndex = downIndex;
        downIndex += 1;
        const sourceTick =
          sourceOffset + decimalSecondsToTicks(event.timestamp);
        const clipSourceEnd = clip.sourceStart + clip.sourceDuration;
        if (sourceTick < clip.sourceStart || sourceTick >= clipSourceEnd)
          return;
        const timelineOffset = Math.round(
          ((sourceTick - clip.sourceStart) * clip.playbackRate.denominator) /
            clip.playbackRate.numerator
        );
        sounds.push({
          kind: 'keyboard-sound',
          id: `${clip.id}:${effect.id}:${eventIndex}`,
          clipId: clip.id,
          effectId: effect.id,
          outputTick: preRollTicks + clip.timelineStart + timelineOffset,
          volume: effect.sound.volume,
          soundType: effect.sound.type,
          sampleIndex,
          playbackRate: cloneImmutable(clip.playbackRate),
        });
      });
    }
  }
  return freezeImmutable(
    sounds.sort(
      (left, right) =>
        left.outputTick - right.outputTick || left.id.localeCompare(right.id)
    )
  );
};

export const buildCompleteAudioTimelinePlan = async (
  project: EvaluatedProject,
  resolveData: KeyboardDataResolver
): Promise<AudioTimelinePlan> => {
  const mediaPlan = buildAudioTimelinePlan(project);
  const keyboardSounds = await buildKeyboardSoundPlan(project, resolveData);
  return freezeImmutable({
    durationTicks: mediaPlan.durationTicks,
    regions: mediaPlan.regions,
    keyboardSounds,
  });
};
