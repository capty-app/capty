import type {
  AudioClip,
  AudioTrack,
  CaptyRecordingMediaAsset,
  EditorClip,
  EditorTrack,
  MediaSourceRole,
  TimelineTick,
  VideoClip,
  VideoTrack,
} from '@/types/editor-v2';

import {
  decimalSecondsToTicks,
  decimalToPositiveRational,
  divideTicksByRate,
} from '../time/decimal';
import type {
  ImportV1ProjectInput,
  V1ImportAudioSource,
  V1ImportVideoSource,
} from './import-v1-types';

export interface ImportedClipStructure {
  tracks: Record<string, EditorTrack>;
  clips: Record<string, EditorClip>;
  videoTrackIds: string[];
  audioTrackIds: string[];
  screenClipIds: string[];
  cameraClipIds: string[];
}

interface SourceIntersection {
  sourceStart: TimelineTick;
  recordingStart: TimelineTick;
  duration: TimelineTick;
}

const intersectRecordingRange = (
  segmentStart: TimelineTick,
  segmentEnd: TimelineTick,
  sourceOffset: TimelineTick,
  sourceDuration: TimelineTick
): SourceIntersection | undefined => {
  const start = Math.max(segmentStart, sourceOffset);
  const end = Math.min(segmentEnd, sourceOffset + sourceDuration);
  if (end <= start) return undefined;
  return {
    sourceStart: start - sourceOffset,
    recordingStart: start,
    duration: end - start,
  };
};

const createVideoTrack = (
  id: string,
  name: string,
  compositingOrder: number
): VideoTrack => ({
  id,
  kind: 'video',
  name,
  clipIds: [],
  locked: false,
  visible: true,
  compositingOrder,
});

const createAudioTrack = (
  id: string,
  name: string,
  mixOrder: number
): AudioTrack => ({
  id,
  kind: 'audio',
  name,
  clipIds: [],
  locked: false,
  muted: false,
  solo: false,
  gain: 1,
  mixOrder,
});

const sourceTiming = (source: V1ImportVideoSource | V1ImportAudioSource) => ({
  offset: decimalSecondsToTicks(source.recordingOffsetSeconds ?? 0),
  duration: decimalSecondsToTicks(source.durationSeconds),
});

const getAudioStreamId = (
  source: V1ImportVideoSource | V1ImportAudioSource
): string | undefined =>
  'audioStreams' in source ? source.audioStreams[0]?.id : source.streams[0]?.id;

const addSiblingVideoClip = (
  input: ImportV1ProjectInput,
  track: VideoTrack,
  clips: Record<string, EditorClip>,
  source: V1ImportVideoSource,
  assetId: string,
  streamId: string | undefined,
  sourceRole: MediaSourceRole,
  linkedGroupId: string,
  segmentId: string,
  segmentStart: TimelineTick,
  segmentEnd: TimelineTick,
  segmentTimelineStart: TimelineTick,
  rate: VideoClip['playbackRate'],
  name: string
): string | undefined => {
  const timing = sourceTiming(source);
  const intersection = intersectRecordingRange(
    segmentStart,
    segmentEnd,
    timing.offset,
    timing.duration
  );
  if (!intersection) return undefined;

  const id = input.createId('clip', `${name}-${segmentId}`);
  const clip: VideoClip = {
    id,
    kind: 'video',
    trackId: track.id,
    assetId,
    name,
    timelineStart:
      segmentTimelineStart +
      divideTicksByRate(intersection.recordingStart - segmentStart, rate),
    timelineDuration: divideTicksByRate(intersection.duration, rate),
    sourceStart: intersection.sourceStart,
    sourceDuration: intersection.duration,
    playbackRate: rate,
    linkedGroupId,
    sourceStreamId: streamId,
    sourceRole,
    effects: [],
  };
  clips[id] = clip;
  track.clipIds.push(id);
  return id;
};

const addSiblingAudioClip = (
  input: ImportV1ProjectInput,
  track: AudioTrack,
  clips: Record<string, EditorClip>,
  source: V1ImportAudioSource | V1ImportVideoSource,
  assetId: string,
  streamId: string | undefined,
  sourceRole: MediaSourceRole,
  linkedGroupId: string,
  segmentId: string,
  segmentStart: TimelineTick,
  segmentEnd: TimelineTick,
  segmentTimelineStart: TimelineTick,
  rate: AudioClip['playbackRate'],
  gain: number,
  name: string
): string | undefined => {
  const timing = sourceTiming(source);
  const intersection = intersectRecordingRange(
    segmentStart,
    segmentEnd,
    timing.offset,
    timing.duration
  );
  if (!intersection) return undefined;

  const id = input.createId('clip', `${name}-${segmentId}`);
  const duration = divideTicksByRate(intersection.duration, rate);
  const clip: AudioClip = {
    id,
    kind: 'audio',
    trackId: track.id,
    assetId,
    name,
    timelineStart:
      segmentTimelineStart +
      divideTicksByRate(intersection.recordingStart - segmentStart, rate),
    timelineDuration: duration,
    sourceStart: intersection.sourceStart,
    sourceDuration: intersection.duration,
    playbackRate: rate,
    linkedGroupId,
    sourceStreamId: streamId,
    sourceRole,
    gain,
    fadeInTicks: 0,
    fadeOutTicks: 0,
    effects: [],
  };
  clips[id] = clip;
  track.clipIds.push(id);
  return id;
};

export const importRecordingClips = (
  input: ImportV1ProjectInput,
  recordingAsset: CaptyRecordingMediaAsset
): ImportedClipStructure => {
  const state = input.normalizedState;
  const clips: Record<string, EditorClip> = {};
  const screenTrack = createVideoTrack(
    input.createId('track', 'screen-video'),
    'Screen',
    0
  );
  const cameraTrack = input.sources.cameraVideo
    ? createVideoTrack(input.createId('track', 'camera-video'), 'Camera', 1)
    : undefined;
  const systemSource =
    input.sources.systemAudio ??
    (!input.sources.microphoneAudio && recordingAsset.audioStreams.length > 0
      ? input.sources.recording
      : undefined);
  const systemTrack = systemSource
    ? createAudioTrack(
        input.createId('track', 'system-audio'),
        'System Audio',
        0
      )
    : undefined;
  const microphoneTrack = input.sources.microphoneAudio
    ? createAudioTrack(
        input.createId('track', 'microphone-audio'),
        'Microphone',
        1
      )
    : undefined;
  const screenClipIds: string[] = [];
  const cameraClipIds: string[] = [];
  let timelineStart = 0;

  state.segments.forEach(segment => {
    const segmentStart = decimalSecondsToTicks(segment.originalStart);
    const segmentEnd = decimalSecondsToTicks(segment.originalEnd);
    const rate = decimalToPositiveRational(segment.speed ?? 1);
    const linkedGroupId = input.createId('linked-group', segment.id);
    const screenClipId = addSiblingVideoClip(
      input,
      screenTrack,
      clips,
      input.sources.recording,
      recordingAsset.id,
      recordingAsset.videoStreams[0]?.id,
      'primary',
      linkedGroupId,
      segment.id,
      segmentStart,
      segmentEnd,
      timelineStart,
      rate,
      'Screen'
    );
    if (screenClipId) screenClipIds.push(screenClipId);

    if (cameraTrack && input.sources.cameraVideo) {
      const cameraClipId = addSiblingVideoClip(
        input,
        cameraTrack,
        clips,
        input.sources.cameraVideo,
        recordingAsset.id,
        input.sources.cameraVideo.videoStreams[0]?.id,
        'camera-video',
        linkedGroupId,
        segment.id,
        segmentStart,
        segmentEnd,
        timelineStart,
        rate,
        'Camera'
      );
      if (cameraClipId) cameraClipIds.push(cameraClipId);
    }

    if (systemTrack && systemSource) {
      addSiblingAudioClip(
        input,
        systemTrack,
        clips,
        systemSource,
        recordingAsset.id,
        getAudioStreamId(systemSource),
        systemSource === input.sources.recording ? 'primary' : 'system-audio',
        linkedGroupId,
        segment.id,
        segmentStart,
        segmentEnd,
        timelineStart,
        rate,
        state.audioStyle.systemAudioEnabled
          ? state.audioStyle.systemAudioVolume
          : 0,
        'System Audio'
      );
    }

    if (microphoneTrack && input.sources.microphoneAudio) {
      addSiblingAudioClip(
        input,
        microphoneTrack,
        clips,
        input.sources.microphoneAudio,
        recordingAsset.id,
        input.sources.microphoneAudio.streams[0]?.id,
        'microphone-audio',
        linkedGroupId,
        segment.id,
        segmentStart,
        segmentEnd,
        timelineStart,
        rate,
        state.audioStyle.micAudioEnabled ? state.audioStyle.micAudioVolume : 0,
        'Microphone'
      );
    }

    timelineStart += divideTicksByRate(segmentEnd - segmentStart, rate);
  });

  const orderedTracks = [
    screenTrack,
    cameraTrack,
    systemTrack,
    microphoneTrack,
  ].filter((track): track is EditorTrack => track !== undefined);
  const tracks = Object.fromEntries(
    orderedTracks.map(track => [track.id, track])
  );

  return {
    tracks,
    clips,
    videoTrackIds: [screenTrack.id, ...(cameraTrack ? [cameraTrack.id] : [])],
    audioTrackIds: [
      ...(systemTrack ? [systemTrack.id] : []),
      ...(microphoneTrack ? [microphoneTrack.id] : []),
    ],
    screenClipIds,
    cameraClipIds,
  };
};
