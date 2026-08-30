import {
  EDITOR_V2_SCHEMA_VERSION,
  type AudioTrack,
  type EditorProjectV2,
  type VideoTrack,
} from '@/types/editor-v2';

import { createEditorTimebase } from '../time/timebase';

export interface EmptyEditorProjectInput {
  id: string;
  name: string;
  createdAt: string;
  sequenceId: string;
  videoTrackId: string;
  audioTrackId: string;
}

export const createEmptyEditorProject = (
  input: EmptyEditorProjectInput
): EditorProjectV2 => {
  const videoTrack: VideoTrack = {
    id: input.videoTrackId,
    kind: 'video',
    name: 'Video 1',
    clipIds: [],
    locked: false,
    visible: true,
    compositingOrder: 0,
  };
  const audioTrack: AudioTrack = {
    id: input.audioTrackId,
    kind: 'audio',
    name: 'Audio 1',
    clipIds: [],
    locked: false,
    muted: false,
    solo: false,
    gain: 1,
    mixOrder: 0,
  };

  return {
    schemaVersion: EDITOR_V2_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    revision: 0,
    timebase: createEditorTimebase({ numerator: 60, denominator: 1 }),
    assets: {},
    sequence: {
      id: input.sequenceId,
      name: 'Sequence 1',
      videoTrackIds: [videoTrack.id],
      audioTrackIds: [audioTrack.id],
      tracks: {
        [videoTrack.id]: videoTrack,
        [audioTrack.id]: audioTrack,
      },
      clips: {},
      transitions: {},
      effects: [],
    },
  };
};
