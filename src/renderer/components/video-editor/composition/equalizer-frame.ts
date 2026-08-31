import {
  EQUALIZER_ANALYSIS_VALUE_SCALE,
  type AudioAnalysisData,
  type EqualizerFrameData,
  type EqualizerSettings,
  type EqualizerTrackData,
} from '@/types/equalizer';

function getFrameOffset(
  analysis: AudioAnalysisData,
  sourceTime: number
): number {
  const valuesPerFrame =
    analysis.spectrumBandCount + analysis.waveformPointCount;
  const frameCount = Math.floor(analysis.frames.length / valuesPerFrame);
  if (frameCount === 0) return -1;

  const frameIndex = Math.min(
    frameCount - 1,
    Math.max(0, Math.round(sourceTime * analysis.frameRate))
  );
  return frameIndex * valuesPerFrame;
}

function isTrackActive(
  track: EqualizerTrackData,
  timelineTime: number
): boolean {
  return (
    track.enabled &&
    timelineTime >= track.startTime &&
    timelineTime < track.endTime
  );
}

export function sampleEqualizerFrame(
  settings: EqualizerSettings,
  tracks: EqualizerTrackData[],
  timelineTime: number,
  target?: EqualizerFrameData
): EqualizerFrameData | null {
  if (tracks.length === 0) return null;

  const selectedTracks =
    settings.source === 'mix'
      ? tracks.filter(track => isTrackActive(track, timelineTime))
      : tracks.filter(
          track =>
            track.id === settings.source && isTrackActive(track, timelineTime)
        );

  if (selectedTracks.length === 0) return null;

  const firstAnalysis = selectedTracks[0].analysis;
  const spectrumCount = firstAnalysis.spectrumBandCount;
  const waveformCount = firstAnalysis.waveformPointCount;
  const spectrum =
    target?.spectrum.length === spectrumCount
      ? target.spectrum
      : new Float32Array(spectrumCount);
  const waveform =
    target?.waveform.length === waveformCount
      ? target.waveform
      : new Float32Array(waveformCount);

  spectrum.fill(0);
  waveform.fill(0);

  let contributingTrackCount = 0;

  for (const track of selectedTracks) {
    const { analysis } = track;
    if (
      analysis.spectrumBandCount !== spectrumCount ||
      analysis.waveformPointCount !== waveformCount
    ) {
      continue;
    }

    const sourceTime =
      track.trimStart + (timelineTime - track.startTime) * track.speed;
    if (sourceTime < 0 || sourceTime >= analysis.duration) continue;

    const frameOffset = getFrameOffset(analysis, sourceTime);
    if (frameOffset < 0) continue;

    const volume = Math.max(0, track.volume);
    if (volume === 0) continue;
    contributingTrackCount++;

    for (let index = 0; index < spectrumCount; index++) {
      spectrum[index] +=
        (analysis.frames[frameOffset + index] /
          EQUALIZER_ANALYSIS_VALUE_SCALE) *
        volume;
    }

    const waveformOffset = frameOffset + spectrumCount;
    for (let index = 0; index < waveformCount; index++) {
      waveform[index] +=
        (analysis.frames[waveformOffset + index] /
          EQUALIZER_ANALYSIS_VALUE_SCALE) *
        volume;
    }
  }

  if (contributingTrackCount === 0) return null;

  const mixScale = contributingTrackCount > 1 ? 1 / contributingTrackCount : 1;
  const sensitivity = settings.sensitivity;

  for (let index = 0; index < spectrumCount; index++) {
    spectrum[index] = Math.min(
      1,
      Math.max(0, spectrum[index] * mixScale * sensitivity)
    );
  }

  for (let index = 0; index < waveformCount; index++) {
    waveform[index] = Math.min(
      1,
      Math.max(-1, waveform[index] * mixScale * sensitivity)
    );
  }

  return { spectrum, waveform };
}
