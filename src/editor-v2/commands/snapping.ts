import type { EditorProjectV2, TimelineTick } from '@/types/editor-v2';

export type SnapGuideKind =
  | 'sequence-start'
  | 'playhead'
  | 'clip-start'
  | 'clip-end'
  | 'transition-start'
  | 'transition-cut'
  | 'transition-end';

export interface SnapGuide {
  kind: SnapGuideKind;
  tick: TimelineTick;
  sourceId?: string;
}

export interface SnapResult {
  tick: TimelineTick;
  snapped: boolean;
  guide?: SnapGuide;
}

export interface SolveSnapInput {
  project: Pick<EditorProjectV2, 'sequence'>;
  candidateTick: TimelineTick;
  pixelsPerTick: number;
  pixelThreshold: number;
  playheadTick?: TimelineTick;
  excludeClipIds?: ReadonlySet<string>;
}

const transitionGuides = (
  project: Pick<EditorProjectV2, 'sequence'>
): SnapGuide[] =>
  Object.values(project.sequence.transitions).flatMap(transition => {
    if (transition.type === 'video-fade-black') {
      const clip = project.sequence.clips[transition.clipId];
      if (!clip) return [];
      const edge =
        transition.edge === 'in'
          ? clip.timelineStart
          : clip.timelineStart + clip.timelineDuration;
      const other =
        transition.edge === 'in'
          ? edge + transition.durationTicks
          : edge - transition.durationTicks;
      return [
        {
          kind: 'transition-start',
          tick: Math.min(edge, other),
          sourceId: transition.id,
        },
        {
          kind: 'transition-end',
          tick: Math.max(edge, other),
          sourceId: transition.id,
        },
      ];
    }
    const left = Math.floor(transition.durationTicks / 2);
    return [
      {
        kind: 'transition-start',
        tick: transition.cutTick - left,
        sourceId: transition.id,
      },
      {
        kind: 'transition-cut',
        tick: transition.cutTick,
        sourceId: transition.id,
      },
      {
        kind: 'transition-end',
        tick: transition.cutTick + transition.durationTicks - left,
        sourceId: transition.id,
      },
    ];
  });

export const collectSnapGuides = (input: SolveSnapInput): SnapGuide[] => {
  const guides: SnapGuide[] = [{ kind: 'sequence-start', tick: 0 }];
  if (input.playheadTick !== undefined) {
    guides.push({ kind: 'playhead', tick: input.playheadTick });
  }
  for (const clip of Object.values(input.project.sequence.clips)) {
    if (input.excludeClipIds?.has(clip.id)) continue;
    guides.push(
      { kind: 'clip-start', tick: clip.timelineStart, sourceId: clip.id },
      {
        kind: 'clip-end',
        tick: clip.timelineStart + clip.timelineDuration,
        sourceId: clip.id,
      }
    );
  }
  guides.push(...transitionGuides(input.project));
  return guides;
};

export interface SolveBoundarySnapInput extends Omit<
  SolveSnapInput,
  'candidateTick'
> {
  boundaryTicks: readonly TimelineTick[];
  deltaTicks: TimelineTick;
}

export interface BoundarySnapResult {
  deltaTicks: TimelineTick;
  snap: SnapResult;
}

export const solveSnap = (input: SolveSnapInput): SnapResult => {
  if (!Number.isFinite(input.pixelsPerTick) || input.pixelsPerTick <= 0) {
    throw new RangeError('Timeline scale must be positive');
  }
  if (!Number.isFinite(input.pixelThreshold) || input.pixelThreshold < 0) {
    throw new RangeError('Snap threshold cannot be negative');
  }
  const thresholdTicks = input.pixelThreshold / input.pixelsPerTick;
  const guide = collectSnapGuides(input)
    .map(candidate => ({
      candidate,
      distance: Math.abs(candidate.tick - input.candidateTick),
    }))
    .filter(entry => entry.distance <= thresholdTicks)
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.candidate.tick - right.candidate.tick ||
        left.candidate.kind.localeCompare(right.candidate.kind)
    )[0]?.candidate;
  return guide
    ? { tick: guide.tick, snapped: true, guide }
    : { tick: input.candidateTick, snapped: false };
};

export const solveBoundarySnap = (
  input: SolveBoundarySnapInput
): BoundarySnapResult | null =>
  input.boundaryTicks
    .map(boundaryTick => {
      const candidateTick = boundaryTick + input.deltaTicks;
      const snap = solveSnap({ ...input, candidateTick });
      return {
        snap,
        deltaTicks: snap.tick - boundaryTick,
        distance: Math.abs(snap.tick - candidateTick),
      };
    })
    .filter(candidate => candidate.snap.snapped)
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.snap.tick - right.snap.tick ||
        (left.snap.guide?.kind ?? '').localeCompare(
          right.snap.guide?.kind ?? ''
        )
    )
    .map(({ snap, deltaTicks }) => ({ snap, deltaTicks }))[0] ?? null;
