import type { Segment, VideoToTimelineResult } from './types';
import type { DrawingSegment } from '@/types/drawing';
import type { EqualizerSegment } from '@/types/equalizer';
import type { ZoomSegment } from '@/types/zoom';

interface TimelineRange {
  startTime: number;
  endTime: number;
}

export interface TimelineRangeAdjustment {
  oldSegmentDuration: number;
  newSegmentDuration: number;
  segmentStartOnTimeline: number;
  segmentEndOnTimeline: number;
  newTotalDuration: number;
  minDuration?: number;
}

interface TimelineRangeSliceAdjustment {
  nextSegments: Segment[];
  zoomSegments: ZoomSegment[];
  drawingSegments: DrawingSegment[];
  equalizerSegments: EqualizerSegment[];
  adjustment: TimelineRangeAdjustment;
  drawingMinDuration: number;
}

export interface AdjustedTimelineRangeSlices {
  segments: Segment[];
  zoomSegments: ZoomSegment[];
  drawingSegments: DrawingSegment[];
  equalizerSegments: EqualizerSegment[];
}

export interface SegmentBoundaryTransition {
  isFinalSegment: boolean;
  nextSegmentIndex: number | null;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m${secs}s`;
}

export function getSegmentDuration(segment: Segment): number {
  const speed = segment.speed ?? 1;
  return (segment.originalEnd - segment.originalStart) / speed;
}

export function getTotalTimelineDuration(segments: Segment[]): number {
  return segments.reduce((sum, seg) => sum + getSegmentDuration(seg), 0);
}

export function adjustTimelineRanges<T extends TimelineRange>(
  ranges: T[],
  {
    oldSegmentDuration,
    newSegmentDuration,
    segmentStartOnTimeline,
    segmentEndOnTimeline,
    newTotalDuration,
    minDuration = 0.1,
  }: TimelineRangeAdjustment
): T[] {
  const durationDelta = newSegmentDuration - oldSegmentDuration;

  if (oldSegmentDuration <= 0) {
    return ranges
      .map(range => {
        if (range.startTime < segmentEndOnTimeline) return range;

        return {
          ...range,
          startTime: range.startTime + durationDelta,
          endTime: range.endTime + durationDelta,
        };
      })
      .filter(range => range.startTime < newTotalDuration)
      .map(range => ({
        ...range,
        endTime: Math.min(range.endTime, newTotalDuration),
      }))
      .filter(range => range.endTime - range.startTime >= minDuration);
  }

  const scale = newSegmentDuration / oldSegmentDuration;
  const mapPoint = (time: number) =>
    segmentStartOnTimeline + (time - segmentStartOnTimeline) * scale;

  return ranges
    .map(range => {
      let { startTime, endTime } = range;

      if (startTime >= segmentEndOnTimeline) {
        startTime += durationDelta;
        endTime += durationDelta;
      } else if (endTime > segmentStartOnTimeline) {
        startTime =
          startTime < segmentStartOnTimeline
            ? startTime
            : mapPoint(Math.min(startTime, segmentEndOnTimeline));
        endTime =
          endTime > segmentEndOnTimeline
            ? endTime + durationDelta
            : mapPoint(Math.max(endTime, segmentStartOnTimeline));
      }

      return { ...range, startTime, endTime };
    })
    .filter(range => range.startTime < newTotalDuration)
    .map(range => ({
      ...range,
      endTime: Math.min(range.endTime, newTotalDuration),
    }))
    .filter(range => range.endTime - range.startTime >= minDuration);
}

export function adjustTimelineRangeSlices({
  nextSegments,
  zoomSegments,
  drawingSegments,
  equalizerSegments,
  adjustment,
  drawingMinDuration,
}: TimelineRangeSliceAdjustment): AdjustedTimelineRangeSlices {
  return {
    segments: nextSegments,
    zoomSegments: adjustTimelineRanges(zoomSegments, adjustment),
    drawingSegments: adjustTimelineRanges(drawingSegments, {
      ...adjustment,
      minDuration: drawingMinDuration,
    }),
    equalizerSegments: adjustTimelineRanges(equalizerSegments, adjustment),
  };
}

export function mapAnnotationIdsToSegmentIds(
  annotationIds: string[],
  annotationToSegment: Map<string, string>
): string[] {
  const segmentIds: string[] = [];
  const seen = new Set<string>();

  for (const annotationId of annotationIds) {
    const segmentId = annotationToSegment.get(annotationId);
    if (segmentId === undefined || seen.has(segmentId)) continue;
    seen.add(segmentId);
    segmentIds.push(segmentId);
  }

  return segmentIds;
}

export function getTimelineStartForSegment(
  segments: Segment[],
  segIndex: number
): number {
  let pos = 0;
  for (let i = 0; i < segIndex && i < segments.length; i++) {
    pos += getSegmentDuration(segments[i]);
  }
  return pos;
}

export function timelineToVideo(
  segments: Segment[],
  tlPos: number
): VideoToTimelineResult {
  let accumulated = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const speed = seg.speed ?? 1;
    const effectiveDuration = getSegmentDuration(seg);
    if (tlPos < accumulated + effectiveDuration) {
      const offsetInSegment = tlPos - accumulated;
      const videoOffset = offsetInSegment * speed;
      return {
        videoTime: seg.originalStart + videoOffset,
        segmentIndex: i,
        segment: seg,
      };
    }
    accumulated += effectiveDuration;
  }
  if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1];
    return {
      videoTime: lastSeg.originalEnd,
      segmentIndex: segments.length - 1,
      segment: lastSeg,
    };
  }
  return { videoTime: 0, segmentIndex: 0, segment: null };
}

export function videoToTimeline(
  segments: Segment[],
  videoTime: number
): number {
  let accumulated = 0;
  for (const seg of segments) {
    const speed = seg.speed ?? 1;
    if (videoTime >= seg.originalStart && videoTime <= seg.originalEnd) {
      return accumulated + (videoTime - seg.originalStart) / speed;
    }
    accumulated += getSegmentDuration(seg);
  }
  return accumulated;
}

export function getSegmentBoundaryTransition(
  segments: Segment[],
  currentSegmentIndex: number
): SegmentBoundaryTransition {
  if (segments.length === 0) {
    return {
      isFinalSegment: true,
      nextSegmentIndex: null,
    };
  }

  const nextSegmentIndex = currentSegmentIndex + 1;

  if (nextSegmentIndex >= segments.length) {
    return {
      isFinalSegment: true,
      nextSegmentIndex: null,
    };
  }

  return {
    isFinalSegment: false,
    nextSegmentIndex,
  };
}

export const SCISSORS_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23c7894a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='6' cy='6' r='3'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Cline x1='20' y1='4' x2='8.12' y2='15.88'/%3E%3Cline x1='14.47' y1='14.48' x2='20' y2='20'/%3E%3Cline x1='8.12' y1='8.12' x2='12' y2='12'/%3E%3C/svg%3E") 12 12, crosshair`;
