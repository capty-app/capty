import { isValidPlaybackSpeed } from '@/types/playback-speed';
import type {
  VideoEditorSegment,
  VideoEditorState,
} from '@/types/video-editor-state';
import type {
  V1NormalizationDiagnostic,
  V1ProjectNormalizationContext,
} from './normalization-types';
import { isFiniteNumber, isRecord } from './normalization-utils';

export const normalizeSegments = (
  segments: VideoEditorState['segments'] | undefined,
  context: V1ProjectNormalizationContext,
  diagnostics: V1NormalizationDiagnostic[]
): VideoEditorSegment[] => {
  const normalized = (segments ?? []).flatMap((segment, index) => {
    if (
      !isFiniteNumber(segment.originalStart) ||
      !isFiniteNumber(segment.originalEnd) ||
      segment.originalStart < 0 ||
      segment.originalEnd > context.recordingDuration ||
      segment.originalStart >= segment.originalEnd
    ) {
      diagnostics.push({ code: 'invalid-segment', path: `segments.${index}` });
      return [];
    }

    const validTrimBounds =
      isFiniteNumber(segment.trimMinStart) &&
      isFiniteNumber(segment.trimMaxEnd) &&
      segment.trimMinStart >= 0 &&
      segment.trimMinStart <= segment.originalStart &&
      segment.trimMaxEnd >= segment.originalEnd &&
      segment.trimMaxEnd <= context.recordingDuration;
    const speed = segment.speed;
    const validSpeed = speed === undefined || isValidPlaybackSpeed(speed);

    if (!validSpeed) {
      diagnostics.push({
        code: 'invalid-speed',
        path: `segments.${index}.speed`,
      });
    }

    return [
      {
        ...segment,
        trimMinStart: validTrimBounds
          ? segment.trimMinStart
          : segment.originalStart,
        trimMaxEnd: validTrimBounds ? segment.trimMaxEnd : segment.originalEnd,
        ...(speed === undefined && validSpeed
          ? {}
          : { speed: validSpeed ? speed : 1 }),
      },
    ];
  });

  if (normalized.length > 0) return normalized;

  return [
    {
      id: context.createSegmentId(),
      originalStart: 0,
      originalEnd: context.recordingDuration,
      trimMinStart: 0,
      trimMaxEnd: context.recordingDuration,
    },
  ];
};

export const getTimelineDuration = (segments: VideoEditorSegment[]): number =>
  segments.reduce(
    (duration, segment) =>
      duration +
      (segment.originalEnd - segment.originalStart) / (segment.speed ?? 1),
    0
  );

export const normalizeZoomSegments = (
  value: VideoEditorState['zoomSegments'] | undefined,
  timelineDuration: number,
  diagnostics: V1NormalizationDiagnostic[]
): VideoEditorState['zoomSegments'] =>
  (value ?? []).filter((segment, index) => {
    const focusPoint: unknown = segment.focusPoint;
    const validFocus =
      focusPoint === undefined ||
      (isRecord(focusPoint) &&
        isFiniteNumber(focusPoint.x) &&
        isFiniteNumber(focusPoint.y) &&
        focusPoint.x >= 0 &&
        focusPoint.x <= 1 &&
        focusPoint.y >= 0 &&
        focusPoint.y <= 1);
    const valid =
      isFiniteNumber(segment.startTime) &&
      isFiniteNumber(segment.endTime) &&
      isFiniteNumber(segment.zoomLevel) &&
      segment.startTime >= 0 &&
      segment.endTime <= timelineDuration &&
      segment.startTime < segment.endTime &&
      segment.zoomLevel >= 1 &&
      segment.zoomLevel <= 3 &&
      (segment.targetMode === undefined ||
        segment.targetMode === 'cursor' ||
        segment.targetMode === 'manual') &&
      validFocus &&
      (segment.transitionInDuration === undefined ||
        (isFiniteNumber(segment.transitionInDuration) &&
          segment.transitionInDuration >= 0)) &&
      (segment.transitionOutDuration === undefined ||
        (isFiniteNumber(segment.transitionOutDuration) &&
          segment.transitionOutDuration >= 0));

    if (!valid) {
      diagnostics.push({ code: 'invalid-zoom', path: `zoomSegments.${index}` });
    }

    return valid;
  });
