import { beforeEach, describe, expect, it, vi } from 'vitest';

let channelLayout = '5.1(side)';

const getProbeOutput = () => `
  Duration: 00:00:04.250000, start: 0.125000, bitrate: 5000 kb/s
  Stream #0:0: Video: h264 (High), yuv420p, 1920x1080, 59.94 fps, 60 tbr
  Stream #0:1: Audio: aac (LC), 48000 Hz, ${channelLayout}, fltp, 384 kb/s
`;

const execFile = vi.fn(
  (
    _file: string,
    args: string[],
    _options: Record<string, unknown>,
    callback: (
      error: (Error & { stderr?: string }) | null,
      stdout: string,
      stderr: string
    ) => void
  ) => {
    const mapIndex = args.indexOf('-map');
    if (mapIndex >= 0) {
      const duration = args[mapIndex + 1] === '0:0' ? '4250000' : '3750000';
      callback(null, `out_time_us=${duration}\nprogress=end\n`, '');
      return;
    }
    const probeOutput = getProbeOutput();
    const error = Object.assign(new Error('probe'), { stderr: probeOutput });
    callback(error, '', probeOutput);
  }
);

vi.mock('child_process', () => ({ execFile }));
vi.mock('@/main/utils/ffmpeg', () => ({ getFFmpegPath: () => '/ffmpeg' }));

describe('legacy FFmpeg media probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelLayout = '5.1(side)';
  });

  it.each([
    ['3.1.2', 6],
    ['5.1.4', 10],
    ['7.2.3', 12],
    ['9.1.4', 14],
    ['22.2', 24],
    ['cube', 8],
  ])(
    'accepts the bundled FFmpeg %s channel layout',
    async (layout, channels) => {
      channelLayout = layout;
      const { LegacyFfmpegProbeService } =
        await import('@/main/editor-v2/project/legacy-media-probe');
      const service = new LegacyFfmpegProbeService();

      await expect(
        service.probeAudio('/Project.capty/music.m4a')
      ).resolves.toMatchObject({
        channels,
        streams: [expect.objectContaining({ channels })],
      });
    }
  );

  it('probes independent exact video and audio stream durations', async () => {
    const { LegacyFfmpegProbeService } =
      await import('@/main/editor-v2/project/legacy-media-probe');
    const service = new LegacyFfmpegProbeService();
    const video = await service.probeVideo('/Project.capty/recording.mov');
    const audio = await service.probeAudio('/Project.capty/system.m4a');

    expect(video).toMatchObject({
      durationSeconds: '4.25',
      width: 1920,
      height: 1080,
      frameRate: { numerator: 5994, denominator: 100 },
      videoStreams: [
        expect.objectContaining({
          id: '0:0',
          codec: 'h264',
          durationTicks: 1_530_000,
        }),
      ],
      audioStreams: [
        expect.objectContaining({
          id: '0:1',
          channels: 6,
          sampleRate: 48_000,
          durationTicks: 1_350_000,
        }),
      ],
    });
    expect(audio).toMatchObject({
      durationSeconds: '3.75',
      channels: 6,
      sampleRate: 48_000,
      streams: [expect.objectContaining({ durationTicks: 1_350_000 })],
    });
  });
});
