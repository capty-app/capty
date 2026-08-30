import { execFile } from 'child_process';
import { promisify } from 'util';

import {
  decimalSecondsToTicks,
  decimalToPositiveRational,
} from '@/editor-v2/time/decimal';
import { getFFmpegPath } from '@/main/utils/ffmpeg';
import type {
  LegacyAudioProbe,
  LegacyMediaProbeService,
  LegacyVideoProbe,
} from './v1-import-coordinator';
import type {
  AudioStreamDescriptor,
  VideoStreamDescriptor,
} from '@/types/editor-v2';

const execFileAsync = promisify(execFile);

type VideoStreamMetadata = Omit<VideoStreamDescriptor, 'durationTicks'>;
type AudioStreamMetadata = Omit<AudioStreamDescriptor, 'durationTicks'>;

interface ParsedMediaInventory {
  videoStreams: VideoStreamMetadata[];
  audioStreams: AudioStreamMetadata[];
}

interface ParsedMediaProbe {
  videoDurationSeconds?: string;
  audioDurationSeconds?: string;
  videoStreams: VideoStreamDescriptor[];
  audioStreams: AudioStreamDescriptor[];
}

const parseChannelCount = (description: string): number | null => {
  const normalized = description.trim().toLowerCase();
  const namedLayouts: Record<string, number> = {
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
  const namedLayout = Object.entries(namedLayouts).find(([name]) =>
    normalized.startsWith(name)
  );
  if (namedLayout) return namedLayout[1];

  const surroundLayout = /^(\d+(?:\.\d+)+)(?:\([^)]*\))?$/.exec(normalized);
  if (surroundLayout) {
    return surroundLayout[1]
      .split('.')
      .reduce((total, component) => total + Number(component), 0);
  }

  const channels = /^(\d+) channels?/.exec(normalized);
  return channels ? Number(channels[1]) : null;
};

const parseProbeOutput = (stderr: string): ParsedMediaInventory => {
  const videoStreams: VideoStreamMetadata[] = [];
  const audioStreams: AudioStreamMetadata[] = [];

  for (const line of stderr.split('\n')) {
    const streamId = /Stream #(\d+):(\d+)/.exec(line);
    if (!streamId) continue;
    const id = `${streamId[1]}:${streamId[2]}`;
    const video =
      /Video:\s*([^,\s]+).*?(\d{2,5})x(\d{2,5}).*?(\d+(?:\.\d+)?)\s*fps/.exec(
        line
      );
    if (video) {
      videoStreams.push({
        id,
        codec: video[1],
        width: Number(video[2]),
        height: Number(video[3]),
        frameRate: decimalToPositiveRational(video[4]),
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
      channels,
      sampleRate: Number(audio[2]),
    });
  }

  return { videoStreams, audioStreams };
};

const microsecondsToSeconds = (microseconds: bigint): string => {
  const wholeSeconds = microseconds / 1_000_000n;
  const remainder = microseconds % 1_000_000n;
  if (remainder === 0n) return String(wholeSeconds);
  const fraction = remainder.toString().padStart(6, '0').replace(/0+$/, '');
  return `${wholeSeconds}.${fraction}`;
};

const parseStreamDuration = (stdout: string): string | null => {
  let maximum: bigint | null = null;
  for (const match of stdout.matchAll(/^out_time_us=(\d+)$/gm)) {
    const value = BigInt(match[1]);
    if (maximum === null || value > maximum) maximum = value;
  }
  return maximum === null ? null : microsecondsToSeconds(maximum);
};

const inspectStreamDuration = async (
  filePath: string,
  streamId: string
): Promise<string | null> => {
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
      { timeout: 10_000 }
    );
    const output =
      typeof result === 'string'
        ? result
        : String((result as { stdout: string | Buffer }).stdout);
    return parseStreamDuration(output);
  } catch {
    return null;
  }
};

const inspectMedia = async (
  filePath: string
): Promise<ParsedMediaProbe | null> => {
  let stderr = '';
  try {
    const result = await execFileAsync(getFFmpegPath(), ['-i', filePath], {
      timeout: 10_000,
    });
    stderr = result.stderr;
  } catch (error) {
    if (error && typeof error === 'object' && 'stderr' in error) {
      stderr = String(error.stderr);
    }
  }
  if (!stderr) return null;

  const inventory = parseProbeOutput(stderr);
  const videoResults = await Promise.all(
    inventory.videoStreams.map(async stream => ({
      stream,
      durationSeconds: await inspectStreamDuration(filePath, stream.id),
    }))
  );
  const audioResults = await Promise.all(
    inventory.audioStreams.map(async stream => ({
      stream,
      durationSeconds: await inspectStreamDuration(filePath, stream.id),
    }))
  );
  const videoStreams = videoResults
    .filter(
      (result): result is typeof result & { durationSeconds: string } =>
        result.durationSeconds !== null
    )
    .map(result => ({
      ...result.stream,
      durationTicks: decimalSecondsToTicks(result.durationSeconds),
    }));
  const audioStreams = audioResults
    .filter(
      (result): result is typeof result & { durationSeconds: string } =>
        result.durationSeconds !== null
    )
    .map(result => ({
      ...result.stream,
      durationTicks: decimalSecondsToTicks(result.durationSeconds),
    }));

  return {
    videoDurationSeconds:
      videoResults.find(result => result.durationSeconds !== null)
        ?.durationSeconds ?? undefined,
    audioDurationSeconds:
      audioResults.find(result => result.durationSeconds !== null)
        ?.durationSeconds ?? undefined,
    videoStreams,
    audioStreams,
  };
};

export class LegacyFfmpegProbeService implements LegacyMediaProbeService {
  async probeVideo(filePath: string): Promise<LegacyVideoProbe | null> {
    const probe = await inspectMedia(filePath);
    const video = probe?.videoStreams[0];
    if (!probe || !video || !probe.videoDurationSeconds) return null;
    return {
      durationSeconds: probe.videoDurationSeconds,
      width: video.width,
      height: video.height,
      frameRate: video.frameRate,
      videoStreams: probe.videoStreams,
      audioStreams: probe.audioStreams,
    };
  }

  async probeAudio(filePath: string): Promise<LegacyAudioProbe | null> {
    const probe = await inspectMedia(filePath);
    const audio = probe?.audioStreams[0];
    if (!probe || !audio || !probe.audioDurationSeconds) return null;
    return {
      durationSeconds: probe.audioDurationSeconds,
      streams: probe.audioStreams,
      channels: audio.channels,
      sampleRate: audio.sampleRate,
    };
  }
}
