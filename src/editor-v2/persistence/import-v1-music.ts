import type {
  AudioClip,
  AudioMediaAsset,
  AudioTrack,
  EditorClip,
  EditorTrack,
  MediaAsset,
} from '@/types/editor-v2';

import {
  decimalDifferenceToTicks,
  decimalSecondsToTicks,
  decimalToPositiveRational,
  divideTicksByRate,
} from '../time/decimal';
import type {
  ImportV1ProjectDiagnostic,
  ImportV1ProjectInput,
} from './import-v1-types';

export interface ImportedMusicStructure {
  assets: Record<string, MediaAsset>;
  tracks: Record<string, EditorTrack>;
  clips: Record<string, EditorClip>;
  audioTrackIds: string[];
  diagnostics: ImportV1ProjectDiagnostic[];
}

export const importMusic = (
  input: ImportV1ProjectInput,
  startingMixOrder: number
): ImportedMusicStructure => {
  const assets: Record<string, MediaAsset> = {};
  const tracks: Record<string, EditorTrack> = {};
  const clips: Record<string, EditorClip> = {};
  const audioTrackIds: string[] = [];
  const diagnostics: ImportV1ProjectDiagnostic[] = [];
  let musicIndex = 0;

  input.normalizedState.musicTracks.forEach(track => {
    if (track.source !== 'music') return;

    const source = input.sources.music.find(
      candidate => candidate.fileName === track.fileName
    );
    if (!source) {
      diagnostics.push({
        code: 'missing-music-source',
        path: `musicTracks.${track.id}`,
      });
      return;
    }

    const assetId = input.createId('asset', `music-${track.id}`);
    const durationTicks = decimalSecondsToTicks(source.durationSeconds);
    const asset: AudioMediaAsset = {
      id: assetId,
      kind: 'audio',
      name: track.name,
      locator: {
        kind: 'legacy-package-read-only',
        relativePath: source.relativePath,
        fingerprint: source.fingerprint,
      },
      importedAt: input.importedAt,
      durationTicks,
      channels: source.channels,
      sampleRate: source.sampleRate,
      audioStreams: source.streams,
    };
    assets[assetId] = asset;

    const trackId = input.createId('track', `music-${track.id}`);
    const audioTrack: AudioTrack = {
      id: trackId,
      kind: 'audio',
      name: track.name,
      clipIds: [],
      locked: false,
      muted: !track.enabled,
      solo: false,
      gain: track.volume,
      mixOrder: startingMixOrder + musicIndex,
    };
    tracks[trackId] = audioTrack;
    audioTrackIds.push(trackId);

    const clipId = input.createId('clip', `music-${track.id}`);
    const rate = decimalToPositiveRational(track.speed);
    const sourceStart = decimalSecondsToTicks(track.trimStart);
    const requestedSourceDuration = decimalDifferenceToTicks(
      track.endTime,
      track.startTime,
      track.speed
    );
    const sourceDuration = Math.min(
      requestedSourceDuration,
      durationTicks - sourceStart
    );
    if (sourceDuration <= 0) return;
    const timelineDuration = divideTicksByRate(sourceDuration, rate);
    if (timelineDuration <= 0) return;

    const clip: AudioClip = {
      id: clipId,
      kind: 'audio',
      trackId,
      assetId,
      name: track.name,
      timelineStart: decimalSecondsToTicks(track.startTime),
      timelineDuration,
      sourceStart,
      sourceDuration,
      playbackRate: rate,
      sourceStreamId: source.streams[0]?.id,
      gain: 1,
      fadeInTicks: 0,
      fadeOutTicks: 0,
      effects: [],
    };
    clips[clipId] = clip;
    audioTrack.clipIds.push(clipId);
    musicIndex += 1;
  });

  return { assets, tracks, clips, audioTrackIds, diagnostics };
};
