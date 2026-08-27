import { useEffect, useMemo, useState } from 'react';
import { getAudioPeaks } from './audio-peaks';

interface SegmentWaveformProps {
  src: string | null | undefined;
  startFraction?: number;
  endFraction?: number;
}

function useAudioPeaks(src: string | null | undefined) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    if (!src) {
      setPeaks(null);
      return;
    }
    let alive = true;
    getAudioPeaks(src).then(result => {
      if (alive) setPeaks(result);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  return peaks;
}

export default function SegmentWaveform({
  src,
  startFraction = 0,
  endFraction = 1,
}: SegmentWaveformProps) {
  const peaks = useAudioPeaks(src);

  const points = useMemo(() => {
    if (!peaks || peaks.length === 0) return null;

    const from = Math.max(
      0,
      Math.min(peaks.length - 2, Math.floor(startFraction * peaks.length))
    );
    const to = Math.max(
      from + 2,
      Math.min(peaks.length, Math.ceil(endFraction * peaks.length))
    );
    const count = to - from;

    let result = '0,32 ';
    for (let i = 0; i < count; i++) {
      const x = (i / (count - 1)) * 100;
      const y = 30 - peaks[from + i] * 26;
      result += `${x.toFixed(2)},${y.toFixed(2)} `;
    }
    result += '100,32';
    return result;
  }, [peaks, startFraction, endFraction]);

  if (!points) return null;

  return (
    <svg
      className="pointer-events-none absolute bottom-0 left-0 h-full w-full text-white/35"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}
