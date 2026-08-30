import { ticksForFrames } from '../time/timebase';
import type { EvaluatedProject } from './types';
import type { TimelineTick } from '@/types/editor-v2';

export const getPreRollDuration = (project: EvaluatedProject): TimelineTick => {
  const preRoll = project.sequence.preRoll;
  if (!preRoll || preRoll.frames <= 0) return 0;
  return ticksForFrames(
    preRoll.frames,
    project.timebase.displayFrameRate,
    'nearest'
  );
};

export const outputTickToContentTick = (
  outputTick: TimelineTick,
  preRollTicks: TimelineTick
): TimelineTick | null => {
  if (outputTick < 0 || outputTick < preRollTicks) return null;
  return outputTick - preRollTicks;
};
