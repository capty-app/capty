import type { Segment } from '../types';
import type { VideoSegment } from '@/types/video';
import type { CursorData, CursorStyle } from '@/types/cursor';
import type { ZoomSegment, ZoomSettings } from '@/types/zoom';
import type { CameraStyle } from '@/types/camera';
import type { KeyboardData, KeyboardStyle } from '@/types/keyboard';
import type { SubtitleData, SubtitleStyle } from '@/types/subtitle';
import type { VideoWallpaperSettings } from '@/types/video-wallpaper';
import type { FirstFrameSettings } from '@/types/first-frame';
import type { DrawingSegment } from '@/types/drawing';

export interface CompositionConfig {
  videoWidth: number;
  videoHeight: number;
  segments: Segment[];
  wallpaper: VideoWallpaperSettings | null;
  zoomSegments?: ZoomSegment[] | null;
  zoomSettings?: ZoomSettings | null;
  drawingSegments?: DrawingSegment[] | null;
  redactOnlyDrawings?: boolean;
  cursorData?: CursorData | null;
  cursorStyle?: CursorStyle | null;
  cameraStyle?: CameraStyle | null;
  keyboardData?: KeyboardData | null;
  keyboardStyle?: KeyboardStyle | null;
  subtitleData?: SubtitleData | null;
  subtitleStyle?: SubtitleStyle | null;
  deviceFrame?: boolean;
  firstFrame?: FirstFrameSettings | null;
  fps?: number;
}

export interface FrameSource {
  video:
    | HTMLVideoElement
    | VideoFrame
    | ImageBitmap
    | HTMLCanvasElement
    | OffscreenCanvas;
  camera?:
    | HTMLVideoElement
    | VideoFrame
    | ImageBitmap
    | HTMLCanvasElement
    | OffscreenCanvas
    | null;
}

export interface ViewportState {
  x: number;
  y: number;
}

export type Context2D =
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function convertSegmentsToVideoSegments(
  segments: Segment[]
): VideoSegment[] {
  const result: VideoSegment[] = [];
  let timelineStart = 0;

  for (const seg of segments) {
    const speed = seg.speed ?? 1;
    const effectiveDuration = (seg.originalEnd - seg.originalStart) / speed;
    result.push({
      id: seg.id,
      startTime: seg.originalStart,
      endTime: seg.originalEnd,
      timelineStart,
      speed,
    });
    timelineStart += effectiveDuration;
  }

  return result;
}

export function mapTimelineToVideoTime(
  timelineTime: number,
  segments: VideoSegment[]
): number | null {
  for (const seg of segments) {
    const speed = seg.speed ?? 1;
    const effectiveDuration = (seg.endTime - seg.startTime) / speed;
    const segEnd = seg.timelineStart + effectiveDuration;
    if (timelineTime >= seg.timelineStart && timelineTime < segEnd) {
      const timelineOffset = timelineTime - seg.timelineStart;
      const videoOffset = timelineOffset * speed;
      return seg.startTime + videoOffset;
    }
  }
  return null;
}
