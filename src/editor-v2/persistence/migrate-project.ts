import type { EditorProjectV2 } from '@/types/editor-v2';

import {
  validateEditorProject,
  type EditorProjectValidationResult,
} from '../document/validate';

type ValidationFailure = Extract<
  EditorProjectValidationResult,
  { valid: false }
>;

export type EditorProjectMigrationResult =
  | { status: 'migrated'; project: EditorProjectV2; migrated: false }
  | { status: 'invalid'; errors: ValidationFailure['errors'] };

export const migrateEditorProject = (
  value: unknown
): EditorProjectMigrationResult => {
  const validation = validateEditorProject(value);
  if (!validation.valid) {
    return { status: 'invalid', errors: validation.errors };
  }

  return {
    status: 'migrated',
    project: validation.project,
    migrated: false,
  };
};
