import type { EditorProjectV2, EditorSelection } from '@/types/editor-v2';

const NONE: EditorSelection = { kind: 'none' };

export const reconcileEditorSelection = (
  document: EditorProjectV2,
  selection: EditorSelection
): EditorSelection => {
  switch (selection.kind) {
    case 'none':
      return selection;
    case 'asset':
      return document.assets[selection.assetId] ? selection : NONE;
    case 'track':
      return document.sequence.tracks[selection.trackId] ? selection : NONE;
    case 'clips': {
      const clipIds = selection.clipIds.filter(
        clipId => document.sequence.clips[clipId]
      );
      if (clipIds.length === 0) return NONE;
      return {
        kind: 'clips',
        clipIds,
        primaryClipId: clipIds.includes(selection.primaryClipId)
          ? selection.primaryClipId
          : clipIds[0],
      };
    }
    case 'effect': {
      const clipEffect = selection.clipId
        ? document.sequence.clips[selection.clipId]?.effects.some(
            effect => effect.id === selection.effectId
          )
        : document.sequence.effects.some(
            effect => effect.id === selection.effectId
          );
      return clipEffect ? selection : NONE;
    }
    case 'transition':
      return document.sequence.transitions[selection.transitionId]
        ? selection
        : NONE;
  }
};
