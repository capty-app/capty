import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { analyzeEqualizerAudio } from '../equalizer-analysis';
import { getWindowData } from '../window-manager';
import {
  getMicAudioPath,
  getMusicFolderPath,
  getProjectFolder,
  getSystemAudioPath,
} from '../recording-project';
import type {
  AudioAnalysisData,
  EqualizerAudioSource,
} from '@/types/equalizer';
import { SUPPORTED_MUSIC_EXTENSIONS } from '@/types/music';

interface EqualizerAnalysisResult {
  success: boolean;
  analysis?: AudioAnalysisData;
  error?: string;
}

interface AnalysisJob<T> {
  signal: AbortSignal;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  handleAbort: () => void;
}

const MAX_CONCURRENT_ANALYSES = 2;
const analysisQueue: AnalysisJob<unknown>[] = [];
const analysisControllers = new Map<string, AbortController>();
let activeAnalyses = 0;

function createAbortError(): Error {
  const error = new Error('Audio analysis cancelled');
  error.name = 'AbortError';
  return error;
}

function runNextAnalysis(): void {
  while (activeAnalyses < MAX_CONCURRENT_ANALYSES && analysisQueue.length > 0) {
    const job = analysisQueue.shift();
    if (!job) return;

    job.signal.removeEventListener('abort', job.handleAbort);
    if (job.signal.aborted) {
      job.reject(createAbortError());
      continue;
    }

    activeAnalyses++;
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        activeAnalyses--;
        runNextAnalysis();
      });
  }
}

function scheduleAnalysis<T>(
  signal: AbortSignal,
  run: () => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const job: AnalysisJob<T> = {
      signal,
      run,
      resolve,
      reject,
      handleAbort: () => {
        const index = analysisQueue.indexOf(job as AnalysisJob<unknown>);
        if (index < 0) return;
        analysisQueue.splice(index, 1);
        reject(createAbortError());
      },
    };

    signal.addEventListener('abort', job.handleAbort, { once: true });
    analysisQueue.push(job as AnalysisJob<unknown>);
    runNextAnalysis();
  });
}

function isEqualizerAudioSource(value: unknown): value is EqualizerAudioSource {
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;

  switch (source.type) {
    case 'system':
    case 'mic':
      return true;
    case 'music':
      return (
        typeof source.fileName === 'string' &&
        source.fileName.length > 0 &&
        source.fileName.length <= 255
      );
    default:
      return false;
  }
}

async function resolveRegularFile(filePath: string): Promise<string | null> {
  try {
    const resolvedPath = await fs.realpath(filePath);
    const fileStats = await fs.stat(resolvedPath);
    return fileStats.isFile() ? resolvedPath : null;
  } catch {
    return null;
  }
}

async function resolveOwnedRegularFile(
  filePath: string,
  ownerDirectory: string
): Promise<string | null> {
  const resolvedDirectory = await fs.realpath(ownerDirectory).catch(() => null);
  const resolvedFile = await resolveRegularFile(filePath);
  if (!resolvedDirectory || !resolvedFile) return null;
  return path.dirname(resolvedFile) === resolvedDirectory ? resolvedFile : null;
}

export async function resolveEqualizerAudioPath(
  senderId: number,
  source: EqualizerAudioSource
): Promise<string | null> {
  const data = getWindowData(senderId);
  if (!data) return null;

  const ownerDirectory =
    getProjectFolder(data.filePath) ?? path.dirname(data.filePath);

  switch (source.type) {
    case 'system': {
      const sidecarPath = await resolveOwnedRegularFile(
        getSystemAudioPath(data.filePath),
        ownerDirectory
      );
      if (sidecarPath) return sidecarPath;
      return data.mediaPaths.video
        ? resolveRegularFile(data.mediaPaths.video)
        : null;
    }
    case 'mic':
      return resolveOwnedRegularFile(
        getMicAudioPath(data.filePath),
        ownerDirectory
      );
    case 'music': {
      const safeFileName = path.basename(source.fileName);
      if (safeFileName !== source.fileName) return null;

      const extension = path.extname(safeFileName).slice(1).toLowerCase();
      if (!SUPPORTED_MUSIC_EXTENSIONS.includes(extension)) return null;

      const musicFolder = getMusicFolderPath(data.filePath);
      if (!musicFolder) return null;

      const resolvedFolder = await fs.realpath(musicFolder).catch(() => null);
      const resolvedFile = await resolveRegularFile(
        path.join(musicFolder, safeFileName)
      );
      if (!resolvedFolder || !resolvedFile) return null;
      if (path.dirname(resolvedFile) !== resolvedFolder) return null;
      return resolvedFile;
    }
  }
}

export function registerEqualizerHandlers(): void {
  ipcMain.on(
    'video-editor:equalizer:cancel',
    (event, { requestId }: { requestId?: unknown }) => {
      if (
        typeof requestId !== 'string' ||
        requestId.length === 0 ||
        requestId.length > 128
      ) {
        return;
      }
      analysisControllers.get(`${event.sender.id}:${requestId}`)?.abort();
    }
  );

  ipcMain.handle(
    'video-editor:equalizer:analyze',
    async (
      event,
      { requestId, source }: { requestId?: unknown; source?: unknown } = {}
    ): Promise<EqualizerAnalysisResult> => {
      if (
        typeof requestId !== 'string' ||
        requestId.length === 0 ||
        requestId.length > 128 ||
        !isEqualizerAudioSource(source)
      ) {
        return { success: false, error: 'Invalid audio analysis request' };
      }

      const controllerKey = `${event.sender.id}:${requestId}`;
      if (analysisControllers.has(controllerKey)) {
        return {
          success: false,
          error: 'Audio analysis request already exists',
        };
      }

      const controller = new AbortController();
      const handleDestroyed = () => controller.abort();
      analysisControllers.set(controllerKey, controller);
      event.sender.once('destroyed', handleDestroyed);

      try {
        const inputPath = await resolveEqualizerAudioPath(
          event.sender.id,
          source
        );
        if (!inputPath) {
          return { success: false, error: 'Audio source is unavailable' };
        }

        const analysis = await scheduleAnalysis(controller.signal, () =>
          analyzeEqualizerAudio(inputPath, controller.signal)
        );
        return { success: true, analysis };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Audio analysis failed',
        };
      } finally {
        analysisControllers.delete(controllerKey);
        event.sender.removeListener('destroyed', handleDestroyed);
      }
    }
  );
}
