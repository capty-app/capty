import {
  EDITOR_V2_SCHEMA_VERSION,
  EDITOR_V2_TICKS_PER_SECOND,
  type EditorProjectV2,
} from '@/types/editor-v2';

import {
  findDocumentInvariantViolations,
  type DocumentInvariantViolation,
} from './invariants';

export type EditorProjectValidationResult =
  | { valid: true; project: EditorProjectV2 }
  | {
      valid: false;
      errors: Array<
        | { code: 'invalid-document'; path: string; message: string }
        | DocumentInvariantViolation
      >;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string');

const isRecordDictionary = (
  value: Record<string, unknown>,
  predicate: (entry: Record<string, unknown>) => boolean
): boolean =>
  Object.values(value).every(entry => isRecord(entry) && predicate(entry));

const isAssetStructure = (value: Record<string, unknown>): boolean =>
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.kind === 'string' &&
  isRecord(value.locator);

const isTrackStructure = (value: Record<string, unknown>): boolean =>
  typeof value.id === 'string' &&
  (value.kind === 'video' || value.kind === 'audio') &&
  isStringArray(value.clipIds);

const isClipStructure = (value: Record<string, unknown>): boolean =>
  typeof value.id === 'string' &&
  typeof value.trackId === 'string' &&
  typeof value.assetId === 'string' &&
  (value.kind === 'video' ||
    value.kind === 'image' ||
    value.kind === 'audio') &&
  typeof value.timelineStart === 'number' &&
  typeof value.timelineDuration === 'number' &&
  typeof value.sourceStart === 'number' &&
  typeof value.sourceDuration === 'number' &&
  isRecord(value.playbackRate) &&
  typeof value.playbackRate.numerator === 'number' &&
  typeof value.playbackRate.denominator === 'number' &&
  Array.isArray(value.effects);

const isTransitionStructure = (value: Record<string, unknown>): boolean => {
  if (
    typeof value.id !== 'string' ||
    typeof value.trackId !== 'string' ||
    typeof value.durationTicks !== 'number'
  ) {
    return false;
  }

  if (value.type === 'video-fade-black') {
    return (
      typeof value.clipId === 'string' &&
      (value.edge === 'in' || value.edge === 'out')
    );
  }

  if (
    value.type !== 'video-cross-dissolve' &&
    value.type !== 'audio-crossfade'
  ) {
    return false;
  }

  return (
    typeof value.fromClipId === 'string' &&
    typeof value.toClipId === 'string' &&
    typeof value.cutTick === 'number' &&
    value.alignment === 'center'
  );
};

const invalidDocument = (
  path: string,
  message: string
): EditorProjectValidationResult => ({
  valid: false,
  errors: [{ code: 'invalid-document', path, message }],
});

export const validateEditorProject = (
  value: unknown
): EditorProjectValidationResult => {
  if (!isRecord(value)) {
    return invalidDocument('', 'Project must be an object');
  }

  if (value.schemaVersion !== EDITOR_V2_SCHEMA_VERSION) {
    return invalidDocument(
      'schemaVersion',
      `Project schema version must be ${EDITOR_V2_SCHEMA_VERSION}`
    );
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0
  ) {
    return invalidDocument('', 'Project identity or revision is invalid');
  }

  if (!isRecord(value.timebase)) {
    return invalidDocument('timebase', 'Project timebase is invalid');
  }

  if (
    value.timebase.ticksPerSecond !== EDITOR_V2_TICKS_PER_SECOND ||
    !isRecord(value.timebase.displayFrameRate) ||
    !Number.isSafeInteger(value.timebase.displayFrameRate.numerator) ||
    Number(value.timebase.displayFrameRate.numerator) <= 0 ||
    !Number.isSafeInteger(value.timebase.displayFrameRate.denominator) ||
    Number(value.timebase.displayFrameRate.denominator) <= 0 ||
    !Number.isSafeInteger(value.timebase.audioSampleRate) ||
    Number(value.timebase.audioSampleRate) <= 0
  ) {
    return invalidDocument('timebase', 'Project timebase values are invalid');
  }

  if (
    !isRecord(value.assets) ||
    !isRecordDictionary(value.assets, isAssetStructure)
  ) {
    return invalidDocument('assets', 'Project assets must be a dictionary');
  }

  if (!isRecord(value.sequence)) {
    return invalidDocument('sequence', 'Project sequence is invalid');
  }

  if (
    typeof value.sequence.id !== 'string' ||
    typeof value.sequence.name !== 'string' ||
    !isStringArray(value.sequence.videoTrackIds) ||
    !isStringArray(value.sequence.audioTrackIds) ||
    !isRecord(value.sequence.tracks) ||
    !isRecordDictionary(value.sequence.tracks, isTrackStructure) ||
    !isRecord(value.sequence.clips) ||
    !isRecordDictionary(value.sequence.clips, isClipStructure) ||
    !isRecord(value.sequence.transitions) ||
    !isRecordDictionary(value.sequence.transitions, isTransitionStructure) ||
    !Array.isArray(value.sequence.effects)
  ) {
    return invalidDocument('sequence', 'Project sequence structure is invalid');
  }

  const project = value as unknown as EditorProjectV2;
  const errors = findDocumentInvariantViolations(project);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, project };
};
