import type {
  AudioAnalysisData,
  EqualizerAudioSource,
  EqualizerSegment,
  EqualizerTrackData,
} from '@/types/equalizer';
import type { MusicTrack } from '@/types/music';
import { CORRELATED_IPC_CHANNELS } from '@/types/ipc';
import { sendCorrelatedIpcRequest } from '@/renderer/utils/ipc-request';

interface LoadEqualizerTracksOptions {
  tracks: MusicTrack[];
  requiredTrackIds: string[];
  sourceVideoPath: string;
}

interface EqualizerAnalysisResult {
  success: boolean;
  analysis?: AudioAnalysisData;
  error?: string;
}

interface AnalysisCacheEntry {
  analysis: AudioAnalysisData;
  size: number;
}

const MAX_ANALYSIS_MEMORY_BYTES = 96 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 8;
const analysisCache = new Map<string, AnalysisCacheEntry>();
let analysisCacheSize = 0;

function createAbortError(): DOMException {
  return new DOMException('Audio analysis cancelled', 'AbortError');
}

function getSource(track: MusicTrack): EqualizerAudioSource | null {
  switch (track.source) {
    case 'system':
      return { type: 'system' };
    case 'mic':
      return { type: 'mic' };
    case 'music':
      return track.fileName
        ? { type: 'music', fileName: track.fileName }
        : null;
  }
}

function getCacheKey(
  sourceVideoPath: string,
  trackId: string,
  source: EqualizerAudioSource
): string {
  return source.type === 'music'
    ? `${sourceVideoPath}:music:${trackId}:${source.fileName}`
    : `${sourceVideoPath}:${source.type}`;
}

function getCachedAnalysis(key: string): AudioAnalysisData | null {
  const cached = analysisCache.get(key);
  if (!cached) return null;

  analysisCache.delete(key);
  analysisCache.set(key, cached);
  return cached.analysis;
}

function cacheAnalysis(key: string, analysis: AudioAnalysisData): void {
  const size = analysis.frames.buffer.byteLength;
  if (size > MAX_ANALYSIS_MEMORY_BYTES) return;

  const previous = analysisCache.get(key);
  if (previous) {
    analysisCacheSize -= previous.size;
    analysisCache.delete(key);
  }

  analysisCache.set(key, { analysis, size });
  analysisCacheSize += size;

  while (
    analysisCache.size > MAX_CACHE_ENTRIES ||
    analysisCacheSize > MAX_ANALYSIS_MEMORY_BYTES
  ) {
    const oldestKey = analysisCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = analysisCache.get(oldestKey);
    analysisCache.delete(oldestKey);
    analysisCacheSize -= oldest?.size ?? 0;
  }
}

async function analyzeAudioSource(
  source: EqualizerAudioSource,
  signal?: AbortSignal
): Promise<AudioAnalysisData> {
  if (signal?.aborted) throw createAbortError();

  const requestId = crypto.randomUUID();
  const handleAbort = () => {
    window.ipcRenderer.send('video-editor:equalizer:cancel', { requestId });
  };
  signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    const result = await sendCorrelatedIpcRequest<
      { source: EqualizerAudioSource },
      EqualizerAnalysisResult
    >({
      requestChannel: CORRELATED_IPC_CHANNELS.equalizerAnalyze.request,
      responseChannel: CORRELATED_IPC_CHANNELS.equalizerAnalyze.response,
      payload: { source },
      requestId,
      signal,
    });

    if (signal?.aborted) throw createAbortError();
    if (!result.success || !result.analysis) {
      throw new Error(result.error ?? 'Audio analysis failed');
    }

    return result.analysis;
  } finally {
    signal?.removeEventListener('abort', handleAbort);
  }
}

async function getAudioAnalysis(
  key: string,
  source: EqualizerAudioSource,
  signal?: AbortSignal
): Promise<AudioAnalysisData> {
  const cached = getCachedAnalysis(key);
  if (cached) return cached;

  const analysis = await analyzeAudioSource(source, signal);
  cacheAnalysis(key, analysis);
  return analysis;
}

export function getRequiredEqualizerTrackIds(
  segments: EqualizerSegment[],
  tracks: MusicTrack[]
): string[] {
  return tracks
    .filter(track => {
      if (!track.enabled) return false;
      return segments.some(segment => {
        if (
          segment.endTime <= track.startTime ||
          segment.startTime >= track.endTime
        ) {
          return false;
        }
        return segment.source === 'mix' || segment.source === track.id;
      });
    })
    .map(track => track.id);
}

async function loadTrack(
  track: MusicTrack,
  options: LoadEqualizerTracksOptions,
  signal?: AbortSignal
): Promise<EqualizerTrackData | null> {
  const source = getSource(track);
  if (!source) return null;

  const analysis = await getAudioAnalysis(
    getCacheKey(options.sourceVideoPath, track.id, source),
    source,
    signal
  );
  return {
    id: track.id,
    volume: track.volume,
    enabled: track.enabled,
    startTime: track.startTime,
    endTime: track.endTime,
    trimStart: track.trimStart,
    speed: track.speed,
    analysis,
  };
}

export async function loadEqualizerTrackData(
  options: LoadEqualizerTracksOptions,
  signal?: AbortSignal
): Promise<EqualizerTrackData[]> {
  if (signal?.aborted) throw createAbortError();

  const requiredTrackIds = new Set(options.requiredTrackIds);
  const activeTracks = options.tracks.filter(
    track => track.enabled && requiredTrackIds.has(track.id)
  );
  if (activeTracks.length === 0) return [];

  const tracks: EqualizerTrackData[] = [];
  let retainedSize = 0;

  for (const track of activeTracks) {
    let loadedTrack: EqualizerTrackData | null;
    try {
      loadedTrack = await loadTrack(track, options, signal);
    } catch {
      if (signal?.aborted) throw createAbortError();
      continue;
    }
    if (!loadedTrack) continue;

    retainedSize += loadedTrack.analysis.frames.buffer.byteLength;
    if (retainedSize > MAX_ANALYSIS_MEMORY_BYTES) {
      throw new Error('Equalizer audio analysis exceeds the memory limit');
    }
    tracks.push(loadedTrack);
  }

  if (signal?.aborted) throw createAbortError();
  if (tracks.length === 0) {
    throw new Error('No audio tracks could be analyzed');
  }

  return tracks;
}
