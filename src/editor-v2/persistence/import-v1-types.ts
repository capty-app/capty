import type { NormalizedV1EditorState } from '@/editor-v1/project-normalizer';
import type {
  AudioStreamDescriptor,
  V1ReadOnlyDataLocator,
  ImageMediaAsset,
  MediaFingerprint,
  Rational,
  VideoStreamDescriptor,
} from '@/types/editor-v2';

export interface V1ImportVideoSource {
  relativePath: string;
  fingerprint: MediaFingerprint;
  durationSeconds: number | string;
  recordingOffsetSeconds?: number | string;
  width: number;
  height: number;
  frameRate: Rational;
  videoStreams: VideoStreamDescriptor[];
  audioStreams: AudioStreamDescriptor[];
}

export interface V1ImportAudioSource {
  relativePath: string;
  fingerprint: MediaFingerprint;
  durationSeconds: number | string;
  recordingOffsetSeconds?: number | string;
  streams: AudioStreamDescriptor[];
}

export interface V1ImportMusicSource {
  fileName: string;
  relativePath: string;
  fingerprint: MediaFingerprint;
  durationSeconds: number | string;
  channels: number;
  sampleRate: number;
  streams: AudioStreamDescriptor[];
}

export interface V1ImportDataSources {
  cursor?: V1ReadOnlyDataLocator;
  keyboard?: V1ReadOnlyDataLocator;
  subtitles?: V1ReadOnlyDataLocator;
  cameraMetadata?: V1ReadOnlyDataLocator;
  originalV1State?: V1ReadOnlyDataLocator;
}

export interface V1ImportPreparedImage {
  asset: ImageMediaAsset;
}

export interface V1ImportSources {
  recording: V1ImportVideoSource;
  systemAudio?: V1ImportAudioSource;
  microphoneAudio?: V1ImportAudioSource;
  cameraVideo?: V1ImportVideoSource;
  music: V1ImportMusicSource[];
  data: V1ImportDataSources;
  firstFrameImage?: V1ImportPreparedImage;
  wallpaperImage?: V1ImportPreparedImage;
}

export interface ImportV1ProjectInput {
  projectId: string;
  projectName: string;
  sequenceId: string;
  createdAt: string;
  importedAt: string;
  sourceFingerprint: string;
  importFiles: Array<{
    relativePath: string;
    fingerprint: MediaFingerprint;
  }>;
  normalizedState: NormalizedV1EditorState;
  sources: V1ImportSources;
  createId: (kind: string, sourceId: string) => string;
}

export interface ImportV1ProjectDiagnostic {
  code:
    | 'missing-music-source'
    | 'missing-first-frame-image'
    | 'missing-wallpaper-image';
  path: string;
}
