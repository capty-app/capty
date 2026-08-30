import type { KeyboardSoundType } from '../audio';
import type { MediaSourceRole } from './media';
import type { Rational, TimelineTick } from './time';

export interface AudioEnvelopePlan {
  fadeIn?: { start: TimelineTick; end: TimelineTick };
  fadeOut?: { start: TimelineTick; end: TimelineTick };
  crossfade?: {
    transitionId: string;
    role: 'outgoing' | 'incoming';
    start: TimelineTick;
    end: TimelineTick;
  };
}

export interface AudioTimelineRegionPlan {
  kind: 'media';
  id: string;
  clipId: string;
  trackId: string;
  assetId: string;
  sourceStreamId?: string;
  sourceRole?: MediaSourceRole;
  outputStart: TimelineTick;
  outputEnd: TimelineTick;
  sourceStart: TimelineTick;
  sourceEnd: TimelineTick;
  playbackRate: Rational;
  gain: number;
  muted: boolean;
  solo: boolean;
  envelope: AudioEnvelopePlan;
}

export interface KeyboardSoundPlan {
  kind: 'keyboard-sound';
  id: string;
  clipId: string;
  effectId: string;
  outputTick: TimelineTick;
  volume: number;
  soundType: KeyboardSoundType;
  sampleIndex: number;
  playbackRate: Rational;
}

export interface AudioTimelinePlan {
  durationTicks: TimelineTick;
  regions: readonly AudioTimelineRegionPlan[];
  keyboardSounds: readonly KeyboardSoundPlan[];
}

export interface AudioRegionPlan extends AudioTimelineRegionPlan {
  sourceTick: TimelineTick;
  envelopeGain: number;
}

export interface AudioPlan {
  tick: TimelineTick;
  regions: readonly AudioRegionPlan[];
}
