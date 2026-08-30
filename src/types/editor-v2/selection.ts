export type EditorSelection =
  | { kind: 'none' }
  | { kind: 'asset'; assetId: string }
  | { kind: 'track'; trackId: string }
  | { kind: 'clips'; clipIds: string[]; primaryClipId: string }
  | { kind: 'effect'; clipId?: string; effectId: string }
  | { kind: 'transition'; transitionId: string };
