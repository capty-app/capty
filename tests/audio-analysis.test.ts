import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioAnalysisData } from '@/types/equalizer';
import type { MusicTrack } from '@/types/music';

const mocks = vi.hoisted(() => ({
  sendCorrelatedIpcRequest: vi.fn(),
}));

vi.mock('@/renderer/utils/ipc-request', () => ({
  sendCorrelatedIpcRequest: mocks.sendCorrelatedIpcRequest,
}));

const analysis: AudioAnalysisData = {
  frameRate: 30,
  spectrumBandCount: 24,
  waveformPointCount: 48,
  duration: 1,
  frames: new Int8Array(72),
};

function createMusicTrack(id: string): MusicTrack {
  return {
    id,
    name: 'Track',
    source: 'music',
    fileName: 'track.mp3',
    volume: 1,
    enabled: true,
    startTime: 0,
    endTime: 1,
    originalDuration: 1,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
  };
}

describe('equalizer audio analysis cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.sendCorrelatedIpcRequest.mockResolvedValue({
      success: true,
      analysis,
    });
  });

  it('reanalyzes a replacement music track with the same file name', async () => {
    const { loadEqualizerTrackData } =
      await import('@/renderer/components/video-editor/equalizer/audio-analysis');
    const firstTrack = createMusicTrack('first-track');
    const replacementTrack = createMusicTrack('replacement-track');

    await loadEqualizerTrackData({
      tracks: [firstTrack],
      requiredTrackIds: [firstTrack.id],
      sourceVideoPath: '/project/video.mov',
    });
    await loadEqualizerTrackData({
      tracks: [replacementTrack],
      requiredTrackIds: [replacementTrack.id],
      sourceVideoPath: '/project/video.mov',
    });

    expect(mocks.sendCorrelatedIpcRequest).toHaveBeenCalledTimes(2);
  });

  it('reuses analysis for the same music track identity', async () => {
    const { loadEqualizerTrackData } =
      await import('@/renderer/components/video-editor/equalizer/audio-analysis');
    const track = createMusicTrack('same-track');
    const options = {
      tracks: [track],
      requiredTrackIds: [track.id],
      sourceVideoPath: '/project/video.mov',
    };

    await loadEqualizerTrackData(options);
    await loadEqualizerTrackData(options);

    expect(mocks.sendCorrelatedIpcRequest).toHaveBeenCalledOnce();
  });
});
