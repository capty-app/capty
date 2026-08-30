import type { VideoEditorSegment } from '@/types/video-editor-state';

export type Segment = VideoEditorSegment;

export interface TrimState {
  segmentId: string;
  edge: 'start' | 'end';
}

export interface VideoToTimelineResult {
  videoTime: number;
  segmentIndex: number;
  segment: Segment | null;
}

export interface NativeVideoPlayerHandle {
  getCurrentTime: () => number;
  seekTo: (timeInSeconds: number) => void;
  setPreviewTime: (timeInSeconds: number | null) => void;
  play: () => void;
  pause: () => void;
  isPlaying: () => boolean;
  getVideoRef: () => HTMLVideoElement | null;
}
