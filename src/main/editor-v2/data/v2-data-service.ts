import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';

import { validateEditorProject } from '@/editor-v2/document/validate';

import {
  fingerprintFile,
  isValidCursorData,
  isValidSubtitleData,
  validateKeyboardData,
} from './legacy-data-reader';
import {
  assertSafeProjectReadPath,
  ensureEditorV2ProjectDirectories,
  ensureSafeProjectWritePath,
  getEditorV2ProjectPaths,
} from '../project/project-paths';
import { writeJsonAtomic } from '../project/atomic-project-writer';
import type {
  EditableDataLocator,
  EditorProjectV2,
  EditorV2DataKind,
  EditorV2DataValue,
  V1ReadOnlyDataLocator,
  V2DataLocator,
} from '@/types/editor-v2';

const locatorMatches = (
  locator: EditableDataLocator,
  expected: EditableDataLocator
): boolean => {
  if (
    locator.kind !== expected.kind ||
    locator.relativePath !== expected.relativePath ||
    locator.fingerprint.sha256 !== expected.fingerprint.sha256 ||
    locator.fingerprint.byteLength !== expected.fingerprint.byteLength
  ) {
    return false;
  }
  if (locator.kind === 'v1-read-only') return true;
  if (expected.kind !== 'v2-data') return false;
  if (!locator.provenance || !expected.provenance) {
    return locator.provenance === expected.provenance;
  }
  return locatorMatches(locator.provenance, expected.provenance);
};

export const projectUsesDataLocator = (
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

const effectKindForData = (
  kind: EditorV2DataKind
): 'cursor' | 'keyboard' | 'subtitle' =>
  kind === 'subtitles' ? 'subtitle' : kind;

export const resolveAssetDataLocator = (
  project: EditorProjectV2,
  assetId: string,
  kind: EditorV2DataKind
): EditableDataLocator | null => {
  const asset = project.assets[assetId];
  if (!asset) return null;
  if (asset.kind === 'capty-recording') {
    const source = asset.sources[kind];
    if (source) return source.locator;
  }
  const effectKind = effectKindForData(kind);
  for (const clip of Object.values(project.sequence.clips)) {
    if (clip.assetId !== assetId) continue;
    const effect = clip.effects.find(current => current.kind === effectKind);
    if (
      effect?.kind === 'cursor' ||
      effect?.kind === 'keyboard' ||
      effect?.kind === 'subtitle'
    ) {
      return effect.data;
    }
  }
  return null;
};

const projectUsesDataLocatorForKind = (
  project: EditorProjectV2,
  kind: EditorV2DataKind,
  expected: EditableDataLocator
): boolean =>
  Object.keys(project.assets).some(assetId => {
    const canonical = resolveAssetDataLocator(project, assetId, kind);
    return canonical ? locatorMatches(canonical, expected) : false;
  });

export const readEditorData = async (
  packagePath: string,
  project: EditorProjectV2,
  kind: EditorV2DataKind,
  locator: EditableDataLocator
): Promise<EditorV2DataValue> => {
  if (!projectUsesDataLocatorForKind(project, kind, locator)) {
    throw new Error('Data locator is not active for this data kind');
  }
  const filePath = await assertSafeProjectReadPath(
    packagePath,
    locator.relativePath
  );
  const [serialized, fingerprint] = await Promise.all([
    fs.readFile(filePath, 'utf-8'),
    fingerprintFile(filePath),
  ]);
  if (
    fingerprint.sha256 !== locator.fingerprint.sha256 ||
    fingerprint.byteLength !== locator.fingerprint.byteLength
  ) {
    throw new Error('Editor data changed outside Capty');
  }
  const value: unknown = JSON.parse(serialized);
  switch (kind) {
    case 'cursor':
      if (!isValidCursorData(value))
        throw new Error('Cursor data is malformed');
      return { kind, value };
    case 'keyboard':
      if (!validateKeyboardData(value)) {
        throw new Error('Keyboard data is malformed');
      }
      return { kind, value };
    case 'subtitles':
      if (!isValidSubtitleData(value)) {
        throw new Error('Subtitle data is malformed');
      }
      return { kind, value };
  }
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

const writeEditorDataFile = async (
  packagePath: string,
  assetId: string,
  kind: EditorV2DataKind,
  value: unknown,
  provenance?: V1ReadOnlyDataLocator
): Promise<V2DataLocator> => {
  const serializedValue = JSON.stringify(value);
  if (serializedValue === undefined) {
    throw new Error('Editor data must be JSON serializable');
  }
  await ensureEditorV2ProjectDirectories(packagePath);
  const valueHash = createHash('sha256')
    .update(serializedValue)
    .digest('hex')
    .slice(0, 16);
  const relativePath = path.join('data', assetId, `${kind}-${valueHash}.json`);
  const target = await ensureSafeProjectWritePath(packagePath, relativePath);
  await writeJsonAtomic(
    {
      target,
      temporary: `${target}.tmp`,
      backup: `${target}.bak`,
    },
    value
  );
  return {
    kind: 'v2-data',
    relativePath,
    fingerprint: await fingerprintFile(target),
    provenance,
  };
};

export const writeEditorDataCopyOnWrite = async (
  input: CopyOnWriteDataInput
): Promise<CopyOnWriteDataResult> => {
  const canonical = resolveAssetDataLocator(
    input.project,
    input.assetId,
    input.kind
  );
  if (!canonical || !locatorMatches(canonical, input.expectedLocator)) {
    throw new Error(
      'Expected data locator does not match the active asset data'
    );
  }
  const locator = await writeEditorDataFile(
    input.packagePath,
    input.assetId,
    input.kind,
    input.value,
    canonical.kind === 'v1-read-only' ? canonical : canonical.provenance
  );
  const nextProject = replaceEditorDataLocator(
    input.project,
    canonical,
    locator
  );
  const committedProject = await input.commitProject(nextProject);
  await recoverOrphanEditorData(input.packagePath, committedProject);
  return { project: committedProject, locator };
};

export interface CreateEditorDataInput {
  packagePath: string;
  project: EditorProjectV2;
  assetId: string;
  kind: EditorV2DataKind;
  value: unknown;
  attach: (project: EditorProjectV2, locator: V2DataLocator) => EditorProjectV2;
  commitProject: (project: EditorProjectV2) => Promise<EditorProjectV2>;
}

export const createEditorData = async (
  input: CreateEditorDataInput
): Promise<CopyOnWriteDataResult> => {
  if (!input.project.assets[input.assetId]) {
    throw new Error('Editor data asset does not exist');
  }
  const locator = await writeEditorDataFile(
    input.packagePath,
    input.assetId,
    input.kind,
    input.value
  );
  const committedProject = await input.commitProject(
    input.attach(input.project, locator)
  );
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
  assetId: string;
  kind: EditorV2DataKind;
  expectedLocator: EditableDataLocator;
  commitProject: (project: EditorProjectV2) => Promise<EditorProjectV2>;
}

export const deleteEditorData = async (
  input: MutateEditorDataReferenceInput
): Promise<EditorProjectV2> => {
  const canonical = resolveAssetDataLocator(
    input.project,
    input.assetId,
    input.kind
  );
  if (!canonical || !locatorMatches(canonical, input.expectedLocator)) {
    throw new Error(
      'Expected data locator does not match the active asset data'
    );
  }
  const next = removeEditorDataLocator(input.project, canonical);
  const committed = await input.commitProject(next);
  await recoverOrphanEditorData(input.packagePath, committed);
  return committed;
};

export const resetEditorDataToV1 = async (
  input: MutateEditorDataReferenceInput
): Promise<EditorProjectV2> => {
  const canonical = resolveAssetDataLocator(
    input.project,
    input.assetId,
    input.kind
  );
  if (!canonical || !locatorMatches(canonical, input.expectedLocator)) {
    throw new Error(
      'Expected data locator does not match the active asset data'
    );
  }
  if (canonical.kind !== 'v2-data') {
    throw new Error('Only V2 data can be reset');
  }
  if (!canonical.provenance) {
    throw new Error('V2 data has no V1 provenance');
  }
  const next = replaceEditorDataLocator(
    input.project,
    canonical,
    canonical.provenance
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
