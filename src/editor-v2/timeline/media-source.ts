import { scaleTicks } from '../time/timebase';
import type {
  EditorClip,
  MediaAsset,
  MediaSourceRole,
  TimelineTick,
} from '@/types/editor-v2';

const getPrimaryStreamDuration = (
  asset: Exclude<MediaAsset, { kind: 'image' }>,
  sourceStreamId: string | undefined,
  kind: 'video' | 'audio'
): TimelineTick | null => {
  const streams =
    kind === 'video'
      ? asset.kind === 'audio'
        ? []
        : asset.videoStreams
      : asset.audioStreams;
  const stream = sourceStreamId
    ? streams.find(candidate => candidate.id === sourceStreamId)
    : streams[0];
  return stream?.durationTicks ?? null;
};

export const getStreamDuration = (
  asset: MediaAsset,
  sourceStreamId: string | undefined,
  sourceRole: MediaSourceRole | undefined,
  kind: 'video' | 'audio'
): TimelineTick | null => {
  if (asset.kind === 'image') return null;
  if (sourceRole === 'primary') {
    return getPrimaryStreamDuration(asset, sourceStreamId, kind);
  }
  if (asset.kind !== 'capty-recording') {
    return sourceRole
      ? null
      : getPrimaryStreamDuration(asset, sourceStreamId, kind);
  }

  const candidates: TimelineTick[] = [];
  if (!sourceRole) {
    const duration = getPrimaryStreamDuration(asset, sourceStreamId, kind);
    if (duration !== null) candidates.push(duration);
  }
  if (kind === 'video' && (!sourceRole || sourceRole === 'camera-video')) {
    const stream = sourceStreamId
      ? asset.sources.cameraVideo?.streams.find(
          candidate => candidate.id === sourceStreamId
        )
      : asset.sources.cameraVideo?.streams[0];
    if (stream) candidates.push(stream.durationTicks);
  }
  const audioSources = [
    ['system-audio', asset.sources.systemAudio],
    ['microphone-audio', asset.sources.microphoneAudio],
  ] as const;
  if (kind === 'audio') {
    for (const [role, source] of audioSources) {
      if (sourceRole && sourceRole !== role) continue;
      const stream = sourceStreamId
        ? source?.streams.find(candidate => candidate.id === sourceStreamId)
        : source?.streams[0];
      if (stream) candidates.push(stream.durationTicks);
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
};

export const mapClipSourceTick = (
  clip: EditorClip,
  contentTick: TimelineTick
): TimelineTick =>
  clip.sourceStart +
  scaleTicks(contentTick - clip.timelineStart, clip.playbackRate, 'floor');

export const isClipSourceAvailable = (
  asset: MediaAsset,
  clip: EditorClip,
  sourceTick: TimelineTick,
  virtualTransition = false
): boolean => {
  if (asset.kind === 'image') return true;
  if (!virtualTransition) {
    const clipSourceEnd = clip.sourceStart + clip.sourceDuration;
    if (sourceTick < clip.sourceStart || sourceTick >= clipSourceEnd)
      return false;
  }
  const streamDuration = getStreamDuration(
    asset,
    'sourceStreamId' in clip ? clip.sourceStreamId : undefined,
    'sourceRole' in clip ? clip.sourceRole : undefined,
    clip.kind === 'audio' ? 'audio' : 'video'
  );
  if (streamDuration === null) return false;
  return sourceTick >= 0 && sourceTick < streamDuration;
};
