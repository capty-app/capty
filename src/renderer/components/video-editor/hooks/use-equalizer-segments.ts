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
      segmentsRef.current.some(segment => {
        if (segment.id === excludedId) return false;
        return startTime < segment.endTime && endTime > segment.startTime;
      }),
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
        enabled: true,
        id: crypto.randomUUID(),
        startTime: boundedStart,
        endTime: boundedEnd,
      };
      setEqualizerSegments(previous => [...previous, segment]);
      selectEqualizer(segment.id);
    },
    [selectEqualizer, setEqualizerSegments, totalTimelineDuration, wouldOverlap]
  );

  const handleSetEnabled = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        setEqualizerSegments([]);
        setSelectedEqualizerId(null);
        return;
      }

      const existing = segmentsRef.current[0];
      if (existing) {
        selectEqualizer(existing.id);
        return;
      }

      handleAddEqualizer(0, totalTimelineDuration);
    },
    [
      handleAddEqualizer,
      selectEqualizer,
      setEqualizerSegments,
      totalTimelineDuration,
    ]
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
          segment.id === id
            ? { ...segment, ...settings, enabled: true }
            : segment
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
          segment.id === id
            ? { ...segment, ...settings, enabled: true }
            : segment
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
    handleSetEnabled,
    handleUpdateEqualizerTime,
    handleCommitEqualizerGesture,
    handleUpdateEqualizer,
    handleUpdateEqualizerLive,
    handleDeleteEqualizer,
  };
}
