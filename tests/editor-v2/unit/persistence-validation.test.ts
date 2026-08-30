import { describe, expect, it } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import { validateEditorProject } from '@/editor-v2/document/validate';
import { migrateEditorProject } from '@/editor-v2/persistence/migrate-project';
import {
  createDefaultEditorWorkspace,
  validateEditorWorkspace,
} from '@/editor-v2/persistence/workspace';

describe('Editor V2 persistence validation', () => {
  it('accepts the current schema without rewriting it', () => {
    const project = createEmptyEditorProject({
      id: 'project',
      name: 'Project',
      createdAt: '2026-08-30T00:00:00.000Z',
      sequenceId: 'sequence',
      videoTrackId: 'video-track',
      audioTrackId: 'audio-track',
    });

    expect(migrateEditorProject(project)).toEqual({
      status: 'migrated',
      project,
      migrated: false,
    });
  });

  it('rejects malformed asset locators and incomplete media metadata', () => {
    const project = createEmptyEditorProject({
      id: 'project',
      name: 'Project',
      createdAt: '2026-08-30T00:00:00.000Z',
      sequenceId: 'sequence',
      videoTrackId: 'video-track',
      audioTrackId: 'audio-track',
    });
    const malformed = structuredClone(project) as unknown as Record<
      string,
      unknown
    >;
    malformed.assets = {
      invalid: {
        id: 'invalid',
        name: 'Invalid',
        kind: 'video',
        locator: { kind: 'arbitrary-path', path: '/tmp/file' },
      },
    };

    expect(validateEditorProject(malformed)).toMatchObject({ valid: false });
    expect(migrateEditorProject(malformed)).toMatchObject({
      status: 'invalid',
    });
  });

  it('rejects project-relative locator traversal', () => {
    const project = createEmptyEditorProject({
      id: 'project',
      name: 'Project',
      createdAt: '2026-08-30T00:00:00.000Z',
      sequenceId: 'sequence',
      videoTrackId: 'video-track',
      audioTrackId: 'audio-track',
    });
    project.assets.image = {
      id: 'image',
      kind: 'image',
      name: 'Image',
      locator: { kind: 'managed', relativePath: 'media/../../state.json' },
      importedAt: '2026-08-30T00:00:00.000Z',
      width: 100,
      height: 100,
      orientation: 1,
      defaultStillDurationTicks: 360_000,
    };

    expect(validateEditorProject(project).valid).toBe(false);
  });

  it('validates complete workspace values and rejects partial nested state', () => {
    const workspace = createDefaultEditorWorkspace();
    expect(validateEditorWorkspace(workspace)).toBe(true);
    expect(
      validateEditorWorkspace({
        ...workspace,
        leftDock: { collapsed: false },
      })
    ).toBe(false);
    expect(
      validateEditorWorkspace({
        ...workspace,
        lastExportSettings: {
          ...workspace.lastExportSettings,
          frameRate: { numerator: 0, denominator: 1 },
        },
      })
    ).toBe(false);
  });
});
