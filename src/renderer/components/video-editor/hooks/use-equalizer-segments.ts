import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SidebarTab } from '../editor-sidebar';
import type { SliceController } from './use-editor-history';
import type { EqualizerSegment, EqualizerSettings } from '@/types/equalizer';
import { DEFAULT_EQUALIZER_SETTINGS } from '@/types/equalizer';

interface UseEqualizerSegmentsProps {
  totalTimelineDuration: number;
  activateSidebarTab: (tab: SidebarTab) => void;
  slice: SliceController<EqualizerSegment[]>;
}

const PLACEMENT_EPSILON = 0.000001;

function overlapsExisting(
  segments: EqualizerSegment[],
  startTime: number,
  endTime: number,
  excludedId?: string
): boolean {
  return segments.some(segment => {
    if (segment.id === excludedId) return false;
    return startTime < segment.endTime && endTime > segment.startTime;
  });
}

function findFreePlacement(
  segments: EqualizerSegment[],
  totalDuration: number,
  duration: number,
  preferredStart: number
): { startTime: number; endTime: number } | null {
  if (duration <= 0 || duration > totalDuration + PLACEMENT_EPSILON) {
    return null;
  }

  const candidates = new Set<number>([
    preferredStart,
    0,
    totalDuration - duration,
  ]);
  for (const segment of segments) {
    candidates.add(segment.endTime);
    candidates.add(segment.startTime - duration);
  }

  return (
    [...candidates]
      .filter(
        candidate =>
          candidate >= 0 &&
          candidate + duration <= totalDuration + PLACEMENT_EPSILON
      )
      .sort(
        (first, second) =>
          Math.abs(first - preferredStart) - Math.abs(second - preferredStart)
      )
      .map(candidate => ({
        startTime: candidate,
        endTime: Math.min(candidate + duration, totalDuration),
      }))
      .find(
        range => !overlapsExisting(segments, range.startTime, range.endTime)
      ) ?? null
  );
}

export function useEqualizerSegments({
  totalTimelineDuration,
  activateSidebarTab,
  slice,
}: UseEqualizerSegmentsProps) {
  const {
    value: equalizerSegments,
    set: setEqualizerSegments,
    setWithoutHistory,
    commit,
  } = slice;
  const [selectedEqualizerId, setSelectedEqualizerId] = useState<string | null>(
    null
  );
  const segmentsRef = useRef(equalizerSegments);
  const gestureActiveRef = useRef(false);

  useEffect(() => {
    segmentsRef.current = equalizerSegments;
  }, [equalizerSegments]);

  useEffect(() => {
    if (
      selectedEqualizerId !== null &&
      !equalizerSegments.some(segment => segment.id === selectedEqualizerId)
    ) {
      setSelectedEqualizerId(null);
    }
  }, [equalizerSegments, selectedEqualizerId]);

  useEffect(() => {
    if (totalTimelineDuration <= 0) return;

    const needsCleanup = segmentsRef.current.some(
      segment =>
        segment.startTime >= totalTimelineDuration ||
        segment.endTime > totalTimelineDuration
    );
    if (!needsCleanup) return;

    setWithoutHistory(previous =>
      previous
        .filter(segment => segment.startTime < totalTimelineDuration)
        .map(segment => ({
          ...segment,
          endTime: Math.min(segment.endTime, totalTimelineDuration),
        }))
        .filter(segment => segment.endTime - segment.startTime >= 0.1)
    );
  }, [setWithoutHistory, totalTimelineDuration]);

  const wouldOverlap = useCallback(
    (startTime: number, endTime: number, excludedId?: string) =>
      overlapsExisting(segmentsRef.current, startTime, endTime, excludedId),
    []
  );

  const selectEqualizer = useCallback(
    (id: string | null) => {
      setSelectedEqualizerId(id);
      if (id !== null) activateSidebarTab('audio');
    },
    [activateSidebarTab]
  );

  const handleAddEqualizer = useCallback(
    (startTime: number, endTime: number) => {
      if (totalTimelineDuration <= 0) return;

      const boundedStart = Math.max(
        0,
        Math.min(startTime, totalTimelineDuration)
      );
      const boundedEnd = Math.max(
        boundedStart,
        Math.min(endTime, totalTimelineDuration)
      );
      if (
        boundedEnd - boundedStart < 0.1 ||
        wouldOverlap(boundedStart, boundedEnd)
      ) {
        return;
      }

      const segment: EqualizerSegment = {
        ...DEFAULT_EQUALIZER_SETTINGS,
        id: crypto.randomUUID(),
        startTime: boundedStart,
        endTime: boundedEnd,
      };
      setEqualizerSegments(previous => [...previous, segment]);
      selectEqualizer(segment.id);
    },
    [selectEqualizer, setEqualizerSegments, totalTimelineDuration, wouldOverlap]
  );

  const handleDuplicateEqualizer = useCallback(
    (id: string) => {
      if (totalTimelineDuration <= 0) return;

      const source = segmentsRef.current.find(segment => segment.id === id);
      if (!source) return;

      const duration = source.endTime - source.startTime;
      const placement = findFreePlacement(
        segmentsRef.current,
        totalTimelineDuration,
        duration,
        source.endTime
      );
      if (!placement) return;

      const segment: EqualizerSegment = {
        ...source,
        id: crypto.randomUUID(),
        startTime: placement.startTime,
        endTime: placement.endTime,
      };
      setEqualizerSegments(previous => [...previous, segment]);
      selectEqualizer(segment.id);
    },
    [selectEqualizer, setEqualizerSegments, totalTimelineDuration]
  );

  const handleUpdateEqualizerTime = useCallback(
    (id: string, startTime: number, endTime: number) => {
      if (
        startTime < 0 ||
        endTime > totalTimelineDuration ||
        endTime - startTime < 0.1 ||
        wouldOverlap(startTime, endTime, id)
      ) {
        return;
      }

      gestureActiveRef.current = true;
      setWithoutHistory(previous =>
        previous.map(segment =>
          segment.id === id ? { ...segment, startTime, endTime } : segment
        )
      );
    },
    [setWithoutHistory, totalTimelineDuration, wouldOverlap]
  );

  const handleCommitEqualizerGesture = useCallback(() => {
    if (!gestureActiveRef.current) return;
    gestureActiveRef.current = false;
    commit();
  }, [commit]);

  const handleUpdateEqualizer = useCallback(
    (id: string, settings: EqualizerSettings) => {
      setEqualizerSegments(previous =>
        previous.map(segment =>
          segment.id === id ? { ...segment, ...settings } : segment
        )
      );
    },
    [setEqualizerSegments]
  );

  const handleUpdateEqualizerLive = useCallback(
    (id: string, settings: EqualizerSettings) => {
      gestureActiveRef.current = true;
      setWithoutHistory(previous =>
        previous.map(segment =>
          segment.id === id ? { ...segment, ...settings } : segment
        )
      );
    },
    [setWithoutHistory]
  );

  const handleDeleteEqualizer = useCallback(
    (id: string) => {
      setEqualizerSegments(previous =>
        previous.filter(segment => segment.id !== id)
      );
      setSelectedEqualizerId(current => (current === id ? null : current));
    },
    [setEqualizerSegments]
  );

  const clearEqualizerSelection = useCallback(() => {
    setSelectedEqualizerId(null);
  }, []);

  const selectedEqualizer = useMemo(
    () =>
      equalizerSegments.find(segment => segment.id === selectedEqualizerId) ??
      null,
    [equalizerSegments, selectedEqualizerId]
  );

  return {
    equalizerSegments,
    selectedEqualizerId,
    selectedEqualizer,
    selectEqualizer,
    clearEqualizerSelection,
    handleAddEqualizer,
    handleDuplicateEqualizer,
    handleUpdateEqualizerTime,
    handleCommitEqualizerGesture,
    handleUpdateEqualizer,
    handleUpdateEqualizerLive,
    handleDeleteEqualizer,
  };
}
