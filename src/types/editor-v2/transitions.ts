import type { TimelineTick } from './time';

export interface CenteredTransitionBase {
  id: string;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  cutTick: TimelineTick;
  durationTicks: TimelineTick;
  alignment: 'center';
}

export interface VideoCrossDissolveTransition extends CenteredTransitionBase {
  type: 'video-cross-dissolve';
}

export interface AudioCrossfadeTransition extends CenteredTransitionBase {
  type: 'audio-crossfade';
}

export interface VideoFadeBlackTransition {
  id: string;
  type: 'video-fade-black';
  trackId: string;
  clipId: string;
  edge: 'in' | 'out';
  durationTicks: TimelineTick;
}

export type EditorTransition =
  | VideoCrossDissolveTransition
  | AudioCrossfadeTransition
  | VideoFadeBlackTransition;
