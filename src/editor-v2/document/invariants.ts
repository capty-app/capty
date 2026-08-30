import type {
  EditorClip,
  EditorProjectV2,
  EditorTrack,
  EditorTransition,
} from '@/types/editor-v2';

export type DocumentInvariantCode =
  | 'asset-id-mismatch'
  | 'track-id-mismatch'
  | 'clip-id-mismatch'
  | 'transition-id-mismatch'
  | 'duplicate-track-order-id'
  | 'missing-track'
  | 'track-kind-mismatch'
  | 'unordered-track'
  | 'duplicate-clip-reference'
  | 'missing-clip'
  | 'clip-track-mismatch'
  | 'clip-kind-mismatch'
  | 'unordered-clip'
  | 'overlapping-clips'
  | 'unreferenced-clip'
  | 'missing-asset'
  | 'asset-kind-mismatch'
  | 'invalid-clip-range'
  | 'invalid-playback-rate'
  | 'missing-transition-track'
  | 'missing-transition-clip'
  | 'transition-track-mismatch'
  | 'invalid-transition-duration'
  | 'invalid-transition-cut'
  | 'invalid-transition-participants'
  | 'invalid-pre-roll';

export interface DocumentInvariantViolation {
  code: DocumentInvariantCode;
  path: string;
  message: string;
}

const isPositiveSafeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

const pushViolation = (
  violations: DocumentInvariantViolation[],
  code: DocumentInvariantCode,
  path: string,
  message: string
): void => {
  violations.push({ code, path, message });
};

const validateClip = (
  project: EditorProjectV2,
  track: EditorTrack,
  clip: EditorClip,
  path: string,
  violations: DocumentInvariantViolation[]
): void => {
  if (clip.trackId !== track.id) {
    pushViolation(
      violations,
      'clip-track-mismatch',
      path,
      `Clip ${clip.id} belongs to track ${clip.trackId}`
    );
  }

  const validKind =
    (track.kind === 'video' &&
      (clip.kind === 'video' || clip.kind === 'image')) ||
    (track.kind === 'audio' && clip.kind === 'audio');

  if (!validKind) {
    pushViolation(
      violations,
      'clip-kind-mismatch',
      path,
      `Clip ${clip.id} is incompatible with ${track.kind} track ${track.id}`
    );
  }

  const asset = project.assets[clip.assetId];
  if (!asset) {
    pushViolation(
      violations,
      'missing-asset',
      `${path}.assetId`,
      `Clip ${clip.id} references missing asset ${clip.assetId}`
    );
  }

  const validAssetKind =
    !asset ||
    (clip.kind === 'image' && asset.kind === 'image') ||
    (clip.kind === 'video' &&
      (asset.kind === 'video' || asset.kind === 'capty-recording')) ||
    (clip.kind === 'audio' &&
      (asset.kind === 'audio' ||
        asset.kind === 'video' ||
        asset.kind === 'capty-recording'));

  if (!validAssetKind) {
    pushViolation(
      violations,
      'asset-kind-mismatch',
      `${path}.assetId`,
      `Clip ${clip.id} is incompatible with asset ${clip.assetId}`
    );
  }

  if (
    !Number.isSafeInteger(clip.timelineStart) ||
    clip.timelineStart < 0 ||
    !isPositiveSafeInteger(clip.timelineDuration) ||
    !Number.isSafeInteger(clip.sourceStart) ||
    clip.sourceStart < 0 ||
    !isPositiveSafeInteger(clip.sourceDuration)
  ) {
    pushViolation(
      violations,
      'invalid-clip-range',
      path,
      `Clip ${clip.id} has an invalid source or timeline range`
    );
  }

  if (
    !isPositiveSafeInteger(clip.playbackRate.numerator) ||
    !isPositiveSafeInteger(clip.playbackRate.denominator)
  ) {
    pushViolation(
      violations,
      'invalid-playback-rate',
      `${path}.playbackRate`,
      `Clip ${clip.id} has an invalid playback rate`
    );
  }
};

const validateTrackClips = (
  project: EditorProjectV2,
  track: EditorTrack,
  referencedClipIds: Set<string>,
  violations: DocumentInvariantViolation[]
): void => {
  let previousClip: EditorClip | undefined;

  track.clipIds.forEach((clipId, index) => {
    const path = `sequence.tracks.${track.id}.clipIds.${index}`;

    if (referencedClipIds.has(clipId)) {
      pushViolation(
        violations,
        'duplicate-clip-reference',
        path,
        `Clip ${clipId} is referenced more than once`
      );
    }
    referencedClipIds.add(clipId);

    const clip = project.sequence.clips[clipId];
    if (!clip) {
      pushViolation(
        violations,
        'missing-clip',
        path,
        `Track ${track.id} references missing clip ${clipId}`
      );
      return;
    }

    validateClip(project, track, clip, `sequence.clips.${clip.id}`, violations);

    if (previousClip && clip.timelineStart < previousClip.timelineStart) {
      pushViolation(
        violations,
        'unordered-clip',
        path,
        `Clip ${clip.id} starts before the preceding clip`
      );
    }

    const previousEnd = previousClip
      ? previousClip.timelineStart + previousClip.timelineDuration
      : 0;
    if (previousClip && clip.timelineStart < previousEnd) {
      pushViolation(
        violations,
        'overlapping-clips',
        path,
        `Clip ${clip.id} overlaps clip ${previousClip.id}`
      );
    }

    previousClip = clip;
  });
};

const validateTrackOrder = (
  project: EditorProjectV2,
  trackIds: string[],
  kind: EditorTrack['kind'],
  orderedTrackIds: Set<string>,
  violations: DocumentInvariantViolation[]
): void => {
  trackIds.forEach((trackId, index) => {
    const path = `sequence.${kind}TrackIds.${index}`;

    if (orderedTrackIds.has(trackId)) {
      pushViolation(
        violations,
        'duplicate-track-order-id',
        path,
        `Track ${trackId} appears more than once in track order`
      );
    }
    orderedTrackIds.add(trackId);

    const track = project.sequence.tracks[trackId];
    if (!track) {
      pushViolation(
        violations,
        'missing-track',
        path,
        `Track order references missing track ${trackId}`
      );
      return;
    }

    if (track.kind !== kind) {
      pushViolation(
        violations,
        'track-kind-mismatch',
        path,
        `Track ${trackId} is ${track.kind}, not ${kind}`
      );
    }
  });
};

const validateTransition = (
  project: EditorProjectV2,
  transition: EditorTransition,
  violations: DocumentInvariantViolation[]
): void => {
  const path = `sequence.transitions.${transition.id}`;
  const track = project.sequence.tracks[transition.trackId];

  if (!track) {
    pushViolation(
      violations,
      'missing-transition-track',
      `${path}.trackId`,
      `Transition ${transition.id} references a missing track`
    );
    return;
  }

  if (!isPositiveSafeInteger(transition.durationTicks)) {
    pushViolation(
      violations,
      'invalid-transition-duration',
      `${path}.durationTicks`,
      `Transition ${transition.id} must have a positive duration`
    );
  }

  if (transition.type === 'video-fade-black') {
    const clip = project.sequence.clips[transition.clipId];
    if (!clip) {
      pushViolation(
        violations,
        'missing-transition-clip',
        `${path}.clipId`,
        `Transition ${transition.id} references a missing clip`
      );
      return;
    }

    if (clip.trackId !== track.id || clip.kind === 'audio') {
      pushViolation(
        violations,
        'transition-track-mismatch',
        path,
        `Transition ${transition.id} is not on its video clip track`
      );
    }

    if (transition.durationTicks > clip.timelineDuration) {
      pushViolation(
        violations,
        'invalid-transition-duration',
        `${path}.durationTicks`,
        `Transition ${transition.id} exceeds its clip duration`
      );
    }
    return;
  }

  const fromClip = project.sequence.clips[transition.fromClipId];
  const toClip = project.sequence.clips[transition.toClipId];

  if (!fromClip || !toClip) {
    pushViolation(
      violations,
      'missing-transition-clip',
      path,
      `Transition ${transition.id} references a missing participant`
    );
    return;
  }

  if (fromClip.trackId !== track.id || toClip.trackId !== track.id) {
    pushViolation(
      violations,
      'transition-track-mismatch',
      path,
      `Transition ${transition.id} participants are not on track ${track.id}`
    );
  }

  const expectedKind =
    transition.type === 'audio-crossfade' ? 'audio' : 'video';
  const participantsMatch =
    expectedKind === 'audio'
      ? fromClip.kind === 'audio' && toClip.kind === 'audio'
      : fromClip.kind !== 'audio' && toClip.kind !== 'audio';

  if (!participantsMatch) {
    pushViolation(
      violations,
      'invalid-transition-participants',
      path,
      `Transition ${transition.id} has incompatible participants`
    );
  }

  const cutTick = fromClip.timelineStart + fromClip.timelineDuration;
  if (
    !Number.isSafeInteger(transition.cutTick) ||
    transition.cutTick !== cutTick ||
    toClip.timelineStart !== cutTick
  ) {
    pushViolation(
      violations,
      'invalid-transition-cut',
      `${path}.cutTick`,
      `Transition ${transition.id} participants are not adjacent at its cut`
    );
  }
};

export const findDocumentInvariantViolations = (
  project: EditorProjectV2
): DocumentInvariantViolation[] => {
  const violations: DocumentInvariantViolation[] = [];
  const orderedTrackIds = new Set<string>();

  Object.entries(project.assets).forEach(([assetId, asset]) => {
    if (asset.id !== assetId) {
      pushViolation(
        violations,
        'asset-id-mismatch',
        `assets.${assetId}.id`,
        `Asset dictionary key ${assetId} does not match ${asset.id}`
      );
    }
  });

  validateTrackOrder(
    project,
    project.sequence.videoTrackIds,
    'video',
    orderedTrackIds,
    violations
  );
  validateTrackOrder(
    project,
    project.sequence.audioTrackIds,
    'audio',
    orderedTrackIds,
    violations
  );

  Object.entries(project.sequence.tracks).forEach(([trackId, track]) => {
    if (track.id !== trackId) {
      pushViolation(
        violations,
        'track-id-mismatch',
        `sequence.tracks.${trackId}.id`,
        `Track dictionary key ${trackId} does not match ${track.id}`
      );
    }

    if (!orderedTrackIds.has(track.id)) {
      pushViolation(
        violations,
        'unordered-track',
        `sequence.tracks.${track.id}`,
        `Track ${track.id} is missing from track order`
      );
    }
  });

  const referencedClipIds = new Set<string>();
  orderedTrackIds.forEach(trackId => {
    const track = project.sequence.tracks[trackId];
    if (track) {
      validateTrackClips(project, track, referencedClipIds, violations);
    }
  });

  Object.entries(project.sequence.clips).forEach(([clipId, clip]) => {
    if (clip.id !== clipId) {
      pushViolation(
        violations,
        'clip-id-mismatch',
        `sequence.clips.${clipId}.id`,
        `Clip dictionary key ${clipId} does not match ${clip.id}`
      );
    }

    if (!referencedClipIds.has(clip.id)) {
      pushViolation(
        violations,
        'unreferenced-clip',
        `sequence.clips.${clip.id}`,
        `Clip ${clip.id} is missing from its track`
      );
    }
  });

  Object.entries(project.sequence.transitions).forEach(
    ([transitionId, transition]) => {
      if (transition.id !== transitionId) {
        pushViolation(
          violations,
          'transition-id-mismatch',
          `sequence.transitions.${transitionId}.id`,
          `Transition dictionary key ${transitionId} does not match ${transition.id}`
        );
      }

      validateTransition(project, transition, violations);
    }
  );

  const preRoll = project.sequence.preRoll;
  if (preRoll) {
    const asset = project.assets[preRoll.assetId];
    if (
      preRoll.kind !== 'output-frame-count' ||
      !isPositiveSafeInteger(preRoll.frames) ||
      (preRoll.fit !== 'cover' && preRoll.fit !== 'stretch') ||
      asset?.kind !== 'image'
    ) {
      pushViolation(
        violations,
        'invalid-pre-roll',
        'sequence.preRoll',
        'Semantic pre-roll must reference an image, use positive frames, and have a valid fit'
      );
    }
  }

  return violations;
};
