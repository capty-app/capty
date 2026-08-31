import { describe, expect, it } from 'vitest';
import {
  adjustTimelineRanges,
  adjustTimelineRangeSlices,
} from '../../src/renderer/components/video-editor/utils';
import type { DrawingSegment } from '../../src/types/drawing';
import type { EqualizerSegment } from '../../src/types/equalizer';
import { DEFAULT_EQUALIZER_SETTINGS } from '../../src/types/equalizer';
import type { ZoomSegment } from '../../src/types/zoom';
import type { Segment } from '../../src/renderer/components/video-editor/types';

interface TestRange {
  id: string;
  startTime: number;
  endTime: number;
}

const baseAdjustment = {
  oldSegmentDuration: 4,
  newSegmentDuration: 2,
  segmentStartOnTimeline: 2,
  segmentEndOnTimeline: 6,
  newTotalDuration: 8,
};

describe('adjustTimelineRanges', () => {
  it('shifts ranges after the changed segment by the duration delta', () => {
    const result = adjustTimelineRanges<TestRange>(
      [{ id: 'after', startTime: 7, endTime: 9 }],
      baseAdjustment
    );

    expect(result).toEqual([{ id: 'after', startTime: 5, endTime: 7 }]);
  });

  it('scales ranges inside the changed segment', () => {
    const result = adjustTimelineRanges<TestRange>(
      [{ id: 'inside', startTime: 3, endTime: 5 }],
      baseAdjustment
    );

    expect(result).toEqual([{ id: 'inside', startTime: 2.5, endTime: 3.5 }]);
  });

  it('keeps leading time and shifts trailing time for ranges spanning the changed segment', () => {
    const result = adjustTimelineRanges<TestRange>(
      [{ id: 'spanning', startTime: 1, endTime: 7 }],
      baseAdjustment
    );

    expect(result).toEqual([{ id: 'spanning', startTime: 1, endTime: 5 }]);
  });

  it('maps ranges that start inside and end after the changed segment', () => {
    const result = adjustTimelineRanges<TestRange>(
      [{ id: 'inside-after', startTime: 3, endTime: 7 }],
      baseAdjustment
    );

    expect(result).toEqual([
      { id: 'inside-after', startTime: 2.5, endTime: 5 },
    ]);
  });

  it('drops ranges below the configured minimum duration', () => {
    const result = adjustTimelineRanges<TestRange>(
      [{ id: 'short', startTime: 3, endTime: 3.4 }],
      { ...baseAdjustment, minDuration: 0.3 }
    );

    expect(result).toEqual([]);
  });

  it('adjusts video, zoom, drawing, and equalizer timeline slices together', () => {
    const nextSegments: Segment[] = [
      {
        id: 'video',
        originalStart: 0,
        originalEnd: 4,
        trimMinStart: 0,
        trimMaxEnd: 4,
        speed: 2,
      },
    ];
    const zoomSegments: ZoomSegment[] = [
      {
        id: 'zoom',
        startTime: 3,
        endTime: 5,
        zoomLevel: 2,
      },
    ];
    const drawingSegments: DrawingSegment[] = [
      {
        id: 'drawing',
        startTime: 3,
        endTime: 5,
        canvasWidth: 100,
        canvasHeight: 100,
        annotations: [],
      },
    ];
    const equalizerSegments: EqualizerSegment[] = [
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        enabled: true,
        id: 'equalizer',
        startTime: 3,
        endTime: 5,
      },
    ];

    const result = adjustTimelineRangeSlices({
      nextSegments,
      zoomSegments,
      drawingSegments,
      equalizerSegments,
      adjustment: baseAdjustment,
      drawingMinDuration: 0.3,
    });

    expect(result.segments).toBe(nextSegments);
    expect(result.zoomSegments).toEqual([
      { id: 'zoom', startTime: 2.5, endTime: 3.5, zoomLevel: 2 },
    ]);
    expect(result.drawingSegments).toEqual([
      {
        id: 'drawing',
        startTime: 2.5,
        endTime: 3.5,
        canvasWidth: 100,
        canvasHeight: 100,
        annotations: [],
      },
    ]);
    expect(result.equalizerSegments).toEqual([
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        enabled: true,
        id: 'equalizer',
        startTime: 2.5,
        endTime: 3.5,
      },
    ]);
  });
});
