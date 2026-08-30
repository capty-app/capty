import {
  EDITOR_V2_SCHEMA_VERSION,
  EDITOR_V2_TICKS_PER_SECOND,
  type EditorProjectV2,
} from '@/types/editor-v2';

import {
  findDocumentInvariantViolations,
  type DocumentInvariantViolation,
} from './invariants';
import {
  isAssetStructure,
  isClipStructure,
  isImportProvenance,
  isPreRoll,
  isRecord,
  isSequenceEffect,
  isStringArray,
  isTrackStructure,
  isTransitionStructure,
} from './structure';

export type EditorProjectValidationResult =
  | { valid: true; project: EditorProjectV2 }
  | {
      valid: false;
      errors: Array<
        | { code: 'invalid-document'; path: string; message: string }
        | DocumentInvariantViolation
      >;
    };

const isRecordDictionary = (
  value: Record<string, unknown>,
  predicate: (entry: Record<string, unknown>) => boolean
): boolean =>
  Object.values(value).every(entry => isRecord(entry) && predicate(entry));

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
    !Array.isArray(value.sequence.effects) ||
    !value.sequence.effects.every(isSequenceEffect) ||
    (value.sequence.preRoll !== undefined &&
      !isPreRoll(value.sequence.preRoll)) ||
    (value.importedFromV1 !== undefined &&
      !isImportProvenance(value.importedFromV1))
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
