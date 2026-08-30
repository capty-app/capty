import { createHash } from 'crypto';
import path from 'path';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { createDefaultEditorWorkspace } from '@/editor-v2/persistence/workspace';
import type { PreparedV1ImportResult } from '@/main/editor-v2/project/project-service';

import { fingerprintMediaFile } from './media-fingerprint';
import { MediaMetadataService } from './metadata-service';

export const prepareStandaloneEditorProject = async (
  sourcePath: string,
  metadata = new MediaMetadataService()
): Promise<PreparedV1ImportResult> => {
  const fingerprint = await fingerprintMediaFile(sourcePath);
  const stableId = createHash('sha256')
    .update(path.resolve(sourcePath))
    .update('\0')
    .update(fingerprint.sha256)
    .digest('hex')
    .slice(0, 20);
  const createdAt = new Date().toISOString();
  const assetId = `asset-${stableId}`;
  const project = createEmptyEditorProject({
    id: `project-${stableId}`,
    name: path.basename(sourcePath, path.extname(sourcePath)),
    createdAt,
    sequenceId: `sequence-${stableId}`,
    videoTrackId: `video-track-${stableId}`,
    audioTrackId: `audio-track-${stableId}`,
  });
  const asset = await metadata.createAsset({
    id: assetId,
    filePath: sourcePath,
    locator: {
      kind: 'linked',
      absolutePath: sourcePath,
      fingerprint,
    },
    importedAt: createdAt,
  });
  const verifiedFingerprint = await fingerprintMediaFile(sourcePath);
  if (
    fingerprint.byteLength !== verifiedFingerprint.byteLength ||
    fingerprint.sha256 !== verifiedFingerprint.sha256
  ) {
    throw new Error('Media changed while it was being inspected');
  }
  if (asset.kind !== 'video') {
    throw new Error('Standalone Editor V2 sources must be decodable video');
  }
  project.assets[asset.id] = asset;
  const trackId = project.sequence.videoTrackIds[0];
  const clipId = `clip-${stableId}`;
  project.sequence.clips[clipId] = {
    id: clipId,
    kind: 'video',
    trackId,
    assetId: asset.id,
    name: asset.name,
    timelineStart: 0,
    timelineDuration: asset.durationTicks,
    sourceStart: 0,
    sourceDuration: asset.durationTicks,
    playbackRate: { numerator: 1, denominator: 1 },
    sourceStreamId: asset.videoStreams[0]?.id,
    effects: [],
  };
  project.sequence.tracks[trackId].clipIds.push(clipId);
  return {
    project,
    workspace: createDefaultEditorWorkspace(),
    diagnostics: [],
  };
};
