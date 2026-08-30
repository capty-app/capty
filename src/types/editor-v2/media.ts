import type { Rational, TimelineTick } from './time';

export interface MediaFingerprint {
  byteLength: number;
  sha256: string;
  modifiedAt?: string;
}

export interface ManagedMediaLocator {
  kind: 'managed';
  relativePath: string;
}

export interface LegacyPackageMediaLocator {
  kind: 'legacy-package-read-only';
  relativePath: string;
  fingerprint: MediaFingerprint;
}

export interface LinkedMediaLocator {
  kind: 'linked';
  absolutePath: string;
  fingerprint: MediaFingerprint;
}

export type MediaLocator =
  ManagedMediaLocator | LegacyPackageMediaLocator | LinkedMediaLocator;

export interface V1ReadOnlyDataLocator {
  kind: 'v1-read-only';
  relativePath: string;
  fingerprint: MediaFingerprint;
}

export interface V2DataLocator {
  kind: 'v2-data';
  relativePath: string;
  fingerprint: MediaFingerprint;
  provenance?: V1ReadOnlyDataLocator;
}

export type EditableDataLocator = V1ReadOnlyDataLocator | V2DataLocator;

export interface VideoStreamDescriptor {
  id: string;
  codec: string;
  durationTicks: TimelineTick;
  width: number;
  height: number;
  frameRate: Rational;
  hasAlpha: boolean;
}

export interface AudioStreamDescriptor {
  id: string;
  codec: string;
  durationTicks: TimelineTick;
  channels: number;
  sampleRate: number;
}

export interface MediaAssetBase {
  id: string;
  name: string;
  locator: MediaLocator;
  importedAt: string;
}

export interface VideoMediaAsset extends MediaAssetBase {
  kind: 'video';
  durationTicks: TimelineTick;
  width: number;
  height: number;
  frameRate: Rational;
  videoStreams: VideoStreamDescriptor[];
  audioStreams: AudioStreamDescriptor[];
}

export interface AudioMediaAsset extends MediaAssetBase {
  kind: 'audio';
  durationTicks: TimelineTick;
  channels: number;
  sampleRate: number;
  audioStreams: AudioStreamDescriptor[];
}

export interface ImageMediaAsset extends MediaAssetBase {
  kind: 'image';
  width: number;
  height: number;
  orientation: number;
  defaultStillDurationTicks: TimelineTick;
}

export interface CaptySourceBase {
  locator: MediaLocator;
  recordingOffsetTicks: TimelineTick;
  durationTicks: TimelineTick;
}

export interface CaptyVideoSource extends CaptySourceBase {
  kind: 'video';
  streams: VideoStreamDescriptor[];
}

export interface CaptyAudioSource extends CaptySourceBase {
  kind: 'audio';
  streams: AudioStreamDescriptor[];
}

export interface CaptyDataSource {
  locator: EditableDataLocator;
  recordingOffsetTicks: TimelineTick;
}

export interface CaptyRecordingSources {
  systemAudio?: CaptyAudioSource;
  microphoneAudio?: CaptyAudioSource;
  cameraVideo?: CaptyVideoSource;
  cameraMetadata?: CaptyDataSource;
  cursor?: CaptyDataSource;
  keyboard?: CaptyDataSource;
  subtitles?: CaptyDataSource;
  originalV1State?: V1ReadOnlyDataLocator;
}

export interface CaptyRecordingMediaAsset extends MediaAssetBase {
  kind: 'capty-recording';
  durationTicks: TimelineTick;
  width: number;
  height: number;
  frameRate: Rational;
  videoStreams: VideoStreamDescriptor[];
  audioStreams: AudioStreamDescriptor[];
  sources: CaptyRecordingSources;
}

export type MediaAsset =
  | VideoMediaAsset
  | AudioMediaAsset
  | ImageMediaAsset
  | CaptyRecordingMediaAsset;
