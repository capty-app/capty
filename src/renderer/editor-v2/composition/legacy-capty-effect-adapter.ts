import { renderGradientBackground } from '@/renderer/components/video-editor/composition/wallpaper-canvas-renderer';
import type { SequenceEvaluation } from '@/editor-v2/timeline';

export interface LegacyCaptySequenceEffectInput {
  context: CanvasRenderingContext2D;
  evaluation: SequenceEvaluation;
}

export interface LegacyCaptyEffectAdapter {
  renderSequenceBackground: (input: LegacyCaptySequenceEffectInput) => void;
}

export const createLegacyCaptyEffectAdapter = (): LegacyCaptyEffectAdapter => ({
  renderSequenceBackground: ({ context, evaluation }) => {
    const wallpaper = evaluation.composition.effects.find(
      effect => effect.kind === 'wallpaper' && effect.enabled
    );
    if (
      !wallpaper ||
      wallpaper.kind !== 'wallpaper' ||
      wallpaper.background.kind !== 'gradient'
    ) {
      return;
    }
    renderGradientBackground(
      context,
      wallpaper.background.gradient,
      evaluation.composition.width,
      evaluation.composition.height
    );
  },
});
