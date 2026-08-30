import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';

import { validateEditorProject } from '@/editor-v2/document/validate';

import { fingerprintFile } from './legacy-data-reader';
import {
  ensureEditorV2ProjectDirectories,
  ensureSafeProjectWritePath,
  getEditorV2ProjectPaths,
} from '../project/project-paths';
import { writeJsonAtomic } from '../project/atomic-project-writer';
import type {
  EditableDataLocator,
  EditorProjectV2,
  V1ReadOnlyDataLocator,
  V2DataLocator,
} from '@/types/editor-v2';

export type EditorV2DataKind = 'cursor' | 'keyboard' | 'subtitles';

const locatorMatches = (
  locator: EditableDataLocator,
  expected: EditableDataLocator
): boolean =>
  locator.kind === expected.kind &&
  locator.relativePath === expected.relativePath &&
  locator.fingerprint.sha256 === expected.fingerprint.sha256;

const projectUsesDataLocator = (
  project: EditorProjectV2,
  expected: EditableDataLocator
): boolean => {
  const assetSourceMatch = Object.values(project.assets).some(asset => {
    if (asset.kind !== 'capty-recording') return false;
    return [
      asset.sources.cameraMetadata,
      asset.sources.cursor,
      asset.sources.keyboard,
      asset.sources.subtitles,
    ].some(source => source && locatorMatches(source.locator, expected));
  });
  if (assetSourceMatch) return true;

  return Object.values(project.sequence.clips).some(clip =>
    clip.effects.some(
      effect =>
        (effect.kind === 'cursor' ||
          effect.kind === 'keyboard' ||
          effect.kind === 'subtitle') &&
        locatorMatches(effect.data, expected)
    )
  );
};

export const replaceEditorDataLocator = (
  project: EditorProjectV2,
  expected: EditableDataLocator,
  replacement: EditableDataLocator
): EditorProjectV2 => {
  const next = structuredClone(project);

  Object.values(next.assets).forEach(asset => {
    if (asset.kind !== 'capty-recording') return;
    const sources = asset.sources;
    const dataSources = [
      sources.cameraMetadata,
      sources.cursor,
      sources.keyboard,
      sources.subtitles,
    ];
    dataSources.forEach(source => {
      if (source && locatorMatches(source.locator, expected)) {
        source.locator = replacement;
      }
    });
  });

  Object.values(next.sequence.clips).forEach(clip => {
    clip.effects.forEach(effect => {
      if (
        (effect.kind === 'cursor' ||
          effect.kind === 'keyboard' ||
          effect.kind === 'subtitle') &&
        locatorMatches(effect.data, expected)
      ) {
        effect.data = replacement;
      }
    });
  });

  return next;
};

export interface CopyOnWriteDataInput {
  packagePath: string;
  project: EditorProjectV2;
  assetId: string;
  kind: EditorV2DataKind;
  expectedLocator: V1ReadOnlyDataLocator | V2DataLocator;
  value: unknown;
  commitProject: (project: EditorProjectV2) => Promise<EditorProjectV2>;
}

export interface CopyOnWriteDataResult {
  project: EditorProjectV2;
  locator: V2DataLocator;
}

export const writeEditorDataCopyOnWrite = async (
  input: CopyOnWriteDataInput
): Promise<CopyOnWriteDataResult> => {
  if (!projectUsesDataLocator(input.project, input.expectedLocator)) {
    throw new Error('Expected data locator is not active in the project');
  }

  const serializedValue = JSON.stringify(input.value);
  if (serializedValue === undefined) {
    throw new Error('Editor data must be JSON serializable');
  }

  await ensureEditorV2ProjectDirectories(input.packagePath);
  const valueHash = createHash('sha256')
    .update(serializedValue)
    .digest('hex')
    .slice(0, 16);
  const relativePath = path.join(
    'data',
    input.assetId,
    `${input.kind}-${valueHash}.json`
  );
  const target = await ensureSafeProjectWritePath(
    input.packagePath,
    relativePath
  );
  await writeJsonAtomic(
    {
      target,
      temporary: `${target}.tmp`,
      backup: `${target}.bak`,
    },
    input.value
  );

  const locator: V2DataLocator = {
    kind: 'v2-data',
    relativePath,
    fingerprint: await fingerprintFile(target),
    provenance:
      input.expectedLocator.kind === 'v1-read-only'
        ? input.expectedLocator
        : input.expectedLocator.provenance,
  };
  const nextProject = replaceEditorDataLocator(
    input.project,
    input.expectedLocator,
    locator
  );
  const committedProject = await input.commitProject(nextProject);
  await recoverOrphanEditorData(input.packagePath, committedProject);
  return { project: committedProject, locator };
};

export const removeEditorDataLocator = (
  project: EditorProjectV2,
  expected: EditableDataLocator
): EditorProjectV2 => {
  const next = structuredClone(project);
  Object.values(next.assets).forEach(asset => {
    if (asset.kind !== 'capty-recording') return;
    const sourceKeys = [
      'cameraMetadata',
      'cursor',
      'keyboard',
      'subtitles',
    ] as const;
    sourceKeys.forEach(key => {
      const source = asset.sources[key];
      if (source && locatorMatches(source.locator, expected)) {
        delete asset.sources[key];
      }
    });
  });
  Object.values(next.sequence.clips).forEach(clip => {
    clip.effects = clip.effects.filter(effect => {
      if (
        effect.kind !== 'cursor' &&
        effect.kind !== 'keyboard' &&
        effect.kind !== 'subtitle'
      ) {
        return true;
      }
      return !locatorMatches(effect.data, expected);
    });
  });
  return next;
};

export interface MutateEditorDataReferenceInput {
  packagePath: string;
  project: EditorProjectV2;
  expectedLocator: EditableDataLocator;
  commitProject: (project: EditorProjectV2) => Promise<EditorProjectV2>;
}

export const deleteEditorData = async (
  input: MutateEditorDataReferenceInput
): Promise<EditorProjectV2> => {
  if (!projectUsesDataLocator(input.project, input.expectedLocator)) {
    throw new Error('Expected data locator is not active in the project');
  }
  const next = removeEditorDataLocator(input.project, input.expectedLocator);
  const committed = await input.commitProject(next);
  await recoverOrphanEditorData(input.packagePath, committed);
  return committed;
};

export const resetEditorDataToV1 = async (
  input: MutateEditorDataReferenceInput
): Promise<EditorProjectV2> => {
  if (input.expectedLocator.kind !== 'v2-data') {
    throw new Error('Only V2 data can be reset');
  }
  if (!input.expectedLocator.provenance) {
    throw new Error('V2 data has no V1 provenance');
  }
  if (!projectUsesDataLocator(input.project, input.expectedLocator)) {
    throw new Error('Expected data locator is not active in the project');
  }
  const next = replaceEditorDataLocator(
    input.project,
    input.expectedLocator,
    input.expectedLocator.provenance
  );
  const committed = await input.commitProject(next);
  await recoverOrphanEditorData(input.packagePath, committed);
  return committed;
};

const collectReferencedV2Data = (project: EditorProjectV2): Set<string> => {
  const referenced = new Set<string>();
  const add = (locator: EditableDataLocator | undefined) => {
    if (locator?.kind === 'v2-data') referenced.add(locator.relativePath);
  };

  Object.values(project.assets).forEach(asset => {
    if (asset.kind !== 'capty-recording') return;
    add(asset.sources.cameraMetadata?.locator);
    add(asset.sources.cursor?.locator);
    add(asset.sources.keyboard?.locator);
    add(asset.sources.subtitles?.locator);
  });
  Object.values(project.sequence.clips).forEach(clip => {
    clip.effects.forEach(effect => {
      if (
        effect.kind === 'cursor' ||
        effect.kind === 'keyboard' ||
        effect.kind === 'subtitle'
      ) {
        add(effect.data);
      }
    });
  });
  return referenced;
};

const collectFiles = async (directory: string): Promise<string[]> => {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async entry => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
      })
    );
    return files.flat();
  } catch {
    return [];
  }
};

const readRecoverableProjects = async (
  packagePath: string
): Promise<EditorProjectV2[]> => {
  const paths = getEditorV2ProjectPaths(packagePath);
  const candidates = [
    paths.project,
    paths.projectTemporary,
    paths.projectBackup,
  ];
  const projects = await Promise.all(
    candidates.map(async candidate => {
      try {
        const value: unknown = JSON.parse(
          await fs.readFile(candidate, 'utf-8')
        );
        const validation = validateEditorProject(value);
        return validation.valid ? (value as EditorProjectV2) : null;
      } catch {
        return null;
      }
    })
  );
  return projects.filter(
    (project): project is EditorProjectV2 => project !== null
  );
};

export const recoverOrphanEditorData = async (
  packagePath: string,
  project: EditorProjectV2
): Promise<string[]> => {
  const paths = await ensureEditorV2ProjectDirectories(packagePath);
  const recoverableProjects = [
    project,
    ...(await readRecoverableProjects(packagePath)),
  ];
  const referenced = new Set(
    recoverableProjects.flatMap(candidate => [
      ...collectReferencedV2Data(candidate),
    ])
  );
  const files = await collectFiles(paths.data);
  const removed: string[] = [];

  for (const filePath of files) {
    if (filePath.endsWith('.tmp') || filePath.endsWith('.bak')) continue;
    const relativePath = path.relative(packagePath, filePath);
    if (referenced.has(relativePath)) continue;
    await fs.unlink(filePath);
    removed.push(relativePath);
  }

  return removed;
};
