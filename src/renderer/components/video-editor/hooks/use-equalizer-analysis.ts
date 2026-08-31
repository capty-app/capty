import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getRequiredEqualizerTrackIds,
  loadEqualizerTrackData,
} from '../equalizer/audio-analysis';
import type { EqualizerSegment, EqualizerTrackData } from '@/types/equalizer';
import type { MusicTrack } from '@/types/music';

interface UseEqualizerAnalysisOptions {
  enabled: boolean;
  segments: EqualizerSegment[];
  tracks: MusicTrack[];
  sourceVideoPath: string;
}

interface UseEqualizerAnalysisReturn {
  trackData: EqualizerTrackData[];
  isLoading: boolean;
  hasError: boolean;
  getTrackData: (signal?: AbortSignal) => Promise<EqualizerTrackData[]>;
}

export function useEqualizerAnalysis(
  options: UseEqualizerAnalysisOptions
): UseEqualizerAnalysisReturn {
  const [trackData, setTrackData] = useState<EqualizerTrackData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const requiredTrackIdsKey = useMemo(
    () =>
      JSON.stringify(
        getRequiredEqualizerTrackIds(options.segments, options.tracks)
      ),
    [options.segments, options.tracks]
  );
  const loadOptions = useMemo(
    () => ({
      tracks: options.tracks,
      requiredTrackIds: JSON.parse(requiredTrackIdsKey) as string[],
      sourceVideoPath: options.sourceVideoPath,
    }),
    [options.tracks, options.sourceVideoPath, requiredTrackIdsKey]
  );

  const getTrackData = useCallback(
    (signal?: AbortSignal) => {
      if (!options.enabled) return Promise.resolve([]);
      return loadEqualizerTrackData(loadOptions, signal);
    },
    [loadOptions, options.enabled]
  );

  useEffect(() => {
    if (!options.enabled) {
      setTrackData([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setHasError(false);

    getTrackData(controller.signal)
      .then(data => setTrackData(data))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setTrackData([]);
        setHasError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [getTrackData, options.enabled]);

  return { trackData, isLoading, hasError, getTrackData };
}
