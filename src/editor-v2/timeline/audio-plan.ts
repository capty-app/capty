import { containsTick } from '../time/range';
import { cloneImmutable, freezeImmutable } from './immutable';
import { isClipSourceAvailable, mapClipSourceTick } from './media-source';
import type { AudioPlan, AudioRegionPlan, EvaluatedProject } from './types';
import type { AudioClip, AudioTrack, TimelineTick } from '@/types/editor-v2';

interface OrderedAudioTrack {
  track: AudioTrack;
  sequenceIndex: number;
}

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

const getClipGain = (clip: AudioClip): number =>
  clip.effects.reduce(
    (gain, effect) =>
      effect.kind === 'audio-gain' && effect.enabled
        ? gain * effect.gain
        : gain,
    clip.gain
  );

export const evaluateAudioPlan = (
  project: EvaluatedProject,
  outputTick: TimelineTick,
  contentTick: TimelineTick | null
): AudioPlan => {
  if (contentTick === null || contentTick < 0) {
    return freezeImmutable({ tick: outputTick, regions: [] });
  }

  const tracks = getAudioTracks(project);
  const hasSoloTrack = tracks.some(({ track }) => track.solo);
  const regions: AudioRegionPlan[] = [];

  for (const { track } of tracks) {
    for (const clipId of track.clipIds) {
      const clip = project.sequence.clips[clipId];
      if (!clip || clip.kind !== 'audio') continue;
      if (
        !containsTick(
          {
            start: clip.timelineStart,
            end: clip.timelineStart + clip.timelineDuration,
          },
          contentTick
        )
      ) {
        continue;
      }
      const asset = project.assets[clip.assetId];
      if (!asset) continue;
      const sourceTick = mapClipSourceTick(clip, contentTick);
      if (!isClipSourceAvailable(asset, clip, sourceTick)) continue;
      regions.push(
        freezeImmutable({
          clipId: clip.id,
          trackId: track.id,
          assetId: asset.id,
          sourceStreamId: clip.sourceStreamId,
          sourceRole: clip.sourceRole,
          sourceTick,
          playbackRate: cloneImmutable(clip.playbackRate),
          gain: track.gain * getClipGain(clip),
          muted: track.muted || (hasSoloTrack && !track.solo),
          solo: track.solo,
        })
      );
    }
  }

  return freezeImmutable({ tick: outputTick, regions });
};
