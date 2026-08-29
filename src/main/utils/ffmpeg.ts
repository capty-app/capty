import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  parseVideoFrameRate,
  VIDEO_QUALITY_PRESETS,
  type VideoExportOptions,
  type VideoMetadata,
  type VideoQualityPreset,
} from '@/types/video';
import { getNativeBinaryPath } from './paths';

const execFileAsync = promisify(execFile);

const X264_PRESET = 'medium';

export type FFmpegProgressCallback = (progress: number) => void;

function parseFFmpegProgress(output: string): number | null {
  const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const seconds = parseInt(timeMatch[3]);
    const centiseconds = parseInt(timeMatch[4]);
    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
  }
  return null;
}

interface ExecFFmpegOptions {
  abortSignal?: AbortSignal;
  timeout?: number;
  totalDuration?: number;
  onProgress?: FFmpegProgressCallback;
}

function execFFmpegWithAbort(
  ffmpegPath: string,
  args: string[],
  options: ExecFFmpegOptions = {}
): Promise<void> {
  const { abortSignal, timeout = 300000, totalDuration, onProgress } = options;

  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const proc: ChildProcess = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let lastReportedProgress = -1;
    let timeoutId: NodeJS.Timeout;

    const resetStallTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('FFmpeg timeout'));
      }, timeout);
    };

    resetStallTimer();

    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      resetStallTimer();

      if (totalDuration && totalDuration > 0 && onProgress) {
        const currentTime = parseFFmpegProgress(chunk);
        if (currentTime !== null) {
          const progress = Math.min(
            99,
            Math.round((currentTime / totalDuration) * 100)
          );
          if (progress > lastReportedProgress) {
            lastReportedProgress = progress;
            try {
              onProgress(progress);
            } catch {
              console.warn('FFmpeg progress callback failed');
            }
          }
        }
      }
    });

    const abortHandler = () => {
      clearTimeout(timeoutId);
      proc.kill('SIGKILL');
      reject(new Error('Aborted'));
    };

    abortSignal?.addEventListener('abort', abortHandler);

    proc.on('close', code => {
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener('abort', abortHandler);

      if (code === 0) {
        resolve();
      } else if (abortSignal?.aborted) {
        reject(new Error('Aborted'));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', err => {
      clearTimeout(timeoutId);
      abortSignal?.removeEventListener('abort', abortHandler);
      reject(err);
    });
  });
}

export function getFFmpegPath(): string {
  return getNativeBinaryPath('ffmpeg');
}

export interface VideoProbeResult {
  metadata: VideoMetadata;
  hasAudio: boolean;
}

export async function probeVideo(
  videoPath: string
): Promise<VideoProbeResult | null> {
  if (!fs.existsSync(videoPath)) return null;

  try {
    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;
    const ffmpegPath = getFFmpegPath();

    let stderr = '';
    try {
      await execFileAsync(ffmpegPath, ['-i', videoPath], { timeout: 10000 });
    } catch (error) {
      stderr = (error as { stderr?: string }).stderr || '';
    }

    if (!stderr) return null;

    const dimMatch = stderr.match(/(\d{2,5})x(\d{2,5})/);
    const width = dimMatch ? parseInt(dimMatch[1]) : 1920;
    const height = dimMatch ? parseInt(dimMatch[2]) : 1080;

    let duration = 0;
    const durationMatch = stderr.match(
      /Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/
    );
    if (durationMatch) {
      const hours = parseInt(durationMatch[1]);
      const minutes = parseInt(durationMatch[2]);
      const seconds = parseFloat(durationMatch[3]);
      duration = hours * 3600 + minutes * 60 + seconds;
    }

    let bitrate = 0;
    const bitrateMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/);
    if (bitrateMatch) {
      bitrate = parseInt(bitrateMatch[1]) * 1000;
    } else if (duration > 0) {
      bitrate = (fileSize * 8) / duration;
    }

    return {
      metadata: { fileSize, bitrate, width, height, duration },
      hasAudio: stderr.includes('Audio:'),
    };
  } catch {
    return null;
  }
}

export interface TrimOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  exportOptions?: VideoExportOptions;
  abortSignal?: AbortSignal;
  onProgress?: FFmpegProgressCallback;
}

function getCrfValue(qualityPreset: VideoQualityPreset): string {
  const quality = VIDEO_QUALITY_PRESETS[qualityPreset];
  const minCrf = 18;
  const maxCrf = 28;
  const crf = Math.round(maxCrf - (quality / 100) * (maxCrf - minCrf));
  return String(crf);
}

function getScaleFilter(
  resolution: VideoExportOptions['resolution']
): string | null {
  switch (resolution) {
    case '4k':
      return 'scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2';
    case '1080p':
      return 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
    case '720p':
      return 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2';
    case '480p':
      return 'scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2';
    case 'original':
    default:
      return null;
  }
}

function getFrameRate(frameRate: VideoExportOptions['frameRate']): string {
  return frameRate;
}

interface SocialMediaEncodingOptions {
  bitrate: number;
  resolution: string;
}

function getOutputEncodingArgs(
  crf: string,
  videoFilters: string[],
  fps: string,
  socialOptions?: SocialMediaEncodingOptions
): { filters: string[]; args: string[] } {
  const mp4Filters = [...videoFilters];
  mp4Filters.push(`fps=${fps}`);

  if (socialOptions) {
    const h264Level = socialOptions.resolution === '4k' ? '5.2' : '4.2';

    return {
      filters: mp4Filters,
      args: [
        '-c:v',
        'libx264',
        '-preset',
        X264_PRESET,
        '-profile:v',
        'high',
        '-level',
        h264Level,
        '-b:v',
        `${socialOptions.bitrate}k`,
        '-maxrate',
        `${socialOptions.bitrate}k`,
        '-bufsize',
        `${socialOptions.bitrate * 2}k`,
        '-coder',
        'cabac',
        '-pix_fmt',
        'yuv420p',
        '-g',
        String(parseInt(fps) * 2),
        '-bf',
        '2',
        '-c:a',
        'aac_at',
        '-b:a',
        '256k',
        '-ar',
        '48000',
        '-movflags',
        '+faststart',
      ],
    };
  }

  return {
    filters: mp4Filters,
    args: [
      '-c:v',
      'libx264',
      '-preset',
      X264_PRESET,
      '-crf',
      crf,
      '-pix_fmt',
      'yuv420p',
      '-force_key_frames',
      'expr:eq(t,0)',
      '-c:a',
      'aac_at',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
    ],
  };
}

export interface FFmpegResult {
  success: boolean;
  message?: string;
  outputPath?: string;
}

export async function trimVideo(options: TrimOptions): Promise<FFmpegResult> {
  const {
    inputPath,
    outputPath,
    startTime,
    endTime,
    exportOptions,
    abortSignal,
    onProgress,
  } = options;

  const ffmpegPath = getFFmpegPath();

  if (!fs.existsSync(ffmpegPath)) {
    return {
      success: false,
      message: `FFmpeg binary not found at: ${ffmpegPath}`,
    };
  }

  if (!fs.existsSync(inputPath)) {
    return {
      success: false,
      message: `Input file not found: ${inputPath}`,
    };
  }

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const duration = endTime - startTime;

  const videoFilters: string[] = [];
  const scaleFilter = exportOptions
    ? getScaleFilter(exportOptions.resolution)
    : null;
  if (scaleFilter) {
    videoFilters.push(scaleFilter);
  }

  const qualityPreset = exportOptions?.qualityPreset ?? 'studio';
  const crf = getCrfValue(qualityPreset);

  const fps = exportOptions ? getFrameRate(exportOptions.frameRate) : '60';

  const socialOptions =
    exportOptions?.preset === 'social' && exportOptions.socialPreset
      ? {
          bitrate: exportOptions.socialPreset.bitrate,
          resolution: exportOptions.socialPreset.resolution,
        }
      : undefined;

  const encoding = getOutputEncodingArgs(crf, videoFilters, fps, socialOptions);

  try {
    const args: string[] = [
      '-ss',
      String(startTime),
      '-i',
      inputPath,
      '-t',
      String(duration),
    ];

    if (encoding.filters.length > 0) {
      args.push('-vf', encoding.filters.join(','));
    }

    args.push('-r', fps);

    args.push(...encoding.args);

    args.push('-y', outputPath);

    await execFFmpegWithAbort(ffmpegPath, args, {
      abortSignal,
      timeout: 300000,
      totalDuration: duration,
      onProgress,
    });

    if (fs.existsSync(outputPath)) {
      return {
        success: true,
        outputPath,
      };
    } else {
      return {
        success: false,
        message: 'FFmpeg completed but output file was not created',
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown FFmpeg error';
    return {
      success: false,
      message: errorMessage,
    };
  }
}

export interface VideoSegment {
  start: number;
  end: number;
}

export interface ThumbnailOptions {
  inputPath: string;
  outputPath: string;
  time?: number;
}

export async function generateVideoThumbnail(
  options: ThumbnailOptions
): Promise<FFmpegResult> {
  const { inputPath, outputPath, time = 0 } = options;

  const ffmpegPath = getFFmpegPath();

  if (!fs.existsSync(ffmpegPath)) {
    return {
      success: false,
      message: `FFmpeg binary not found at: ${ffmpegPath}`,
    };
  }

  if (!fs.existsSync(inputPath)) {
    return {
      success: false,
      message: `Input file not found: ${inputPath}`,
    };
  }

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  try {
    await execFileAsync(
      ffmpegPath,
      [
        '-ss',
        String(time),
        '-i',
        inputPath,
        '-vframes',
        '1',
        '-q:v',
        '2',
        '-y',
        outputPath,
      ],
      { timeout: 30000 }
    );

    if (fs.existsSync(outputPath)) {
      return {
        success: true,
        outputPath,
      };
    } else {
      return {
        success: false,
        message: 'FFmpeg completed but thumbnail was not created',
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown FFmpeg error';
    return {
      success: false,
      message: errorMessage,
    };
  }
}

export interface ProcessSegmentsOptions {
  inputPath: string;
  outputPath: string;
  segments: VideoSegment[];
  exportOptions?: VideoExportOptions;
  abortSignal?: AbortSignal;
  onProgress?: FFmpegProgressCallback;
}

export async function processVideoSegments(
  options: ProcessSegmentsOptions
): Promise<FFmpegResult> {
  const {
    inputPath,
    outputPath,
    segments,
    exportOptions,
    abortSignal,
    onProgress,
  } = options;

  const ffmpegPath = getFFmpegPath();

  if (!fs.existsSync(ffmpegPath)) {
    return {
      success: false,
      message: `FFmpeg binary not found at: ${ffmpegPath}`,
    };
  }

  if (!fs.existsSync(inputPath)) {
    return {
      success: false,
      message: `Input file not found: ${inputPath}`,
    };
  }

  if (segments.length === 0) {
    return {
      success: false,
      message: 'No segments provided',
    };
  }

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  if (segments.length === 1) {
    return trimVideo({
      inputPath,
      outputPath,
      startTime: segments[0].start,
      endTime: segments[0].end,
      exportOptions,
      abortSignal,
      onProgress,
    });
  }

  const videoFilters: string[] = [];
  const scaleFilter = exportOptions
    ? getScaleFilter(exportOptions.resolution)
    : null;
  if (scaleFilter) {
    videoFilters.push(scaleFilter);
  }

  const qualityPreset = exportOptions?.qualityPreset ?? 'studio';
  const crf = getCrfValue(qualityPreset);

  const fps = exportOptions ? getFrameRate(exportOptions.frameRate) : '60';

  const socialOptions =
    exportOptions?.preset === 'social' && exportOptions.socialPreset
      ? {
          bitrate: exportOptions.socialPreset.bitrate,
          resolution: exportOptions.socialPreset.resolution,
        }
      : undefined;

  const tempDir = path.join(app.getPath('temp'), `video-edit-${Date.now()}`);

  const totalDuration = segments.reduce(
    (acc, seg) => acc + (seg.end - seg.start),
    0
  );

  const EXTRACTION_PROGRESS = 80;
  const CONCAT_PROGRESS = 100;

  let completedDuration = 0;

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    const extractSegment = async (
      segment: VideoSegment,
      index: number
    ): Promise<string> => {
      const segmentPath = path.join(tempDir, `segment-${index}.mp4`);
      const segmentDuration = segment.end - segment.start;

      const args: string[] = [
        '-ss',
        String(segment.start),
        '-i',
        inputPath,
        '-t',
        String(segmentDuration),
      ];

      if (videoFilters.length > 0) {
        args.push('-vf', videoFilters.join(','));
      }

      args.push('-r', fps);

      const encoding = getOutputEncodingArgs(crf, [], fps, socialOptions);
      args.push(...encoding.args, '-y', segmentPath);

      const segmentProgressCallback = onProgress
        ? (segmentProgress: number) => {
            const segmentContribution =
              (segmentDuration / totalDuration) * EXTRACTION_PROGRESS;
            const baseProgress =
              (completedDuration / totalDuration) * EXTRACTION_PROGRESS;
            const currentProgress = Math.round(
              baseProgress + (segmentProgress / 100) * segmentContribution
            );
            onProgress(Math.min(currentProgress, EXTRACTION_PROGRESS - 1));
          }
        : undefined;

      await execFFmpegWithAbort(ffmpegPath, args, {
        abortSignal,
        timeout: 300000,
        totalDuration: segmentDuration,
        onProgress: segmentProgressCallback,
      });

      if (!fs.existsSync(segmentPath)) {
        throw new Error(`Failed to create segment ${index}`);
      }

      completedDuration += segmentDuration;

      return segmentPath;
    };

    const segmentFiles: string[] = [];
    for (let i = 0; i < segments.length; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Aborted');
      }

      const segmentPath = await extractSegment(segments[i], i);
      segmentFiles.push(segmentPath);
    }

    onProgress?.(EXTRACTION_PROGRESS);

    const concatListPath = path.join(tempDir, 'concat-list.txt');
    const concatListContent = segmentFiles
      .map(f => `file '${f.replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(concatListPath, concatListContent);

    await execFFmpegWithAbort(
      ffmpegPath,
      [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ],
      { abortSignal, timeout: 300000 }
    );

    onProgress?.(CONCAT_PROGRESS);

    for (const file of segmentFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
    if (fs.existsSync(concatListPath)) {
      fs.unlinkSync(concatListPath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    if (fs.existsSync(outputPath)) {
      return {
        success: true,
        outputPath,
      };
    } else {
      return {
        success: false,
        message: 'FFmpeg completed but output file was not created',
      };
    }
  } catch (error) {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      console.warn('Failed to clean up temporary files after error');
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown FFmpeg error';
    return {
      success: false,
      message: errorMessage,
    };
  }
}

export interface ConvertToGifOptions {
  inputPath: string;
  outputPath: string;
  resolution: VideoExportOptions['resolution'];
  frameRate: string;
  abortSignal?: AbortSignal;
  onProgress?: FFmpegProgressCallback;
}

function getGifScaleWidth(
  resolution: VideoExportOptions['resolution']
): number {
  switch (resolution) {
    case '1080p':
      return 1920;
    case '720p':
      return 1280;
    case '480p':
      return 854;
    case 'original':
    case '4k':
    default:
      return 1280;
  }
}

export async function convertMp4ToGif(
  options: ConvertToGifOptions
): Promise<FFmpegResult> {
  const {
    inputPath,
    outputPath,
    resolution,
    frameRate,
    abortSignal,
    onProgress,
  } = options;

  const ffmpegPath = getFFmpegPath();

  if (!fs.existsSync(ffmpegPath)) {
    return {
      success: false,
      message: `FFmpeg binary not found at: ${ffmpegPath}`,
    };
  }

  if (!fs.existsSync(inputPath)) {
    return {
      success: false,
      message: `Input file not found: ${inputPath}`,
    };
  }

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const scaleWidth = getGifScaleWidth(resolution);
  const fps = parseVideoFrameRate(frameRate);

  let totalDuration = 0;
  try {
    await execFileAsync(ffmpegPath, ['-i', inputPath, '-f', 'null', '-'], {
      timeout: 30000,
    }).catch(err => {
      const durationMatch = err.stderr?.match(
        /Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/
      );
      if (durationMatch) {
        totalDuration =
          parseInt(durationMatch[1]) * 3600 +
          parseInt(durationMatch[2]) * 60 +
          parseInt(durationMatch[3]) +
          parseInt(durationMatch[4]) / 100;
      }
    });
  } catch {
    totalDuration = 0;
  }

  try {
    const filterComplex =
      `[0:v]fps=${fps},scale=${scaleWidth}:-1:flags=lanczos,split[s0][s1];` +
      '[s0]palettegen=max_colors=256:stats_mode=diff[p];' +
      '[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[out]';

    const args: string[] = [
      '-i',
      inputPath,
      '-filter_complex',
      filterComplex,
      '-map',
      '[out]',
      '-loop',
      '0',
      '-y',
      outputPath,
    ];

    await execFFmpegWithAbort(ffmpegPath, args, {
      abortSignal,
      timeout: 600000,
      totalDuration: totalDuration > 0 ? totalDuration : undefined,
      onProgress,
    });

    if (fs.existsSync(outputPath)) {
      return {
        success: true,
        outputPath,
      };
    } else {
      return {
        success: false,
        message: 'FFmpeg completed but GIF file was not created',
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown FFmpeg error';
    return {
      success: false,
      message: errorMessage,
    };
  }
}
