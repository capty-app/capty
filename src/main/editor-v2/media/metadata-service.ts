import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import {
  decimalSecondsToTicks,
  decimalToPositiveRational,
} from '@/editor-v2/time/decimal';
import { getFFmpegPath } from '@/main/utils/ffmpeg';
import type {
  AudioStreamDescriptor,
  MediaAsset,
  MediaLocator,
  VideoStreamDescriptor,
} from '@/types/editor-v2';

const execFileAsync = promisify(execFile);

export interface MediaProbeResult {
  kind: 'video' | 'audio' | 'image';
  durationTicks: number;
  width?: number;
  height?: number;
  frameRate?: { numerator: number; denominator: number };
  channels?: number;
  sampleRate?: number;
  orientation?: number;
  videoStreams: VideoStreamDescriptor[];
  audioStreams: AudioStreamDescriptor[];
}

export interface MediaProbeRunner {
  inspect(filePath: string): Promise<string>;
  inspectDuration(filePath: string, streamId: string): Promise<string | null>;
  validateDecode(filePath: string): Promise<void>;
}

const parseDurationSeconds = (output: string): string | null => {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(output);
  if (!match) return null;
  const seconds =
    BigInt(match[1]) * 3600_000_000n +
    BigInt(match[2]) * 60_000_000n +
    BigInt(match[3].split('.')[0]) * 1_000_000n;
  const fraction = (match[3].split('.')[1] ?? '').slice(0, 6).padEnd(6, '0');
  const microseconds = seconds + BigInt(fraction || '0');
  const whole = microseconds / 1_000_000n;
  const remainder = microseconds % 1_000_000n;
  if (remainder === 0n) return String(whole);
  return `${whole}.${remainder.toString().padStart(6, '0').replace(/0+$/, '')}`;
};

const parseChannelCount = (value: string): number | null => {
  const normalized = value.trim().toLowerCase();
  const named: Record<string, number> = {
    mono: 1,
    stereo: 2,
    quad: 4,
    'quad(side)': 4,
    hexagonal: 6,
    octagonal: 8,
    cube: 8,
    hexadecagonal: 16,
    downmix: 2,
  };
  const match = Object.entries(named).find(([name]) =>
    normalized.startsWith(name)
  );
  if (match) return match[1];
  const surround = /^(\d+(?:\.\d+)+)(?:\([^)]*\))?$/.exec(normalized);
  if (surround) {
    return surround[1]
      .split('.')
      .reduce((total, component) => total + Number(component), 0);
  }
  const channels = /^(\d+) channels?/.exec(normalized);
  return channels ? Number(channels[1]) : null;
};

const rotationToOrientation = (degrees: number): number => {
  const normalized = ((degrees % 360) + 360) % 360;
  switch (normalized) {
    case 90:
      return 6;
    case 180:
      return 3;
    case 270:
      return 8;
    default:
      return 1;
  }
};

const parseImageOrientation = (output: string): number => {
  const exif = /\borientation\s*:\s*([1-8])\b/i.exec(output);
  if (exif) return Number(exif[1]);
  const rotate = /\brotate\s*:\s*(-?\d+(?:\.\d+)?)/i.exec(output);
  if (rotate) return rotationToOrientation(Number(rotate[1]));
  const displayMatrix = /rotation of\s*(-?\d+(?:\.\d+)?)\s*degrees/i.exec(
    output
  );
  if (!displayMatrix) return 1;
  return rotationToOrientation(-Number(displayMatrix[1]));
};

const parseStreamDuration = (output: string): string | null => {
  let maximum: bigint | null = null;
  for (const match of output.matchAll(/^out_time_us=(\d+)$/gm)) {
    const value = BigInt(match[1]);
    if (maximum === null || value > maximum) maximum = value;
  }
  if (maximum === null) return null;
  const whole = maximum / 1_000_000n;
  const remainder = maximum % 1_000_000n;
  if (remainder === 0n) return String(whole);
  return `${whole}.${remainder.toString().padStart(6, '0').replace(/0+$/, '')}`;
};

const createDefaultRunner = (): MediaProbeRunner => ({
  async inspect(filePath) {
    try {
      const result = await execFileAsync(
        getFFmpegPath(),
        ['-nostdin', '-hide_banner', '-i', filePath],
        { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 }
      );
      return String(result.stderr);
    } catch (error) {
      if (error && typeof error === 'object' && 'stderr' in error) {
        return String(error.stderr);
      }
      throw error;
    }
  },
  async inspectDuration(filePath, streamId) {
    try {
      const result = await execFileAsync(
        getFFmpegPath(),
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          filePath,
          '-map',
          streamId,
          '-c',
          'copy',
          '-f',
          'null',
          '-progress',
          'pipe:1',
          '-nostats',
          '-',
        ],
        { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 }
      );
      return parseStreamDuration(String(result.stdout));
    } catch {
      return null;
    }
  },
  async validateDecode(filePath) {
    await execFileAsync(
      getFFmpegPath(),
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        filePath,
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-frames:v',
        '1',
        '-t',
        '0.25',
        '-f',
        'null',
        '-',
      ],
      { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 }
    );
  },
});

export { fingerprintMediaFile } from './media-fingerprint';

export class MediaMetadataService {
  constructor(
    private readonly runner: MediaProbeRunner = createDefaultRunner()
  ) {}

  async probe(filePath: string): Promise<MediaProbeResult> {
    const output = await this.runner.inspect(filePath);
    const durationSeconds = parseDurationSeconds(output);
    const durationTicks = durationSeconds
      ? decimalSecondsToTicks(durationSeconds)
      : 0;
    const videoStreams: VideoStreamDescriptor[] = [];
    const audioStreams: AudioStreamDescriptor[] = [];

    for (const line of output.split('\n')) {
      const stream = /Stream #(\d+):(\d+)/.exec(line);
      if (!stream) continue;
      const id = `${stream[1]}:${stream[2]}`;
      const video =
        /Video:\s*([^,\s]+).*?(\d{2,5})x(\d{2,5})(?:.*?(\d+(?:\.\d+)?)\s*fps)?/.exec(
          line
        );
      if (video) {
        const frameRate = decimalToPositiveRational(video[4] ?? '1');
        videoStreams.push({
          id,
          codec: video[1],
          durationTicks,
          width: Number(video[2]),
          height: Number(video[3]),
          frameRate,
          hasAlpha: /\b(?:rgba|yuva|argb|bgra)\b/i.test(line),
        });
        continue;
      }
      const audio = /Audio:\s*([^,\s]+).*?(\d+)\s*Hz,\s*([^,]+)/.exec(line);
      if (!audio) continue;
      const channels = parseChannelCount(audio[3]);
      if (!channels) continue;
      audioStreams.push({
        id,
        codec: audio[1],
        durationTicks,
        channels,
        sampleRate: Number(audio[2]),
      });
    }

    if (videoStreams.length === 0 && audioStreams.length === 0) {
      throw new Error('The selected file has no supported media streams');
    }
    await Promise.all(
      [...videoStreams, ...audioStreams].map(async stream => {
        const streamDuration = await this.runner.inspectDuration(
          filePath,
          stream.id
        );
        if (streamDuration) {
          stream.durationTicks = decimalSecondsToTicks(streamDuration);
        }
      })
    );
    await this.runner.validateDecode(filePath);

    const video = videoStreams[0];
    if (video && durationTicks === 0) {
      return {
        kind: 'image',
        durationTicks: 0,
        width: video.width,
        height: video.height,
        orientation: parseImageOrientation(output),
        videoStreams,
        audioStreams: [],
      };
    }
    if (video) {
      return {
        kind: 'video',
        durationTicks: video.durationTicks,
        width: video.width,
        height: video.height,
        frameRate: video.frameRate,
        videoStreams,
        audioStreams,
      };
    }
    const audio = audioStreams[0];
    return {
      kind: 'audio',
      durationTicks: audio.durationTicks,
      channels: audio.channels,
      sampleRate: audio.sampleRate,
      videoStreams: [],
      audioStreams,
    };
  }

  async createAsset(input: {
    id: string;
    filePath: string;
    locator: MediaLocator;
    importedAt: string;
  }): Promise<MediaAsset> {
    const probe = await this.probe(input.filePath);
    const base = {
      id: input.id,
      name: path.basename(input.filePath, path.extname(input.filePath)),
      locator: input.locator,
      importedAt: input.importedAt,
    };
    switch (probe.kind) {
      case 'video':
        return {
          ...base,
          kind: 'video',
          durationTicks: probe.durationTicks,
          width: probe.width!,
          height: probe.height!,
          frameRate: probe.frameRate!,
          videoStreams: probe.videoStreams,
          audioStreams: probe.audioStreams,
        };
      case 'audio':
        return {
          ...base,
          kind: 'audio',
          durationTicks: probe.durationTicks,
          channels: probe.channels!,
          sampleRate: probe.sampleRate!,
          audioStreams: probe.audioStreams,
        };
      case 'image':
        return {
          ...base,
          kind: 'image',
          width: probe.width!,
          height: probe.height!,
          orientation: probe.orientation!,
          defaultStillDurationTicks: decimalSecondsToTicks(3),
        };
    }
  }
}
