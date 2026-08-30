import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';

import { resolveProjectRelativePath } from '../project/project-paths';
import { validateCursorData, type CursorData } from '@/types/cursor';
import type { KeyboardData } from '@/types/keyboard';
import { validateSubtitleData, type SubtitleData } from '@/types/subtitle';
import type {
  MediaFingerprint,
  V1ImportManifestEntry,
  V1ReadOnlyDataLocator,
} from '@/types/editor-v2';

export interface LegacyDataDiagnostic {
  code: 'missing' | 'malformed';
  relativePath: string;
}

export interface LegacyDataReadResult<T> {
  data?: T;
  locator?: V1ReadOnlyDataLocator;
  diagnostic?: LegacyDataDiagnostic;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidCursorData = (value: unknown): value is CursorData => {
  const validation = validateCursorData(value);
  if (!validation.valid || !validation.data) return false;
  return (
    Number.isFinite(validation.data.recordingArea.width) &&
    validation.data.recordingArea.width > 0 &&
    Number.isFinite(validation.data.recordingArea.height) &&
    validation.data.recordingArea.height > 0 &&
    Number.isFinite(Date.parse(validation.data.meta.startTime)) &&
    Number.isFinite(validation.data.meta.duration) &&
    validation.data.meta.duration >= 0 &&
    Number.isFinite(validation.data.meta.sampleRate) &&
    validation.data.meta.sampleRate > 0 &&
    validation.data.events.every(
      event =>
        Number.isFinite(event.timestamp) &&
        event.timestamp >= 0 &&
        Number.isFinite(event.x) &&
        Number.isFinite(event.y) &&
        (!event.scrollDelta ||
          (Number.isFinite(event.scrollDelta.x) &&
            Number.isFinite(event.scrollDelta.y)))
    )
  );
};

const isValidSubtitleData = (value: unknown): value is SubtitleData => {
  const validation = validateSubtitleData(value);
  if (!validation.valid || !validation.data) return false;
  return validation.data.segments.every(
    segment =>
      Number.isFinite(segment.start) &&
      segment.start >= 0 &&
      Number.isFinite(segment.end) &&
      segment.end > segment.start &&
      (segment.words?.every(
        word =>
          Number.isFinite(word.start) &&
          word.start >= segment.start &&
          Number.isFinite(word.end) &&
          word.end >= word.start &&
          word.end <= segment.end
      ) ??
        true)
  );
};

const validateKeyboardData = (value: unknown): value is KeyboardData => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.events) ||
    !isRecord(value.meta)
  ) {
    return false;
  }

  const validMeta =
    typeof value.meta.startTime === 'string' &&
    Number.isFinite(Date.parse(value.meta.startTime)) &&
    typeof value.meta.duration === 'number' &&
    Number.isFinite(value.meta.duration) &&
    value.meta.duration >= 0 &&
    typeof value.meta.sampleRate === 'number' &&
    Number.isFinite(value.meta.sampleRate) &&
    value.meta.sampleRate > 0;
  if (!validMeta) return false;

  return value.events.every(event => {
    if (!isRecord(event)) return false;
    return (
      typeof event.timestamp === 'number' &&
      Number.isFinite(event.timestamp) &&
      event.timestamp >= 0 &&
      typeof event.key === 'string' &&
      typeof event.keyCode === 'number' &&
      Number.isFinite(event.keyCode) &&
      Array.isArray(event.modifiers) &&
      event.modifiers.every(
        modifier =>
          modifier === 'command' ||
          modifier === 'control' ||
          modifier === 'option' ||
          modifier === 'shift' ||
          modifier === 'fn'
      ) &&
      (event.type === 'down' || event.type === 'up')
    );
  });
};

export const fingerprintFile = async (
  filePath: string
): Promise<MediaFingerprint> => {
  const [buffer, stats] = await Promise.all([
    fs.readFile(filePath),
    fs.stat(filePath),
  ]);
  return {
    byteLength: stats.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    modifiedAt: stats.mtime.toISOString(),
  };
};

const collectRelativeFiles = async (
  root: string,
  directory: string,
  output: string[]
): Promise<void> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectRelativeFiles(root, absolutePath, output);
      continue;
    }
    if (entry.isFile()) output.push(path.relative(root, absolutePath));
  }
};

export const createV1ImportManifest = async (
  packagePath: string
): Promise<V1ImportManifestEntry[]> => {
  const relativePaths: string[] = [];
  await collectRelativeFiles(packagePath, packagePath, relativePaths);
  relativePaths.sort((left, right) => left.localeCompare(right));
  return Promise.all(
    relativePaths.map(async relativePath => ({
      relativePath,
      fingerprint: await fingerprintFile(
        resolveProjectRelativePath(packagePath, relativePath)
      ),
    }))
  );
};

export const fingerprintManifest = (files: V1ImportManifestEntry[]): string => {
  const hash = createHash('sha256');
  files.forEach(file => {
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(String(file.fingerprint.byteLength));
    hash.update('\0');
    hash.update(file.fingerprint.sha256);
    hash.update('\0');
  });
  return hash.digest('hex');
};

export class LegacyDataReader {
  constructor(private readonly packagePath: string) {}

  async locateFile(relativePath: string): Promise<LegacyDataReadResult<never>> {
    const absolutePath = resolveProjectRelativePath(
      this.packagePath,
      relativePath
    );
    try {
      return {
        locator: {
          kind: 'v1-read-only',
          relativePath,
          fingerprint: await fingerprintFile(absolutePath),
        },
      };
    } catch {
      return { diagnostic: { code: 'missing', relativePath } };
    }
  }

  async readJson<T>(
    relativePath: string,
    validate: (value: unknown) => value is T
  ): Promise<LegacyDataReadResult<T>> {
    const absolutePath = resolveProjectRelativePath(
      this.packagePath,
      relativePath
    );

    try {
      const value: unknown = JSON.parse(
        await fs.readFile(absolutePath, 'utf-8')
      );
      if (!validate(value)) {
        return {
          diagnostic: { code: 'malformed', relativePath },
        };
      }

      return {
        data: value,
        locator: {
          kind: 'v1-read-only',
          relativePath,
          fingerprint: await fingerprintFile(absolutePath),
        },
      };
    } catch (error) {
      const code =
        isRecord(error) && error.code === 'ENOENT' ? 'missing' : 'malformed';
      return { diagnostic: { code, relativePath } };
    }
  }

  readCursor(relativePath: string): Promise<LegacyDataReadResult<CursorData>> {
    return this.readJson(relativePath, isValidCursorData);
  }

  readKeyboard(
    relativePath: string
  ): Promise<LegacyDataReadResult<KeyboardData>> {
    return this.readJson(relativePath, validateKeyboardData);
  }

  readSubtitles(
    relativePath: string
  ): Promise<LegacyDataReadResult<SubtitleData>> {
    return this.readJson(relativePath, isValidSubtitleData);
  }
}
