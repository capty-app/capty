import { evaluateAudioPlan } from './audio-plan';
import { createCompositionSpec } from './composition-spec';
import { evaluateFramePlan } from './frame-plan';
import { freezeImmutable } from './immutable';
import { getPreRollDuration, outputTickToContentTick } from './pre-roll';
import type { EvaluatedProject, SequenceEvaluation } from './types';
import type { TimelineTick } from '@/types/editor-v2';

export const getSequenceContentDuration = (
  project: EvaluatedProject
): TimelineTick =>
  Object.values(project.sequence.clips).reduce(
    (duration, clip) =>
      Math.max(duration, clip.timelineStart + clip.timelineDuration),
    0
  );

export const getSequenceOutputDuration = (
  project: EvaluatedProject
): TimelineTick =>
  getPreRollDuration(project) + getSequenceContentDuration(project);

export const evaluateSequence = (
  project: EvaluatedProject,
  outputTick: TimelineTick
): SequenceEvaluation => {
  if (!Number.isSafeInteger(outputTick)) {
    throw new RangeError('Sequence evaluation tick must be a safe integer');
  }
  const preRollTicks = getPreRollDuration(project);
  const contentTick = outputTickToContentTick(outputTick, preRollTicks);
  const layers =
    outputTick < 0
      ? freezeImmutable([])
      : evaluateFramePlan(project, contentTick);

  return freezeImmutable({
    outputTick,
    contentTick,
    preRollTicks,
    layers,
    audio: evaluateAudioPlan(project, outputTick, contentTick),
    composition: createCompositionSpec(project),
  });
};
