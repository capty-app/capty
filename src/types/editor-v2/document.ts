import type { FirstFrameFit } from '../first-frame';
import type { SequenceEffect } from './effects';
import type { MediaAsset, MediaFingerprint } from './media';
import type { EditorTimebase } from './time';
import type { EditorClip, EditorTrack } from './tracks';
import type { EditorTransition } from './transitions';

export const EDITOR_V2_SCHEMA_VERSION = 2;

export interface V1ImportManifestEntry {
  relativePath: string;
  fingerprint: MediaFingerprint;
}

export interface V1ImportProvenance {
  packageFingerprint: string;
  importedAt: string;
  files: V1ImportManifestEntry[];
}

export interface OutputFrameCountPreRoll {
  kind: 'output-frame-count';
  assetId: string;
  frames: number;
  fit: FirstFrameFit;
}

export interface EditorSequence {
  id: string;
  name: string;
  videoTrackIds: string[];
  audioTrackIds: string[];
  tracks: Record<string, EditorTrack>;
  clips: Record<string, EditorClip>;
  transitions: Record<string, EditorTransition>;
  effects: SequenceEffect[];
  preRoll?: OutputFrameCountPreRoll;
}

export interface EditorProjectV2 {
  schemaVersion: typeof EDITOR_V2_SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  timebase: EditorTimebase;
  assets: Record<string, MediaAsset>;
  sequence: EditorSequence;
  importedFromV1?: V1ImportProvenance;
}
