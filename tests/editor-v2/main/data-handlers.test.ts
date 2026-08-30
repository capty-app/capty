import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import type { CreateEditorDataInput } from '@/main/editor-v2/data/v2-data-service';
import type { V2DataLocator } from '@/types/editor-v2';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const authorizeEditorV2Sender = vi.fn();
const readEditorData = vi.fn();
const writeEditorDataCopyOnWrite = vi.fn();
const createEditorData = vi.fn();
const deleteEditorData = vi.fn();
const resetEditorDataToV1 = vi.fn();
const showOpenDialog = vi.fn();
const resolveAuthorizedMediaLocator = vi.fn();
const ensureWhisperReady = vi.fn();
const transcribeAudio = vi.fn();
const readActiveProject = vi.fn();
const runProjectMutation = vi.fn(
  async (
    _session: unknown,
    _expectedRevision: number,
    operation: (
      project: unknown,
      commitProject: (project: unknown) => Promise<unknown>
    ) => Promise<unknown>
  ) =>
    operation(readActiveProject(), async candidate => ({
      ...(candidate as object),
      revision: _expectedRevision + 1,
    }))
);

vi.mock('electron', () => ({
  dialog: { showOpenDialog },
  ipcMain: {
    handle: vi.fn(
      (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }
    ),
  },
}));

vi.mock('@/main/capture/video/window-manager', () => ({
  editorProjectService: {
    readActiveProject,
    runProjectMutation,
  },
}));

vi.mock('@/main/editor-v2/security/editor-sender-policy', () => ({
  authorizeEditorV2Sender,
}));

vi.mock('@/main/editor-v2/data/v2-data-service', () => ({
  createEditorData,
  readEditorData,
  writeEditorDataCopyOnWrite,
  deleteEditorData,
  resetEditorDataToV1,
}));

vi.mock('@/main/editor-v2/data/legacy-data-reader', () => ({
  isValidCursorData: vi.fn(() => true),
  isValidSubtitleData: vi.fn(() => true),
  validateKeyboardData: vi.fn(() => true),
}));

vi.mock('@/main/editor-v2/security/project-path-policy', () => ({
  resolveAuthorizedMediaLocator,
}));

vi.mock('@/main/transcription/whisper-transcribe', () => ({
  transcribeAudio,
}));

vi.mock('@/main/utils/whisper', () => ({
  ensureWhisperReady,
}));

const event = { sender: { id: 42 } };
const locator = {
  kind: 'v1-read-only' as const,
  relativePath: 'cursor.json',
  fingerprint: { byteLength: 10, sha256: 'cursor' },
};
const project = { revision: 3 };
const session = {
  location: { kind: 'capty-package', packagePath: '/Project.capty' },
};
const authorization = { session, data: { window: {} } };
const subtitleLocator: V2DataLocator = {
  kind: 'v2-data',
  relativePath: 'data/asset/subtitles-created.json',
  fingerprint: { byteLength: 100, sha256: 'created' },
};

const createCaptyProject = () => {
  const value = createEmptyEditorProject({
    id: 'project',
    name: 'Project',
    createdAt: '2026-09-01T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  value.revision = 3;
  value.assets.asset = {
    id: 'asset',
    kind: 'capty-recording',
    name: 'Recording',
    locator: {
      kind: 'legacy-package-read-only',
      relativePath: 'recording.mov',
      fingerprint: { byteLength: 9, sha256: 'recording' },
    },
    importedAt: '2026-09-01T00:00:00.000Z',
    durationTicks: 90_000,
    width: 1920,
    height: 1080,
    frameRate: { numerator: 30, denominator: 1 },
    videoStreams: [],
    audioStreams: [],
    sources: {
      microphoneAudio: {
        locator: {
          kind: 'legacy-package-read-only',
          relativePath: 'microphone.m4a',
          fingerprint: { byteLength: 10, sha256: 'microphone' },
        },
        recordingOffsetTicks: 0,
      },
    },
  };
  value.sequence.clips.clip = {
    id: 'clip',
    kind: 'video',
    trackId: 'video',
    assetId: 'asset',
    name: 'Recording',
    timelineStart: 0,
    timelineDuration: 90_000,
    sourceStart: 0,
    sourceDuration: 90_000,
    playbackRate: { numerator: 1, denominator: 1 },
    sourceStreamId: 'screen',
    effects: [],
  };
  value.sequence.tracks.video.clipIds.push('clip');
  return value;
};

beforeEach(async () => {
  vi.clearAllMocks();
  handlers.clear();
  vi.resetModules();
  const { registerEditorV2DataHandlers } =
    await import('@/main/editor-v2/ipc/data-handlers');
  registerEditorV2DataHandlers();
});

describe('Editor V2 data handlers', () => {
  it('registers only narrow data capabilities and rejects unauthorized senders', async () => {
    expect([...handlers.keys()].sort()).toEqual([
      'editor-v2:data:delete',
      'editor-v2:data:generate-subtitles',
      'editor-v2:data:import-cursor',
      'editor-v2:data:import-subtitles',
      'editor-v2:data:read',
      'editor-v2:data:reset',
      'editor-v2:data:write',
    ]);
    authorizeEditorV2Sender.mockResolvedValue(null);

    await expect(
      handlers.get('editor-v2:data:read')?.(event, {
        projectToken: 'token',
        kind: 'cursor',
        locator,
      })
    ).resolves.toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Unauthorized'),
    });
    expect(readEditorData).not.toHaveBeenCalled();
  });

  it('authorizes reads against the active package and locator', async () => {
    authorizeEditorV2Sender.mockResolvedValue(authorization);
    readActiveProject.mockReturnValue(project);
    readEditorData.mockResolvedValue({ kind: 'cursor', value: { events: [] } });

    await expect(
      handlers.get('editor-v2:data:read')?.(event, {
        projectToken: 'token',
        kind: 'cursor',
        locator,
      })
    ).resolves.toEqual({
      status: 'loaded',
      data: { kind: 'cursor', value: { events: [] } },
    });
    expect(readEditorData).toHaveBeenCalledWith(
      '/Project.capty',
      project,
      'cursor',
      locator
    );
  });

  it('routes writes through copy-on-write and returns the committed revision', async () => {
    const committed = { revision: 4 };
    authorizeEditorV2Sender.mockResolvedValue(authorization);
    readActiveProject.mockReturnValue(project);
    writeEditorDataCopyOnWrite.mockResolvedValue({ project: committed });

    await expect(
      handlers.get('editor-v2:data:write')?.(event, {
        projectToken: 'token',
        expectedRevision: 3,
        assetId: 'asset',
        kind: 'cursor',
        locator,
        value: {
          kind: 'cursor',
          value: {
            recordingArea: { width: 1, height: 1 },
            events: [],
            meta: {
              startTime: '2026-09-01T00:00:00.000Z',
              duration: 0,
              sampleRate: 60,
            },
          },
        },
      })
    ).resolves.toEqual({ status: 'updated', project: committed, revision: 4 });
    expect(writeEditorDataCopyOnWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        packagePath: '/Project.capty',
        assetId: 'asset',
        kind: 'cursor',
        expectedLocator: locator,
      })
    );
    expect(runProjectMutation).toHaveBeenCalledWith(
      session,
      3,
      expect.any(Function)
    );
  });

  it('imports subtitles through V2 creation and attaches canonical references', async () => {
    const active = createCaptyProject();
    authorizeEditorV2Sender.mockResolvedValue(authorization);
    readActiveProject.mockReturnValue(active);
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/subtitles.srt'],
    });
    vi.spyOn(fs, 'readFile').mockResolvedValueOnce(
      '1\n00:00:00,000 --> 00:00:01,000\nHello\n'
    );
    createEditorData.mockImplementation(
      async (input: CreateEditorDataInput) => {
        const attached = input.attach(input.project, subtitleLocator);
        const committed = await input.commitProject(attached);
        return { project: committed, locator: subtitleLocator };
      }
    );

    const result = await handlers.get('editor-v2:data:import-subtitles')?.(
      event,
      {
        projectToken: 'token',
        expectedRevision: 3,
        assetId: 'asset',
      }
    );

    expect(result).toMatchObject({ status: 'updated', revision: 4 });
    const updated = (
      result as { project: ReturnType<typeof createCaptyProject> }
    ).project;
    const asset = updated.assets.asset;
    expect(asset.kind).toBe('capty-recording');
    if (asset.kind !== 'capty-recording') return;
    expect(asset.sources.subtitles?.locator).toEqual(subtitleLocator);
    expect(updated.sequence.clips.clip.effects).toEqual([
      expect.objectContaining({ kind: 'subtitle', data: subtitleLocator }),
    ]);
    expect(createEditorData).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'subtitles', assetId: 'asset' })
    );
  });

  it('imports cursor data through canonical copy-on-write', async () => {
    const active = createCaptyProject();
    const cursorData = {
      recordingArea: { width: 1920, height: 1080 },
      events: [{ timestamp: 0, x: 0.1, y: 0.2, type: 'move' }],
      meta: {
        startTime: '2026-09-01T00:00:00.000Z',
        duration: 1,
        sampleRate: 60,
      },
    };
    authorizeEditorV2Sender.mockResolvedValue(authorization);
    readActiveProject.mockReturnValue(active);
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/cursor.json'],
    });
    vi.spyOn(fs, 'readFile').mockResolvedValueOnce(JSON.stringify(cursorData));
    writeEditorDataCopyOnWrite.mockResolvedValue({
      project: { ...active, revision: 4 },
      locator: subtitleLocator,
    });

    const result = await handlers.get('editor-v2:data:import-cursor')?.(event, {
      projectToken: 'token',
      expectedRevision: 3,
      assetId: 'asset',
      kind: 'cursor',
      locator,
    });

    expect(result).toMatchObject({ status: 'updated', revision: 4 });
    expect(writeEditorDataCopyOnWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset',
        kind: 'cursor',
        expectedLocator: locator,
        value: cursorData,
      })
    );
  });

  it('generates subtitles outside the project queue and commits through V2 creation', async () => {
    const active = createCaptyProject();
    const subtitles = {
      segments: [{ start: 0, end: 1, text: 'Generated' }],
      meta: {
        generatedAt: '2026-09-01T00:00:00.000Z',
        language: 'en',
        model: 'base' as const,
      },
    };
    authorizeEditorV2Sender.mockResolvedValue(authorization);
    readActiveProject.mockReturnValue(active);
    resolveAuthorizedMediaLocator.mockResolvedValue(
      '/Project.capty/microphone.m4a'
    );
    transcribeAudio.mockResolvedValue({ success: true, data: subtitles });
    createEditorData.mockImplementation(
      async (input: CreateEditorDataInput) => {
        const attached = input.attach(input.project, subtitleLocator);
        const committed = await input.commitProject(attached);
        return { project: committed, locator: subtitleLocator };
      }
    );

    const result = await handlers.get('editor-v2:data:generate-subtitles')?.(
      event,
      {
        projectToken: 'token',
        expectedRevision: 3,
        assetId: 'asset',
        model: 'base',
      }
    );

    expect(result).toMatchObject({ status: 'updated', revision: 4 });
    expect(ensureWhisperReady).toHaveBeenCalledWith(
      'base',
      expect.any(Function)
    );
    expect(transcribeAudio).toHaveBeenCalledWith(
      '/Project.capty/microphone.m4a',
      { model: 'base', prompt: undefined },
      expect.any(Function)
    );
    expect(ensureWhisperReady.mock.invocationCallOrder[0]).toBeLessThan(
      runProjectMutation.mock.invocationCallOrder.at(-1) ?? 0
    );
  });
});
