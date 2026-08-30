import type { ClipEffect } from './effects';
import type { MediaSourceRole } from './media';
import type { Rational, TimelineTick } from './time';

export interface EditorClipBase {
  id: string;
  trackId: string;
  assetId: string;
  name: string;
  timelineStart: TimelineTick;
  timelineDuration: TimelineTick;
  sourceStart: TimelineTick;
  sourceDuration: TimelineTick;
  playbackRate: Rational;
  linkedGroupId?: string;
  effects: ClipEffect[];
}

export interface VideoClip extends EditorClipBase {
  kind: 'video';
  sourceStreamId?: string;
  sourceRole?: MediaSourceRole;
}

export interface ImageClip extends EditorClipBase {
  kind: 'image';
}

export interface AudioClip extends EditorClipBase {
  kind: 'audio';
  sourceStreamId?: string;
  sourceRole?: MediaSourceRole;
  gain: number;
  fadeInTicks: TimelineTick;
  fadeOutTicks: TimelineTick;
}

export type EditorClip = VideoClip | ImageClip | AudioClip;

export interface VideoTrack {
  id: string;
  kind: 'video';
  name: string;
  clipIds: string[];
  locked: boolean;
  visible: boolean;
  compositingOrder: number;
}

export interface AudioTrack {
  id: string;
  kind: 'audio';
  name: string;
  clipIds: string[];
  locked: boolean;
  muted: boolean;
  solo: boolean;
  gain: number;
  mixOrder: number;
}

export type EditorTrack = VideoTrack | AudioTrack;
