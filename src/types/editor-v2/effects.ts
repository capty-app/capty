import type { AspectRatio } from '../aspect-ratio';
import type { CameraStyle } from '../camera';
import type { CursorStyle } from '../cursor';
import type { Annotation, GradientOption } from '../editor';
import type { KeyboardSoundType } from '../audio';
import type { KeyboardStyle } from '../keyboard';
import type { SubtitleStyle } from '../subtitle';
import type { EditableDataLocator } from './media';
import type { TickRange, TimelineTick } from './time';

export type EffectTimeDomain =
  'asset-source' | 'content-timeline' | 'output-timeline';

export interface TransformEffectValue {
  positionX: number;
  positionY: number;
  scaleX: number;
  scaleY: number;
  rotationDegrees: number;
  anchorX: number;
  anchorY: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
}

export interface TransformEffect {
  id: string;
  kind: 'transform';
  enabled: boolean;
  value: TransformEffectValue;
}

export interface OpacityEffect {
  id: string;
  kind: 'opacity';
  enabled: boolean;
  opacity: number;
}

export interface CursorEffect {
  id: string;
  kind: 'cursor';
  enabled: boolean;
  timeDomain: EffectTimeDomain;
  data: EditableDataLocator;
  style: Omit<CursorStyle, 'enabled'>;
}

export interface ZoomEffect {
  id: string;
  kind: 'zoom';
  enabled: boolean;
  timeDomain: EffectTimeDomain;
  range: TickRange;
  scale: number;
  target: 'cursor' | 'manual';
  focusX?: number;
  focusY?: number;
  transitionInTicks: TimelineTick;
  transitionOutTicks: TimelineTick;
  followSmoothness: number;
  lookAheadTicks: TimelineTick;
}

export interface CameraLayoutEffect {
  id: string;
  kind: 'camera-layout';
  enabled: boolean;
  style: Omit<CameraStyle, 'visible'>;
}

export interface AnnotationEffect {
  id: string;
  kind: 'annotation';
  enabled: boolean;
  timeDomain: EffectTimeDomain;
  range: TickRange;
  canvasWidth: number;
  canvasHeight: number;
  annotations: Annotation[];
}

export interface KeyboardEffect {
  id: string;
  kind: 'keyboard';
  enabled: boolean;
  timeDomain: EffectTimeDomain;
  data: EditableDataLocator;
  style: Omit<KeyboardStyle, 'visible'>;
  sound: {
    enabled: boolean;
    volume: number;
    type: KeyboardSoundType;
  };
}

export interface SubtitleEffect {
  id: string;
  kind: 'subtitle';
  enabled: boolean;
  timeDomain: EffectTimeDomain;
  data: EditableDataLocator;
  style: Omit<SubtitleStyle, 'visible'>;
}

export interface AudioGainEffect {
  id: string;
  kind: 'audio-gain';
  enabled: boolean;
  gain: number;
}

export type ClipEffect =
  | TransformEffect
  | OpacityEffect
  | CursorEffect
  | ZoomEffect
  | CameraLayoutEffect
  | AnnotationEffect
  | KeyboardEffect
  | SubtitleEffect
  | AudioGainEffect;

export interface CanvasSettingsEffect {
  id: string;
  kind: 'canvas-settings';
  enabled: boolean;
  width: number;
  height: number;
  backgroundColor: string;
  aspectRatio: AspectRatio | null;
}

export interface WallpaperEffect {
  id: string;
  kind: 'wallpaper';
  enabled: boolean;
  background:
    | { kind: 'none' }
    | { kind: 'gradient'; gradient: GradientOption }
    | { kind: 'image'; assetId: string };
  padding: number;
  corners: number;
  shadow: number;
}

export interface DeviceFrameEffect {
  id: string;
  kind: 'device-frame';
  enabled: boolean;
  frame: 'ios-device';
}

export type SequenceEffect =
  CanvasSettingsEffect | WallpaperEffect | DeviceFrameEffect;
