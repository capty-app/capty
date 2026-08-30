import { spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { shell } from 'electron';

import { buildCompleteAudioTimelinePlan } from '@/editor-v2/timeline/audio-plan';
import { getSequenceOutputDuration } from '@/editor-v2/timeline';
import { uploadFile } from '@/main/cloud';
import { readEditorData } from '@/main/editor-v2/data/v2-data-service';
import type { EditorProjectSession } from '@/main/editor-v2/project/project-service';
import { resolveAssetSourceLocator } from '@/main/editor-v2/media/media-service';
import {
  getSessionPackagePath,
  resolveAuthorizedMediaLocator,
} from '@/main/editor-v2/security/project-path-policy';
import { getFFmpegPath } from '@/main/utils/ffmpeg';
import { showNotification } from '@/main/utils/notifications';
import { getPublicAssetPath } from '@/main/utils/paths';
import {
  EDITOR_EXPORT_CHUNK_SIZE,
  type AudioTimelineRegionPlan,
  type EditorExportProgress,
  type EditorExportResult,
  type EditorExportSettings,
  type EditorExportSnapshot,
  type KeyboardSoundPlan,
  type MediaAsset,
} from '@/types/editor-v2';

import {
  createFfmpegAudioInputArgs,
  createFfmpegAudioRenderPlan,
} from './ffmpeg-audio-renderer';
import { RandomAccessFileSink } from './random-access-file-sink';

interface ExportEventTarget {
  send(channel: string, payload: unknown): void;
}

interface ExportJob {
  id: string;
  ownerId: number;
  target: ExportEventTarget;
  session: EditorProjectSession;
  snapshot: EditorExportSnapshot;
  outputPath: string;
  temporaryOutputPath: string;
  temporaryDirectory: string;
  videoPath: string;
  sink: RandomAccessFileSink;
  abortController: AbortController;
  child: ChildProcess | null;
  settled: boolean;
}

export interface StartExportJobInput {
  ownerId: number;
  target: ExportEventTarget;
  session: EditorProjectSession;
  expectedRevision: number;
  settings: EditorExportSettings;
  outputPath: string;
}

export interface ExportJobServiceDependencies {
  createId: () => string;
  createTemporaryDirectory: (jobId: string) => Promise<string>;
  createSink: (filePath: string) => RandomAccessFileSink;
  getFfmpegPath: () => string;
  spawnProcess: typeof spawn;
  uploadFile: (filePath: string, signal: AbortSignal) => Promise<string>;
  revealFile: (filePath: string) => void;
  notifyComplete: () => void;
  removePath: (filePath: string) => Promise<void>;
  renamePath: (source: string, destination: string) => Promise<void>;
  onJobEnded: (ownerId: number, jobId: string) => void;
}

const defaultRemovePath = async (filePath: string): Promise<void> => {
  await fs.rm(filePath, { recursive: true, force: true });
};

const defaultDependencies = (): ExportJobServiceDependencies => ({
  createId: () => crypto.randomUUID(),
  createTemporaryDirectory: jobId =>
    fs.mkdtemp(path.join(os.tmpdir(), `capty-editor-v2-${jobId}-`)),
  createSink: filePath => new RandomAccessFileSink(filePath),
  getFfmpegPath,
  spawnProcess: spawn,
  uploadFile,
  revealFile: filePath => shell.showItemInFolder(filePath),
  notifyComplete: () =>
    showNotification({
      title: 'Export Complete',
      body: 'Video exported successfully',
    }),
  removePath: defaultRemovePath,
  renamePath: fs.rename,
  onJobEnded: () => undefined,
});

const deepFreeze = <T>(value: T): T => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const audioStreamsForRegion = (
  asset: MediaAsset,
  region: AudioTimelineRegionPlan
): readonly { id: string }[] => {
  if (asset.kind === 'image') return [];
  if (asset.kind !== 'capty-recording' || !region.sourceRole) {
    return asset.audioStreams;
  }
  switch (region.sourceRole) {
    case 'system-audio':
      return asset.sources.systemAudio?.streams ?? [];
    case 'microphone-audio':
      return asset.sources.microphoneAudio?.streams ?? [];
    case 'primary':
      return asset.audioStreams;
    case 'camera-video':
      return [];
  }
};

const streamIndexForRegion = (
  asset: MediaAsset,
  region: AudioTimelineRegionPlan
): number => {
  if (!region.sourceStreamId) return 0;
  const index = audioStreamsForRegion(asset, region).findIndex(
    stream => stream.id === region.sourceStreamId
  );
  if (index < 0) throw new Error(`Audio stream ${region.sourceStreamId} is unavailable`);
  return index;
};

const keyboardSamplePath = (sound: KeyboardSoundPlan): string =>
  getPublicAssetPath(
    `sounds/keyboard/${sound.soundType}/press-${sound.sampleIndex + 1}.mp3`
  );

export class EditorExportJobService {
  private readonly jobs = new Map<string, ExportJob>();
  private readonly dependencies: ExportJobServiceDependencies;

  constructor(dependencies: Partial<ExportJobServiceDependencies> = {}) {
    this.dependencies = { ...defaultDependencies(), ...dependencies };
  }

  async start(input: StartExportJobInput): Promise<{
    jobId: string;
    snapshot: EditorExportSnapshot;
  }> {
    if (input.session.location.kind !== 'capty-package') {
      throw new Error('Create a Capty project before exporting');
    }
    const project = input.session.activeProject;
    if (!project) throw new Error('No active Editor V2 project');
    if (project.revision !== input.expectedRevision) {
      throw new Error('Save the latest project revision before exporting');
    }
    if (getSequenceOutputDuration(project) <= 0) {
      throw new Error('Add timeline media before exporting');
    }
    if ([...this.jobs.values()].some(job => job.ownerId === input.ownerId)) {
      throw new Error('An export is already running');
    }
    const jobId = this.dependencies.createId();
    const temporaryDirectory = await this.dependencies.createTemporaryDirectory(jobId);
    const videoPath = path.join(temporaryDirectory, 'video.mp4');
    const extension = input.settings.format;
    const temporaryOutputPath = `${input.outputPath}.${jobId}.tmp.${extension}`;
    const snapshot = deepFreeze<EditorExportSnapshot>({
      project: structuredClone(project),
      workspace: {
        previewFrameRate: structuredClone(input.settings.frameRate),
        exportSettings: structuredClone(input.settings),
      },
    });
    const job: ExportJob = {
      id: jobId,
      ownerId: input.ownerId,
      target: input.target,
      session: input.session,
      snapshot,
      outputPath: input.outputPath,
      temporaryOutputPath,
      temporaryDirectory,
      videoPath,
      sink: this.dependencies.createSink(videoPath),
      abortController: new AbortController(),
      child: null,
      settled: false,
    };
    this.jobs.set(jobId, job);
    this.sendProgress(job, 'preparing', 0, 1);
    return { jobId, snapshot };
  }

  async writeChunk(
    ownerId: number,
    jobId: string,
    data: Uint8Array,
    position: number
  ): Promise<void> {
    const job = this.getOwnedJob(ownerId, jobId);
    if (job.abortController.signal.aborted) throw new Error('Export cancelled');
    if (data.byteLength > EDITOR_EXPORT_CHUNK_SIZE) {
      throw new Error('Export chunk exceeds the bounded transfer size');
    }
    await job.sink.write(data, position);
  }

  reportRendererProgress(
    ownerId: number,
    progress: EditorExportProgress
  ): void {
    const job = this.getOwnedJob(ownerId, progress.jobId);
    if (progress.stage !== 'video') return;
    if (
      !Number.isFinite(progress.completed) ||
      !Number.isFinite(progress.total) ||
      progress.completed < 0 ||
      progress.total <= 0 ||
      progress.completed > progress.total
    ) {
      return;
    }
    this.sendProgress(job, 'video', progress.completed, progress.total);
  }

  async finish(ownerId: number, jobId: string): Promise<void> {
    const job = this.getOwnedJob(ownerId, jobId);
    await job.sink.close();
    void this.finalize(job);
  }

  async cancel(
    ownerId: number,
    jobId: string,
    failure?: string
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.ownerId !== ownerId || job.settled) return false;
    job.abortController.abort();
    job.child?.kill('SIGTERM');
    try {
      await job.sink.close();
    } catch {
      return this.complete(job, {
        jobId,
        status: failure ? 'failed' : 'cancelled',
        error: failure,
      });
    }
    return this.complete(job, {
      jobId,
      status: failure ? 'failed' : 'cancelled',
      error: failure,
    });
  }

  hasActiveJob(ownerId: number): boolean {
    return [...this.jobs.values()].some(
      job => job.ownerId === ownerId && !job.settled
    );
  }

  private getOwnedJob(ownerId: number, jobId: string): ExportJob {
    const job = this.jobs.get(jobId);
    if (!job || job.ownerId !== ownerId || job.settled) {
      throw new Error('Export job is unavailable');
    }
    return job;
  }

  private sendProgress(
    job: ExportJob,
    stage: EditorExportProgress['stage'],
    completed: number,
    total: number
  ): void {
    job.target.send('editor-v2:export:progress', {
      jobId: job.id,
      stage,
      completed,
      total,
    } satisfies EditorExportProgress);
  }

  private async finalize(job: ExportJob): Promise<void> {
    try {
      this.throwIfCancelled(job);
      if (job.snapshot.workspace.exportSettings.format === 'gif') {
        this.sendProgress(job, 'gif', 0, 1);
        await this.runFfmpeg(job, this.gifArguments(job));
        this.sendProgress(job, 'gif', 1, 1);
      } else {
        this.sendProgress(job, 'audio', 0, 1);
        const argumentsForMux = await this.mp4Arguments(job);
        this.throwIfCancelled(job);
        this.sendProgress(job, 'muxing', 0, 1);
        await this.runFfmpeg(job, argumentsForMux);
        this.sendProgress(job, 'audio', 1, 1);
        this.sendProgress(job, 'muxing', 1, 1);
      }
      this.throwIfCancelled(job);
      this.sendProgress(job, 'finalizing', 0, 1);
      await this.dependencies.renamePath(
        job.temporaryOutputPath,
        job.outputPath
      );
      const settings = job.snapshot.workspace.exportSettings;
      let uploadUrl: string | undefined;
      if (settings.uploadWhenComplete) {
        this.sendProgress(job, 'uploading', 0, 1);
        uploadUrl = await this.dependencies.uploadFile(
          job.outputPath,
          job.abortController.signal
        );
        this.sendProgress(job, 'uploading', 1, 1);
      }
      this.throwIfCancelled(job);
      if (settings.revealWhenComplete) this.dependencies.revealFile(job.outputPath);
      this.dependencies.notifyComplete();
      this.sendProgress(job, 'finalizing', 1, 1);
      await this.complete(job, {
        jobId: job.id,
        status: 'completed',
        outputToken: job.id,
        uploadUrl,
      });
    } catch (error) {
      if (job.settled) return;
      await this.complete(job, {
        jobId: job.id,
        status: job.abortController.signal.aborted ? 'cancelled' : 'failed',
        error: job.abortController.signal.aborted ? undefined : errorMessage(error),
      });
    }
  }

  private async mp4Arguments(job: ExportJob): Promise<string[]> {
    const project = job.snapshot.project;
    const packagePath = getSessionPackagePath(job.session);
    const audioTimeline = await buildCompleteAudioTimelinePlan(
      project,
      async locator => {
        const data = await readEditorData(
          packagePath,
          project,
          'keyboard',
          locator
        );
        if (data.kind !== 'keyboard') throw new Error('Keyboard data is invalid');
        return data;
      }
    );
    const resolvedPaths = new Map<string, string>();
    for (const region of audioTimeline.regions) {
      const asset = project.assets[region.assetId];
      if (!asset) throw new Error(`Asset ${region.assetId} does not exist`);
      const locator = resolveAssetSourceLocator(
        asset,
        region.sourceStreamId,
        region.sourceRole
      );
      resolvedPaths.set(
        region.id,
        await resolveAuthorizedMediaLocator(job.session, locator)
      );
    }
    const plan = createFfmpegAudioRenderPlan(audioTimeline, {
      resolveMedia: region => {
        const asset = project.assets[region.assetId];
        const resolvedPath = resolvedPaths.get(region.id);
        if (!asset || !resolvedPath) throw new Error('Audio source is unavailable');
        return {
          path: resolvedPath,
          streamIndex: streamIndexForRegion(asset, region),
        };
      },
      resolveKeyboardSample: sound => ({ path: keyboardSamplePath(sound) }),
    });
    const videoInputIndex = plan.inputs.length;
    return [
      '-nostdin',
      '-y',
      ...createFfmpegAudioInputArgs(plan),
      '-i',
      job.videoPath,
      '-filter_complex',
      plan.filterComplex,
      '-map',
      `${videoInputIndex}:v:0`,
      '-map',
      `[${plan.outputLabel}]`,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-t',
      String(plan.durationSeconds),
      job.temporaryOutputPath,
    ];
  }

  private gifArguments(job: ExportJob): string[] {
    return [
      '-nostdin',
      '-y',
      '-i',
      job.videoPath,
      '-filter_complex',
      '[0:v]split[gif-source][palette-source];[palette-source]palettegen=stats_mode=diff[palette];[gif-source][palette]paletteuse=dither=sierra2_4a',
      '-an',
      job.temporaryOutputPath,
    ];
  }

  private runFfmpeg(job: ExportJob, args: string[]): Promise<void> {
    this.throwIfCancelled(job);
    return new Promise((resolve, reject) => {
      const child = this.dependencies.spawnProcess(
        this.dependencies.getFfmpegPath(),
        args,
        { stdio: ['ignore', 'ignore', 'pipe'] }
      );
      job.child = child;
      let stderr = '';
      child.stderr?.on('data', chunk => {
        if (stderr.length < 32_768) stderr += String(chunk);
      });
      child.once('error', reject);
      child.once('close', code => {
        job.child = null;
        if (job.abortController.signal.aborted) {
          reject(new Error('Export cancelled'));
          return;
        }
        if (code !== 0) {
          reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
  }

  private throwIfCancelled(job: ExportJob): void {
    if (job.abortController.signal.aborted) throw new Error('Export cancelled');
  }

  private async complete(job: ExportJob, result: EditorExportResult): Promise<boolean> {
    if (job.settled) return false;
    job.settled = true;
    this.jobs.delete(job.id);
    job.target.send('editor-v2:export:complete', result);
    this.dependencies.onJobEnded(job.ownerId, job.id);
    await Promise.all([
      this.dependencies.removePath(job.temporaryDirectory),
      result.status === 'completed'
        ? Promise.resolve()
        : this.dependencies.removePath(job.temporaryOutputPath),
    ]);
    return true;
  }
}
