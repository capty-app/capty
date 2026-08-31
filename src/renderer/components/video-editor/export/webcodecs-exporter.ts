import {
  Input,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  VideoSampleSink,
  ALL_FORMATS,
  type VideoSample,
  type InputVideoTrack,
} from 'mediabunny';
import { VideoCompositionEngine } from '../composition';
import { calculateDeviceFrameLayout } from '../composition/device-frame-canvas-renderer';
import { getTotalTimelineDuration, timelineToVideo } from '../utils';
import { calculateBitrate } from './bitrate';
import { calculateExportDimensions } from './export-dimensions';
import { muxAudioWithVideo } from './audio-muxer';
import { createFileSource, loadImage, writeBuffer } from './file-utils';
import type { ExportOptions, ExportResult, AudioTrack } from './export-types';
import type { MusicTrack } from '@/types/music';
import { PREFETCH_BATCH_SIZE } from './export-types';

export type { ExportOptions, ExportResult } from './export-types';

type PrefetchedFrame = {
  timelineTime: number;
  videoSample: VideoSample | null;
  cameraSample: VideoSample | null;
};

export class WebCodecsExporter {
  private isAborted = false;

  async export(options: ExportOptions): Promise<ExportResult> {
    if (!options.sourceVideoPath || !options.outputPath) {
      return { success: false, error: 'Invalid export options' };
    }

    const {
      sourceVideoPath,
      systemAudioPath,
      micAudioPath,
      hasEmbeddedAudio = false,
      keyboardSoundPath,
      keyboardSoundVolume = 0.7,
      cameraVideoPath,
      musicTracks = [],
      outputPath,
      config,
      frameRate,
      qualityPreset,
      resolution,
      onProgress,
    } = options;

    this.isAborted = false;
    let sourceInput: Input | null = null;
    let cameraInput: Input | null = null;
    let output: Output | null = null;
    let engine: VideoCompositionEngine | null = null;
    let videoSink: VideoSampleSink | null = null;
    let cameraSink: VideoSampleSink | null = null;

    try {
      const { sourceVideoTrack, sourceInputInstance } =
        await this.initializeSourceInput();
      sourceInput = sourceInputInstance;

      const isCameraVisible = config.cameraStyle?.visible ?? true;
      const { cameraInputInstance, cameraVideoTrack } =
        await this.initializeCameraInput(cameraVideoPath, isCameraVisible);
      cameraInput = cameraInputInstance;

      engine = new VideoCompositionEngine(config);
      await this.loadBackgroundImageIfNeeded(engine, config);
      await this.loadFirstFrameImageIfNeeded(engine, config);

      const { outputCanvas, outputCtx, exportDims } = this.createOutputCanvas(
        config,
        resolution
      );

      const hasCamera = !!cameraVideoPath && isCameraVisible;
      const bitrate = calculateBitrate({
        width: exportDims.width,
        height: exportDims.height,
        fps: frameRate,
        qualityPreset,
        hasCamera,
      });

      const videoSource = new CanvasSource(outputCanvas, {
        codec: 'avc',
        bitrate,
      });

      output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: new BufferTarget(),
      });

      output.addVideoTrack(videoSource, { frameRate });
      await output.start();

      videoSink = new VideoSampleSink(sourceVideoTrack);
      cameraSink = cameraVideoTrack
        ? new VideoSampleSink(cameraVideoTrack)
        : null;

      await this.processFrames({
        config,
        frameRate,
        videoSink,
        cameraSink,
        engine,
        outputCtx,
        videoSource,
        onProgress,
      });

      onProgress(92);
      videoSource.close();
      onProgress(94);
      await output.finalize();
      onProgress(96);

      const tempVideoPath = `${outputPath}.temp.mp4`;
      const outputBuffer = (output.target as BufferTarget).buffer;
      if (!outputBuffer) {
        throw new Error('No output buffer generated');
      }

      await writeBuffer(tempVideoPath, new Uint8Array(outputBuffer));

      onProgress(97);

      const audioResult = await this.handleAudioMuxing({
        tempVideoPath,
        outputPath,
        sourceVideoPath,
        systemAudioPath,
        micAudioPath,
        hasEmbeddedAudio,
        keyboardSoundPath,
        keyboardSoundVolume,
        musicTracks,
        segments: config.segments,
        firstFrameDuration: engine.getFirstFrameDuration(),
      });

      if (!audioResult.success) {
        return { success: false, error: audioResult.error };
      }

      onProgress(100);
      return { success: true, outputPath };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    } finally {
      sourceInput?.dispose();
      cameraInput?.dispose();
      engine?.dispose();
    }
  }

  cancel(): void {
    this.isAborted = true;
  }

  private async initializeSourceInput(): Promise<{
    sourceVideoTrack: InputVideoTrack;
    sourceInputInstance: Input;
  }> {
    const sourceInput = new Input({
      source: createFileSource('video'),
      formats: ALL_FORMATS,
    });

    const sourceVideoTrack = await sourceInput.getPrimaryVideoTrack();

    if (!sourceVideoTrack) {
      throw new Error('No video track found in source');
    }

    const canDecode = await sourceVideoTrack.canDecode();
    if (!canDecode) {
      throw new Error(
        'Video codec not supported for WebCodecs decoding. Falling back to FFmpeg.'
      );
    }

    const trackDuration = await sourceVideoTrack.computeDuration();
    console.log('WebCodecs Export: Track info', {
      codec: sourceVideoTrack.codec,
      codedWidth: sourceVideoTrack.codedWidth,
      codedHeight: sourceVideoTrack.codedHeight,
      duration: trackDuration,
      canDecode,
    });

    return { sourceVideoTrack, sourceInputInstance: sourceInput };
  }

  private async initializeCameraInput(
    cameraVideoPath: string | null | undefined,
    isCameraVisible: boolean
  ): Promise<{
    cameraInputInstance: Input | null;
    cameraVideoTrack: Awaited<ReturnType<Input['getPrimaryVideoTrack']>> | null;
  }> {
    if (!cameraVideoPath || !isCameraVisible) {
      return { cameraInputInstance: null, cameraVideoTrack: null };
    }

    const cameraInput = new Input({
      source: createFileSource('camera'),
      formats: ALL_FORMATS,
    });
    const cameraVideoTrack = await cameraInput.getPrimaryVideoTrack();

    return { cameraInputInstance: cameraInput, cameraVideoTrack };
  }

  private async loadBackgroundImageIfNeeded(
    engine: VideoCompositionEngine,
    config: ExportOptions['config']
  ): Promise<void> {
    if (!config.wallpaper?.backgroundImage) return;

    const backgroundImage = await loadImage(config.wallpaper.backgroundImage);
    if (backgroundImage) {
      engine.setBackgroundImage(backgroundImage);
    }
  }

  private async loadFirstFrameImageIfNeeded(
    engine: VideoCompositionEngine,
    config: ExportOptions['config']
  ): Promise<void> {
    if (!config.firstFrame?.enabled || !config.firstFrame.imageData) return;

    const image = await loadImage(config.firstFrame.imageData);
    if (image) {
      engine.setFirstFrameImage(image);
    }
  }

  private createOutputCanvas(
    config: ExportOptions['config'],
    resolution: ExportOptions['resolution']
  ): {
    outputCanvas: OffscreenCanvas;
    outputCtx: OffscreenCanvasRenderingContext2D;
    exportDims: ReturnType<typeof calculateExportDimensions>;
  } {
    const isWallpaperEnabled = config.wallpaper?.enabled ?? false;
    const padding = isWallpaperEnabled ? (config.wallpaper?.padding ?? 0) : 0;
    const wallpaperAspectRatio = isWallpaperEnabled
      ? (config.wallpaper?.aspectRatio ?? null)
      : null;
    const isDeviceFrame =
      isWallpaperEnabled && (config.wallpaper?.deviceFrame ?? false);

    let effectiveVideoWidth = config.videoWidth;
    let effectiveVideoHeight = config.videoHeight;

    if (isDeviceFrame) {
      const frameLayout = calculateDeviceFrameLayout(
        effectiveVideoWidth,
        effectiveVideoHeight
      );
      effectiveVideoWidth = frameLayout.frameWidth;
      effectiveVideoHeight = frameLayout.frameHeight;
    }

    const exportDims = calculateExportDimensions(
      effectiveVideoWidth,
      effectiveVideoHeight,
      padding,
      resolution,
      wallpaperAspectRatio
    );

    const outputCanvas = new OffscreenCanvas(
      exportDims.width,
      exportDims.height
    );
    const outputCtx = outputCanvas.getContext('2d');

    if (!outputCtx) {
      throw new Error('Failed to create canvas context');
    }

    if (exportDims.scale !== 1) {
      outputCtx.scale(exportDims.scale, exportDims.scale);
    }

    return { outputCanvas, outputCtx, exportDims };
  }

  private async processFrames(params: {
    config: ExportOptions['config'];
    frameRate: number;
    videoSink: VideoSampleSink;
    cameraSink: VideoSampleSink | null;
    engine: VideoCompositionEngine;
    outputCtx: OffscreenCanvasRenderingContext2D;
    videoSource: CanvasSource;
    onProgress: (percent: number) => void;
  }): Promise<void> {
    const {
      config,
      frameRate,
      videoSink,
      cameraSink,
      engine,
      outputCtx,
      videoSource,
      onProgress,
    } = params;

    const videoTimelineDuration = getTotalTimelineDuration(config.segments);
    const firstFrameDuration = engine.getFirstFrameDuration();
    const timelineDuration = firstFrameDuration + videoTimelineDuration;
    const totalFrames = Math.ceil(timelineDuration * frameRate);
    const frameDuration = 1 / frameRate;

    let frameIndex = 0;
    let nullFrameCount = 0;
    let lastProgressPercent = -1;

    const reportProgress = (rawPercent: number): void => {
      if (rawPercent === lastProgressPercent) return;
      lastProgressPercent = rawPercent;
      onProgress(rawPercent);
    };

    const prefetchSamples = async (
      sink: VideoSampleSink,
      timestamps: number[]
    ): Promise<(VideoSample | null)[]> => {
      const samples: (VideoSample | null)[] = [];
      for await (const sample of sink.samplesAtTimestamps(timestamps)) {
        samples.push(sample);
      }
      return samples;
    };

    const prefetchBatch = async (
      startIndex: number
    ): Promise<PrefetchedFrame[]> => {
      const batchEnd = Math.min(startIndex + PREFETCH_BATCH_SIZE, totalFrames);
      const batchTimes: number[] = [];
      const videoTimes: number[] = [];
      const isFirstFrameFlags: boolean[] = [];

      for (let index = startIndex; index < batchEnd; index++) {
        const timelineTime = index * frameDuration;
        batchTimes.push(timelineTime);

        if (timelineTime < firstFrameDuration) {
          videoTimes.push(0);
          isFirstFrameFlags.push(true);
        } else {
          const videoTlTime = timelineTime - firstFrameDuration;
          const { videoTime } = timelineToVideo(config.segments, videoTlTime);
          videoTimes.push(videoTime);
          isFirstFrameFlags.push(false);
        }
      }

      const videoOnlyTimes = videoTimes.filter((_, i) => !isFirstFrameFlags[i]);
      const videoSamples =
        videoOnlyTimes.length > 0
          ? await prefetchSamples(videoSink, videoOnlyTimes)
          : [];
      const cameraSamples =
        cameraSink && videoOnlyTimes.length > 0
          ? await prefetchSamples(cameraSink, videoOnlyTimes)
          : null;

      let videoIdx = 0;
      return batchTimes.map((timelineTime, index) => {
        if (isFirstFrameFlags[index]) {
          return {
            timelineTime,
            videoSample: null,
            cameraSample: null,
          };
        }
        const result = {
          timelineTime,
          videoSample: videoSamples[videoIdx] ?? null,
          cameraSample: cameraSamples
            ? (cameraSamples[videoIdx] ?? null)
            : null,
        };
        videoIdx++;
        return result;
      });
    };

    let nextBatchPromise: Promise<PrefetchedFrame[]> | null = null;

    for (let i = 0; i < totalFrames; i += PREFETCH_BATCH_SIZE) {
      if (this.isAborted) {
        throw new Error('Export cancelled');
      }

      nextBatchPromise ??= prefetchBatch(i);

      const prefetchedBatch = await nextBatchPromise;

      const nextIndex = i + PREFETCH_BATCH_SIZE;
      nextBatchPromise =
        nextIndex < totalFrames ? prefetchBatch(nextIndex) : null;

      for (const {
        timelineTime,
        videoSample,
        cameraSample,
      } of prefetchedBatch) {
        if (this.isAborted) {
          videoSample?.close();
          cameraSample?.close();
          throw new Error('Export cancelled');
        }

        const isFirstFrameRegion = timelineTime < firstFrameDuration;

        if (isFirstFrameRegion) {
          engine.renderFrame(
            outputCtx,
            timelineTime,
            { video: new OffscreenCanvas(1, 1) },
            { fps: frameRate }
          );
          await videoSource.add(timelineTime, 1 / frameRate);
          frameIndex++;
          reportProgress(Math.round((frameIndex / totalFrames) * 90));
          continue;
        }

        if (!videoSample) {
          nullFrameCount++;
          if (frameIndex < 5) {
            console.warn(
              `WebCodecs Export: Frame ${frameIndex} is null`,
              'timelineTime:',
              timelineTime
            );
          }
          frameIndex++;
          reportProgress(Math.round((frameIndex / totalFrames) * 90));
          continue;
        }

        if (
          nullFrameCount === 0 &&
          frameIndex === Math.ceil(firstFrameDuration * frameRate)
        ) {
          console.log('WebCodecs Export: First video sample info', {
            timestamp: videoSample.timestamp,
            duration: videoSample.duration,
            codedWidth: videoSample.codedWidth,
            codedHeight: videoSample.codedHeight,
            format: videoSample.format,
          });
        }

        const { videoFrame, cameraFrame } = this.renderFrameToCanvas(
          engine,
          outputCtx,
          timelineTime,
          videoSample,
          cameraSample,
          frameRate,
          frameIndex
        );

        await videoSource.add(timelineTime, 1 / frameRate);

        videoFrame?.close();
        cameraFrame?.close();
        videoSample?.close();
        cameraSample?.close();

        frameIndex++;
        reportProgress(Math.round((frameIndex / totalFrames) * 90));
      }
    }

    if (nullFrameCount > 0) {
      console.warn(
        `WebCodecs Export: ${nullFrameCount} frames were null out of ${totalFrames}`
      );
    }
  }

  private renderFrameToCanvas(
    engine: VideoCompositionEngine,
    ctx: OffscreenCanvasRenderingContext2D,
    timelineTime: number,
    videoSample: VideoSample | null,
    cameraSample: VideoSample | null,
    frameRate: number,
    frameIndex: number
  ): { videoFrame: VideoFrame | null; cameraFrame: VideoFrame | null } {
    const videoFrame = videoSample?.toVideoFrame() ?? null;
    const cameraFrame = cameraSample?.toVideoFrame() ?? null;

    if (frameIndex === 0 && videoFrame) {
      console.log('WebCodecs Export: First VideoFrame info', {
        displayWidth: videoFrame.displayWidth,
        displayHeight: videoFrame.displayHeight,
        codedWidth: videoFrame.codedWidth,
        codedHeight: videoFrame.codedHeight,
        format: videoFrame.format,
      });
    }

    if (!videoFrame) {
      console.error(
        'WebCodecs Export: videoFrame is null in renderFrameToCanvas'
      );
    }

    engine.renderFrame(
      ctx,
      timelineTime,
      {
        video: videoFrame as VideoFrame,
        camera: cameraFrame,
      },
      { fps: frameRate }
    );

    return { videoFrame, cameraFrame };
  }

  private async handleAudioMuxing(params: {
    tempVideoPath: string;
    outputPath: string;
    sourceVideoPath: string;
    systemAudioPath: string | null | undefined;
    micAudioPath: string | null | undefined;
    hasEmbeddedAudio: boolean;
    keyboardSoundPath?: string | null;
    keyboardSoundVolume?: number;
    musicTracks?: MusicTrack[];
    segments: ExportOptions['config']['segments'];
    firstFrameDuration?: number;
  }): Promise<{ success: boolean; error?: string }> {
    const {
      tempVideoPath,
      outputPath,
      sourceVideoPath,
      systemAudioPath,
      micAudioPath,
      hasEmbeddedAudio,
      keyboardSoundPath,
      keyboardSoundVolume = 0.7,
      musicTracks = [],
      segments,
      firstFrameDuration = 0,
    } = params;

    const enabledAudioTracks: AudioTrack[] = [];
    if (keyboardSoundPath) {
      enabledAudioTracks.push({
        path: keyboardSoundPath,
        volume: keyboardSoundVolume,
        skipSegmentExtraction: true,
      });
    }

    const musicTempFiles: string[] = [];
    for (let i = 0; i < musicTracks.length; i++) {
      const track = musicTracks[i];
      if (!track.enabled) continue;

      let audioFilePath: string | null = null;
      if (track.source === 'system') {
        audioFilePath = systemAudioPath ?? null;
        if (!audioFilePath && hasEmbeddedAudio) {
          audioFilePath = sourceVideoPath;
        }
      } else if (track.source === 'mic') {
        audioFilePath = micAudioPath ?? null;
      } else {
        audioFilePath = (await window.ipcRenderer.invoke(
          'video-editor:music:get-path',
          { fileName: track.fileName }
        )) as string | null;
      }

      if (!audioFilePath) continue;

      const totalTimelineDuration = getTotalTimelineDuration(segments);
      const tempMusicPath = `${outputPath}.temp_music_${i}.aac`;

      const prepResult = (await window.ipcRenderer.invoke(
        'video-editor:music:prepare-for-export',
        {
          musicFilePath: audioFilePath,
          trimStart: track.trimStart,
          trimEnd: track.trimEnd,
          speed: track.speed,
          startTime: track.startTime + firstFrameDuration,
          trackDuration: track.endTime - track.startTime,
          totalDuration: totalTimelineDuration + firstFrameDuration,
          outputPath: tempMusicPath,
        }
      )) as { success: boolean; error?: string };

      if (prepResult.success) {
        musicTempFiles.push(tempMusicPath);
        enabledAudioTracks.push({
          path: tempMusicPath,
          volume: track.volume,
          skipSegmentExtraction: true,
        });
      }
    }

    const result = await muxAudioWithVideo({
      videoPath: tempVideoPath,
      audioTracks: enabledAudioTracks,
      outputPath,
      segments,
      audioDelaySeconds: firstFrameDuration,
    });

    for (const tempFile of musicTempFiles) {
      window.ipcRenderer
        .invoke('video-editor:delete-temp-file', { filePath: tempFile })
        .catch(() => {});
    }

    return result;
  }
}
