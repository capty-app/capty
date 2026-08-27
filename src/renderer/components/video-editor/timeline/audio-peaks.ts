const PEAK_BUCKETS = 400;
const SAMPLE_STRIDE = 16;

const peaksCache = new Map<string, Promise<Float32Array | null>>();

function toFetchUrl(src: string): string {
  if (src.includes('://')) return src;
  return `file://${encodeURI(src)}`;
}

async function computePeaks(src: string): Promise<Float32Array | null> {
  const response = await fetch(toFetchUrl(src));
  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const data = audioBuffer.getChannelData(0);
    if (data.length === 0) return null;

    const peaks = new Float32Array(PEAK_BUCKETS);
    const step = Math.max(1, Math.floor(data.length / PEAK_BUCKETS));

    for (let bucket = 0; bucket < PEAK_BUCKETS; bucket++) {
      const start = bucket * step;
      const end = Math.min(start + step, data.length);
      let max = 0;
      for (let i = start; i < end; i += SAMPLE_STRIDE) {
        const value = Math.abs(data[i]);
        if (value > max) max = value;
      }
      peaks[bucket] = max;
    }

    let overallMax = 0;
    for (const value of peaks) {
      if (value > overallMax) overallMax = value;
    }
    if (overallMax > 0) {
      for (let i = 0; i < PEAK_BUCKETS; i++) {
        peaks[i] /= overallMax;
      }
    }

    return peaks;
  } finally {
    await audioContext.close();
  }
}

export function getAudioPeaks(src: string): Promise<Float32Array | null> {
  let pending = peaksCache.get(src);
  if (!pending) {
    pending = computePeaks(src).catch(() => null);
    peaksCache.set(src, pending);
  }
  return pending;
}
