import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createV1ImportManifest,
  fingerprintManifest,
  LegacyDataReader,
} from '@/main/editor-v2/data/legacy-data-reader';

const temporaryDirectories: string[] = [];

const createPackage = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capty-legacy-reader-'));
  temporaryDirectories.push(root);
  const packagePath = path.join(root, 'Project.capty');
  await fs.mkdir(packagePath);
  return packagePath;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('legacy data reader', () => {
  it('creates a deterministic recursive byte manifest', async () => {
    const packagePath = await createPackage();
    await fs.mkdir(path.join(packagePath, 'music'));
    await fs.writeFile(path.join(packagePath, 'recording.mov'), 'recording');
    await fs.writeFile(path.join(packagePath, 'state.json'), 'state');
    await fs.writeFile(path.join(packagePath, 'music', 'song.m4a'), 'music');

    const first = await createV1ImportManifest(packagePath);
    const second = await createV1ImportManifest(packagePath);
    expect(first.map(file => file.relativePath)).toEqual([
      path.join('music', 'song.m4a'),
      'recording.mov',
      'state.json',
    ]);
    expect(fingerprintManifest(first)).toBe(fingerprintManifest(second));

    await fs.writeFile(path.join(packagePath, 'state.json'), 'changed');
    const changed = await createV1ImportManifest(packagePath);
    expect(fingerprintManifest(changed)).not.toBe(fingerprintManifest(first));
  });

  it('validates cursor, keyboard, and subtitle sources independently', async () => {
    const packagePath = await createPackage();
    await fs.writeFile(
      path.join(packagePath, 'cursor.json'),
      JSON.stringify({ invalid: true })
    );
    await fs.writeFile(
      path.join(packagePath, 'keys.json'),
      JSON.stringify({
        events: [
          {
            timestamp: 0,
            key: 'a',
            keyCode: 0,
            modifiers: [],
            type: 'down',
          },
        ],
        meta: {
          startTime: '2026-08-30T00:00:00.000Z',
          duration: 1,
          sampleRate: 60,
        },
      })
    );
    await fs.writeFile(path.join(packagePath, 'subtitle.json'), '{invalid');

    const reader = new LegacyDataReader(packagePath);
    await expect(reader.readCursor('cursor.json')).resolves.toEqual({
      diagnostic: { code: 'malformed', relativePath: 'cursor.json' },
    });
    const keyboard = await reader.readKeyboard('keys.json');
    expect(keyboard.locator).toMatchObject({
      kind: 'v1-read-only',
      relativePath: 'keys.json',
    });
    await expect(reader.readSubtitles('subtitle.json')).resolves.toEqual({
      diagnostic: { code: 'malformed', relativePath: 'subtitle.json' },
    });
    await expect(reader.readCursor('missing.json')).resolves.toEqual({
      diagnostic: { code: 'missing', relativePath: 'missing.json' },
    });
  });

  it('rejects non-finite and out-of-range sidecar fields independently', async () => {
    const packagePath = await createPackage();
    await fs.writeFile(
      path.join(packagePath, 'cursor.json'),
      '{"recordingArea":{"width":1920,"height":1080},"events":[],"meta":{"startTime":"2026-08-30T00:00:00.000Z","duration":1,"sampleRate":1e400}}'
    );
    await fs.writeFile(
      path.join(packagePath, 'keys.json'),
      '{"events":[{"timestamp":0,"key":"a","keyCode":1e400,"modifiers":[],"type":"down"}],"meta":{"startTime":"2026-08-30T00:00:00.000Z","duration":1,"sampleRate":60}}'
    );
    await fs.writeFile(
      path.join(packagePath, 'subtitle.json'),
      JSON.stringify({
        segments: [
          {
            start: 1,
            end: 2,
            text: 'word',
            words: [{ text: 'word', start: 0, end: 2 }],
          },
        ],
        meta: {
          generatedAt: '2026-08-30T00:00:00.000Z',
          language: 'en',
          model: 'manual',
        },
      })
    );

    const reader = new LegacyDataReader(packagePath);
    for (const result of await Promise.all([
      reader.readCursor('cursor.json'),
      reader.readKeyboard('keys.json'),
      reader.readSubtitles('subtitle.json'),
    ])) {
      expect(result.diagnostic?.code).toBe('malformed');
      expect(result.locator).toBeUndefined();
    }
  });

  it('rejects traversal before reading', async () => {
    const packagePath = await createPackage();
    const reader = new LegacyDataReader(packagePath);
    await expect(reader.readCursor('../outside.json')).rejects.toThrow(
      'escapes the package root'
    );
  });
});
