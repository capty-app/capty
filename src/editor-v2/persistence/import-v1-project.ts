import {
  EDITOR_V2_SCHEMA_VERSION,
  type CaptyAudioSource,
  type CaptyRecordingMediaAsset,
  type CaptyVideoSource,
  type EditorProjectV2,
  type EditorV2Workspace,
  type MediaAsset,
} from '@/types/editor-v2';

import { createEditorTimebase } from '../time/timebase';
import { decimalSecondsToTicks } from '../time/decimal';
import { importRecordingClips } from './import-v1-clips';
import { importClipEffects, importSequenceEffects } from './import-v1-effects';
import { importMusic } from './import-v1-music';
import type {
  ImportV1ProjectDiagnostic,
  ImportV1ProjectInput,
  V1ImportAudioSource,
  V1ImportVideoSource,
} from './import-v1-types';
import { createWorkspaceFromV1 } from './workspace';

export type {
  ImportV1ProjectDiagnostic,
  ImportV1ProjectInput,
  V1ImportAudioSource,
  V1ImportDataSources,
  V1ImportMusicSource,
  V1ImportPreparedImage,
  V1ImportSources,
  V1ImportVideoSource,
} from './import-v1-types';

export interface ImportV1ProjectResult {
  project: EditorProjectV2;
  workspace: EditorV2Workspace;
  diagnostics: ImportV1ProjectDiagnostic[];
}

const legacyLocator = (source: V1ImportVideoSource | V1ImportAudioSource) => ({
  kind: 'legacy-package-read-only' as const,
  relativePath: source.relativePath,
  fingerprint: source.fingerprint,
});

const createCaptyAudioSource = (
  source: V1ImportAudioSource
): CaptyAudioSource => ({
  kind: 'audio',
  locator: legacyLocator(source),
  recordingOffsetTicks: decimalSecondsToTicks(
    source.recordingOffsetSeconds ?? 0
  ),
  durationTicks: decimalSecondsToTicks(source.durationSeconds),
  streams: source.streams,
});

const createCaptyVideoSource = (
  source: V1ImportVideoSource
): CaptyVideoSource => ({
  kind: 'video',
  locator: legacyLocator(source),
  recordingOffsetTicks: decimalSecondsToTicks(
    source.recordingOffsetSeconds ?? 0
  ),
  durationTicks: decimalSecondsToTicks(source.durationSeconds),
  streams: source.videoStreams,
});

const createRecordingAsset = (
  input: ImportV1ProjectInput
): CaptyRecordingMediaAsset => {
  const source = input.sources.recording;
  const data = input.sources.data;
  const assetId = input.createId('asset', 'capty-recording');

  return {
    id: assetId,
    kind: 'capty-recording',
    name: input.projectName,
    locator: legacyLocator(source),
    importedAt: input.importedAt,
    durationTicks: decimalSecondsToTicks(source.durationSeconds),
    width: source.width,
    height: source.height,
    frameRate: source.frameRate,
    videoStreams: source.videoStreams,
    audioStreams: source.audioStreams,
    sources: {
      systemAudio: input.sources.systemAudio
        ? createCaptyAudioSource(input.sources.systemAudio)
        : undefined,
      microphoneAudio: input.sources.microphoneAudio
        ? createCaptyAudioSource(input.sources.microphoneAudio)
        : undefined,
      cameraVideo: input.sources.cameraVideo
        ? createCaptyVideoSource(input.sources.cameraVideo)
        : undefined,
      cameraMetadata: data.cameraMetadata
        ? { locator: data.cameraMetadata, recordingOffsetTicks: 0 }
        : undefined,
      cursor: data.cursor
        ? { locator: data.cursor, recordingOffsetTicks: 0 }
        : undefined,
      keyboard: data.keyboard
        ? { locator: data.keyboard, recordingOffsetTicks: 0 }
        : undefined,
      subtitles: data.subtitles
        ? { locator: data.subtitles, recordingOffsetTicks: 0 }
        : undefined,
      originalV1State: data.originalV1State,
    },
  };
};

const addPreparedImages = (
  input: ImportV1ProjectInput,
  assets: Record<string, MediaAsset>,
  diagnostics: ImportV1ProjectDiagnostic[]
): void => {
  const firstFrame = input.normalizedState.firstFrame;
  if (firstFrame.enabled) {
    if (input.sources.firstFrameImage) {
      const asset = input.sources.firstFrameImage.asset;
      assets[asset.id] = asset;
    } else {
      diagnostics.push({
        code: 'missing-first-frame-image',
        path: 'firstFrame.imageData',
      });
    }
  }

  if (input.normalizedState.wallpaper.backgroundImage) {
    if (input.sources.wallpaperImage) {
      const asset = input.sources.wallpaperImage.asset;
      assets[asset.id] = asset;
    } else {
      diagnostics.push({
        code: 'missing-wallpaper-image',
        path: 'wallpaper.backgroundImage',
      });
    }
  }
};

export const importV1Project = (
  input: ImportV1ProjectInput
): ImportV1ProjectResult => {
  const diagnostics: ImportV1ProjectDiagnostic[] = [];
  const recordingAsset = createRecordingAsset(input);
  const recording = importRecordingClips(input, recordingAsset);
  const music = importMusic(input, recording.audioTrackIds.length);
  const assets: Record<string, MediaAsset> = {
    [recordingAsset.id]: recordingAsset,
    ...music.assets,
  };

  addPreparedImages(input, assets, diagnostics);
  importClipEffects(
    input,
    recording.clips,
    recording.screenClipIds,
    recording.cameraClipIds
  );

  const firstFrame = input.normalizedState.firstFrame;
  const firstFrameAsset = input.sources.firstFrameImage?.asset;
  const preRoll =
    firstFrame.enabled && firstFrameAsset
      ? {
          kind: 'output-frame-count' as const,
          assetId: firstFrameAsset.id,
          frames: 1,
          fit: firstFrame.fit,
        }
      : undefined;

  const project: EditorProjectV2 = {
    schemaVersion: EDITOR_V2_SCHEMA_VERSION,
    id: input.projectId,
    name: input.projectName,
    createdAt: input.createdAt,
    updatedAt: input.importedAt,
    revision: 0,
    timebase: createEditorTimebase(
      input.sources.recording.frameRate,
      input.sources.systemAudio?.streams[0]?.sampleRate ??
        input.sources.microphoneAudio?.streams[0]?.sampleRate ??
        input.sources.recording.audioStreams[0]?.sampleRate ??
        48_000
    ),
    assets,
    sequence: {
      id: input.sequenceId,
      name: 'Sequence 1',
      videoTrackIds: recording.videoTrackIds,
      audioTrackIds: [...recording.audioTrackIds, ...music.audioTrackIds],
      tracks: {
        ...recording.tracks,
        ...music.tracks,
      },
      clips: {
        ...recording.clips,
        ...music.clips,
      },
      transitions: {},
      effects: importSequenceEffects(input),
      preRoll,
    },
    importedFromV1: {
      packageFingerprint: input.sourceFingerprint,
      importedAt: input.importedAt,
      files: input.importFiles,
    },
  };

  return {
    project,
    workspace: createWorkspaceFromV1(input.normalizedState),
    diagnostics: [...diagnostics, ...music.diagnostics],
  };
};
