import { useState, useCallback, useRef } from 'react';
import type { Segment, TrimState, NativeVideoPlayerHandle } from '../types';
import { getSegmentDuration } from '../utils';
import { applyTrimDelta } from '../timeline/trim-math';

interface UseSegmentOperationsProps {
  segments: Segment[];
  setSegments: (updater: Segment[] | ((prev: Segment[]) => Segment[])) => void;
  setSegmentsWithoutHistory: (
    updater: Segment[] | ((prev: Segment[]) => Segment[])
  ) => void;
  commitSegmentsToHistory: () => void;
  totalTimelineDuration: number;
  nativePlayerRef: React.RefObject<NativeVideoPlayerHandle | null>;
  setTimelinePosition: (pos: number) => void;
  onTimelineRangesAdjust: (
    segmentIndex: number,
    oldSegmentDuration: number,
    newSegmentDuration: number,
    segmentStartOnTimeline: number,
    segmentEndOnTimeline: number,
    newTotalDuration: number,
    nextSegments: Segment[]
  ) => void;
}

interface UseSegmentOperationsReturn {
  selectedSegmentId: string | null;
  setSelectedSegmentId: (id: string | null) => void;
  isCutToolActive: boolean;
  trimState: TrimState | null;
  selectedSegmentSpeed: number;
  toggleCutTool: () => void;
  handleSegmentSelect: (segmentId: string | null) => void;
  handleDeleteSegment: () => void;
  handleTrimStart: (
    e: React.MouseEvent,
    segmentId: string,
    edge: 'start' | 'end'
  ) => void;
  handleTrimResize: (
    segmentId: string,
    edge: 'start' | 'end',
    deltaTlTime: number
  ) => void;
  handleTrimEnd: () => void;
  handleCut: (cutVideoTime: number) => void;
  handleSpeedChange: (speed: number) => void;
  handleReorderSegment: (segmentId: string, newIndex: number) => void;
  clearSegmentSelection: () => void;
}

export function useSegmentOperations({
  segments,
  setSegments,
  setSegmentsWithoutHistory,
  commitSegmentsToHistory,
  totalTimelineDuration,
  nativePlayerRef,
  setTimelinePosition,
  onTimelineRangesAdjust,
}: UseSegmentOperationsProps): UseSegmentOperationsReturn {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null
  );
  const [isCutToolActive, setIsCutToolActive] = useState(false);
  const [trimState, setTrimState] = useState<TrimState | null>(null);
  const setCurrentSegmentIndexRef = useRef<(idx: number) => void>(() => {});

  const toggleCutTool = useCallback(() => {
    setIsCutToolActive(prev => !prev);
    setSelectedSegmentId(null);
  }, []);

  const handleSegmentSelect = useCallback(
    (segmentId: string | null) => {
      if (isCutToolActive) return;
      setSelectedSegmentId(segmentId);
    },
    [isCutToolActive]
  );

  const handleDeleteSegment = useCallback(() => {
    if (!selectedSegmentId || segments.length <= 1) return;

    const newSegments = segments.filter(s => s.id !== selectedSegmentId);
    setSegments(newSegments);
    setSelectedSegmentId(null);
    setTimelinePosition(0);
    setCurrentSegmentIndexRef.current(0);

    if (newSegments.length > 0) {
      nativePlayerRef.current?.seekTo(0);
    }
  }, [
    selectedSegmentId,
    segments,
    setSegments,
    setTimelinePosition,
    nativePlayerRef,
  ]);

  const trimInitialValueRef = useRef<number | null>(null);

  const handleTrimStart = useCallback(
    (e: React.MouseEvent, segmentId: string, edge: 'start' | 'end') => {
      e.stopPropagation();
      e.preventDefault();

      const segment = segments.find(s => s.id === segmentId);
      if (!segment) return;

      trimInitialValueRef.current =
        edge === 'start' ? segment.originalStart : segment.originalEnd;
      setTrimState({ segmentId, edge });
    },
    [segments]
  );

  const handleTrimResize = useCallback(
    (segmentId: string, edge: 'start' | 'end', deltaTlTime: number) => {
      const initialValue = trimInitialValueRef.current;
      if (initialValue === null) return;

      setSegmentsWithoutHistory(prevSegments => {
        const segmentIndex = prevSegments.findIndex(
          (s: Segment) => s.id === segmentId
        );
        if (segmentIndex === -1) return prevSegments;

        const seg = prevSegments[segmentIndex];
        const newValue = applyTrimDelta(edge, seg, initialValue, deltaTlTime);

        return prevSegments.map((s: Segment, i: number) => {
          if (i !== segmentIndex) return s;
          return edge === 'start'
            ? { ...s, originalStart: newValue }
            : { ...s, originalEnd: newValue };
        });
      });
    },
    [setSegmentsWithoutHistory]
  );

  const handleTrimEnd = useCallback(() => {
    if (!trimState) return;

    const segment = segments.find((s: Segment) => s.id === trimState.segmentId);
    if (segment) {
      let timelinePos = 0;
      for (const seg of segments) {
        if (seg.id === segment.id) break;
        timelinePos += getSegmentDuration(seg);
      }
      nativePlayerRef.current?.seekTo(timelinePos);
    }
    commitSegmentsToHistory();
    trimInitialValueRef.current = null;
    setTrimState(null);
  }, [trimState, segments, commitSegmentsToHistory, nativePlayerRef]);

  const handleCut = useCallback(
    (cutVideoTime: number) => {
      const segmentIndex = segments.findIndex(
        seg =>
          cutVideoTime >= seg.originalStart && cutVideoTime <= seg.originalEnd
      );

      if (segmentIndex === -1) return;

      const segment = segments[segmentIndex];

      if (
        cutVideoTime > segment.originalStart + 0.1 &&
        cutVideoTime < segment.originalEnd - 0.1
      ) {
        const newSegments: Segment[] = [];

        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (i === segmentIndex) {
            newSegments.push({
              id: seg.id,
              originalStart: seg.originalStart,
              originalEnd: cutVideoTime,
              trimMinStart: seg.trimMinStart,
              trimMaxEnd: cutVideoTime,
              speed: seg.speed,
            });
            newSegments.push({
              id: crypto.randomUUID(),
              originalStart: cutVideoTime,
              originalEnd: seg.originalEnd,
              trimMinStart: cutVideoTime,
              trimMaxEnd: seg.trimMaxEnd,
              speed: seg.speed,
            });
          } else {
            newSegments.push(seg);
          }
        }

        setSegments(newSegments);
      }
    },
    [segments, setSegments]
  );

  const handleSpeedChange = useCallback(
    (speed: number) => {
      if (!selectedSegmentId) return;

      const segmentIndex = segments.findIndex(s => s.id === selectedSegmentId);
      if (segmentIndex === -1) return;

      const segment = segments[segmentIndex];
      const oldSpeed = segment.speed ?? 1;
      const segmentVideoDuration = segment.originalEnd - segment.originalStart;
      const oldSegmentDuration = segmentVideoDuration / oldSpeed;
      const newSegmentDuration = segmentVideoDuration / speed;

      let segmentStartOnTimeline = 0;
      for (let i = 0; i < segmentIndex; i++) {
        const seg = segments[i];
        const spd = seg.speed ?? 1;
        segmentStartOnTimeline += (seg.originalEnd - seg.originalStart) / spd;
      }

      const segmentEndOnTimeline = segmentStartOnTimeline + oldSegmentDuration;
      const durationDelta = newSegmentDuration - oldSegmentDuration;
      const newTotalDuration = totalTimelineDuration + durationDelta;
      const nextSegments = segments.map(seg =>
        seg.id === selectedSegmentId ? { ...seg, speed } : seg
      );

      onTimelineRangesAdjust(
        segmentIndex,
        oldSegmentDuration,
        newSegmentDuration,
        segmentStartOnTimeline,
        segmentEndOnTimeline,
        newTotalDuration,
        nextSegments
      );
    },
    [selectedSegmentId, segments, totalTimelineDuration, onTimelineRangesAdjust]
  );

  const handleReorderSegment = useCallback(
    (segmentId: string, newIndex: number) => {
      const currentIndex = segments.findIndex(s => s.id === segmentId);
      if (currentIndex === -1) return;
      if (currentIndex === newIndex) return;
      if (newIndex < 0 || newIndex >= segments.length) return;

      const newSegments = [...segments];
      const [moved] = newSegments.splice(currentIndex, 1);
      newSegments.splice(newIndex, 0, moved);
      setSegments(newSegments);
      setSelectedSegmentId(segmentId);
    },
    [segments, setSegments]
  );

  const selectedSegmentSpeed = (() => {
    if (!selectedSegmentId) return 1;
    const segment = segments.find(s => s.id === selectedSegmentId);
    return segment?.speed ?? 1;
  })();

  const clearSegmentSelection = useCallback(() => {
    setSelectedSegmentId(null);
    setIsCutToolActive(false);
  }, []);

  return {
    selectedSegmentId,
    setSelectedSegmentId,
    isCutToolActive,
    trimState,
    selectedSegmentSpeed,
    toggleCutTool,
    handleSegmentSelect,
    handleDeleteSegment,
    handleTrimStart,
    handleTrimResize,
    handleTrimEnd,
    handleCut,
    handleSpeedChange,
    handleReorderSegment,
    clearSegmentSelection,
  };
}
