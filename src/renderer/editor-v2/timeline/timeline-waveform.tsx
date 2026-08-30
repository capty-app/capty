import React, { useEffect, useState } from 'react';

interface TimelineWaveformProps {
  url?: string;
}

const normalizePeaks = (value: unknown): number[] => {
  if (
    !Array.isArray(value) ||
    !value.every(peak => typeof peak === 'number' && peak >= 0 && peak <= 1)
  ) {
    return [];
  }
  const stride = Math.max(1, Math.ceil(value.length / 64));
  return value.filter((_, index) => index % stride === 0).slice(0, 64);
};

export default function TimelineWaveform({ url }: TimelineWaveformProps) {
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    if (!url) {
      setPeaks([]);
      return;
    }
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Waveform could not be loaded');
        return response.json();
      })
      .then(value => setPeaks(normalizePeaks(value)))
      .catch(() => {
        if (!controller.signal.aborted) setPeaks([]);
      });
    return () => controller.abort();
  }, [url]);

  if (peaks.length === 0) {
    return (
      <div className="border-primary/40 absolute inset-x-0 top-2 bottom-2 border-y border-dashed" />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="absolute inset-1 flex items-center gap-px"
    >
      {peaks.map((peak, index) => (
        <span
          key={index}
          className="bg-primary/50 min-h-px flex-1"
          style={{ height: `${Math.max(4, peak * 100)}%` }}
        />
      ))}
    </div>
  );
}
