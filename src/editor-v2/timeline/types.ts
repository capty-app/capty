import type { FirstFrameFit } from '@/types/first-frame';
import type {
  ClipEffect,
  EditorProjectV2,
  MediaAsset,
  MediaSourceRole,
  Rational,
  SequenceEffect,
  TimelineTick,
  TransformEffectValue,
} from '@/types/editor-v2';

export type EvaluatedTransform = TransformEffectValue;

export interface VideoTransitionContribution {
  type: 'cross-dissolve';
  transitionId: string;
  role: 'outgoing' | 'incoming';
  progress: number;
}

export interface FadeBlackContribution {
  type: 'fade-black';
  transitionId: string;
  opacity: number;
}

interface FrameLayerPlanBase {
  kind: 'media';
  layerId: string;
  assetId: string;
  assetKind: MediaAsset['kind'];
  sourceStreamId?: string;
  sourceRole?: MediaSourceRole;
  sourceTick: TimelineTick;
  transform: EvaluatedTransform;
  opacity: number;
  effects: readonly ClipEffect[];
}

export interface ClipFrameLayerPlan extends FrameLayerPlanBase {
  origin: 'clip';
  clipId: string;
  trackId: string;
  trackOrder: number;
  transition?: VideoTransitionContribution;
}

export interface PreRollFrameLayerPlan extends FrameLayerPlanBase {
  origin: 'pre-roll';
  preRollAssetId: string;
  fit: FirstFrameFit;
  trackId: 'pre-roll';
  trackOrder: -1;
}

export type FrameLayerPlan = ClipFrameLayerPlan | PreRollFrameLayerPlan;

export interface BlackLayerPlan {
  kind: 'black';
  layerId: string;
  trackId: string;
  trackOrder: number;
  opacity: number;
  transition: FadeBlackContribution;
}

export type VisualLayerPlan = FrameLayerPlan | BlackLayerPlan;

export interface AudioRegionPlan {
  clipId: string;
  trackId: string;
  assetId: string;
  sourceStreamId?: string;
  sourceRole?: MediaSourceRole;
  sourceTick: TimelineTick;
  playbackRate: Rational;
  gain: number;
  muted: boolean;
  solo: boolean;
}

export interface AudioPlan {
  tick: TimelineTick;
  regions: readonly AudioRegionPlan[];
}

export interface CompositionSpec {
  width: number;
  height: number;
  backgroundColor: string;
  effects: readonly SequenceEffect[];
}

export interface SequenceEvaluation {
  outputTick: TimelineTick;
  contentTick: TimelineTick | null;
  preRollTicks: TimelineTick;
  layers: readonly VisualLayerPlan[];
  audio: AudioPlan;
  composition: CompositionSpec;
}

export type EvaluatedProject = Pick<
  EditorProjectV2,
  'timebase' | 'assets' | 'sequence'
>;
