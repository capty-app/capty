import type {
  AnnotationEffect,
  CameraLayoutEffect,
  CursorEffect,
  EditorClip,
  KeyboardEffect,
  SequenceEffect,
  SubtitleEffect,
  TimelineTick,
  ZoomEffect,
} from '@/types/editor-v2';

import { decimalSecondsToTicks } from '../time/decimal';
import type { ImportV1ProjectInput } from './import-v1-types';

const clipRange = (clip: EditorClip) => ({
  start: clip.timelineStart,
  end: clip.timelineStart + clip.timelineDuration,
});

const intersectRange = (
  start: TimelineTick,
  end: TimelineTick,
  clip: EditorClip
): { start: TimelineTick; end: TimelineTick } | undefined => {
  const range = clipRange(clip);
  const intersectionStart = Math.max(start, range.start);
  const intersectionEnd = Math.min(end, range.end);
  return intersectionEnd > intersectionStart
    ? { start: intersectionStart, end: intersectionEnd }
    : undefined;
};

const cursorStyleWithoutEnabled = (
  state: ImportV1ProjectInput['normalizedState']
): CursorEffect['style'] => {
  const style = { ...state.cursorStyle };
  delete (style as Partial<typeof style>).enabled;
  return style;
};

const cameraStyleWithoutVisible = (
  state: ImportV1ProjectInput['normalizedState']
): CameraLayoutEffect['style'] => {
  const style = { ...state.cameraStyle };
  delete (style as Partial<typeof style>).visible;
  return style;
};

const keyboardStyleWithoutVisible = (
  state: ImportV1ProjectInput['normalizedState']
): KeyboardEffect['style'] => {
  const style = { ...state.keyboardStyle };
  delete (style as Partial<typeof style>).visible;
  return style;
};

const subtitleStyleWithoutVisible = (
  state: ImportV1ProjectInput['normalizedState']
): SubtitleEffect['style'] => {
  const style = { ...state.subtitleStyle };
  delete (style as Partial<typeof style>).visible;
  return style;
};

const addPersistentSourceEffects = (
  input: ImportV1ProjectInput,
  clips: Record<string, EditorClip>,
  screenClipIds: string[]
): void => {
  const state = input.normalizedState;

  screenClipIds.forEach(clipId => {
    const clip = clips[clipId];
    if (input.sources.data.cursor) {
      const effect: CursorEffect = {
        id: input.createId('effect', `cursor-${clipId}`),
        kind: 'cursor',
        enabled: state.cursorStyle.enabled,
        timeDomain: 'asset-source',
        data: input.sources.data.cursor,
        style: cursorStyleWithoutEnabled(state),
      };
      clip.effects.push(effect);
    }

    if (input.sources.data.keyboard) {
      const effect: KeyboardEffect = {
        id: input.createId('effect', `keyboard-${clipId}`),
        kind: 'keyboard',
        enabled: state.keyboardStyle.visible,
        timeDomain: 'asset-source',
        data: input.sources.data.keyboard,
        style: keyboardStyleWithoutVisible(state),
        sound: {
          enabled: state.audioStyle.keyboardSoundEnabled,
          volume: state.audioStyle.keyboardSoundVolume,
          type: state.audioStyle.keyboardSoundType,
        },
      };
      clip.effects.push(effect);
    }

    if (input.sources.data.subtitles) {
      const effect: SubtitleEffect = {
        id: input.createId('effect', `subtitle-${clipId}`),
        kind: 'subtitle',
        enabled: state.subtitleStyle.visible,
        timeDomain: 'asset-source',
        data: input.sources.data.subtitles,
        style: subtitleStyleWithoutVisible(state),
      };
      clip.effects.push(effect);
    }
  });
};

const addZoomEffects = (
  input: ImportV1ProjectInput,
  clips: Record<string, EditorClip>,
  screenClipIds: string[]
): void => {
  const state = input.normalizedState;

  state.zoomSegments.forEach(zoom => {
    const start = decimalSecondsToTicks(zoom.startTime);
    const end = decimalSecondsToTicks(zoom.endTime);

    screenClipIds.forEach(clipId => {
      const clip = clips[clipId];
      const range = intersectRange(start, end, clip);
      if (!range) return;

      const effect: ZoomEffect = {
        id: input.createId('effect', `zoom-${zoom.id}-${clipId}`),
        kind: 'zoom',
        enabled: true,
        timeDomain: 'content-timeline',
        range,
        scale: zoom.zoomLevel,
        target: zoom.targetMode ?? 'cursor',
        focusX: zoom.focusPoint?.x,
        focusY: zoom.focusPoint?.y,
        transitionInTicks: decimalSecondsToTicks(
          zoom.transitionInDuration ?? state.zoomSettings.transitionInDuration
        ),
        transitionOutTicks: decimalSecondsToTicks(
          zoom.transitionOutDuration ?? state.zoomSettings.transitionOutDuration
        ),
        followSmoothness: state.zoomSettings.followSmoothness,
        lookAheadTicks: decimalSecondsToTicks(state.zoomSettings.lookAhead),
      };
      clip.effects.push(effect);
    });
  });
};

const addCameraEffects = (
  input: ImportV1ProjectInput,
  clips: Record<string, EditorClip>,
  cameraClipIds: string[]
): void => {
  cameraClipIds.forEach(clipId => {
    const effect: CameraLayoutEffect = {
      id: input.createId('effect', `camera-${clipId}`),
      kind: 'camera-layout',
      enabled: input.normalizedState.cameraStyle.visible,
      style: cameraStyleWithoutVisible(input.normalizedState),
    };
    clips[clipId].effects.push(effect);
  });
};

export const importClipEffects = (
  input: ImportV1ProjectInput,
  clips: Record<string, EditorClip>,
  screenClipIds: string[],
  cameraClipIds: string[]
): void => {
  addPersistentSourceEffects(input, clips, screenClipIds);
  addZoomEffects(input, clips, screenClipIds);
  addCameraEffects(input, clips, cameraClipIds);
};

export const importSequenceEffects = (
  input: ImportV1ProjectInput
): SequenceEffect[] => {
  const state = input.normalizedState;
  const wallpaper = state.wallpaper;
  const effects: SequenceEffect[] = [
    {
      id: input.createId('effect', 'canvas-settings'),
      kind: 'canvas-settings',
      enabled: true,
      width: input.sources.recording.width,
      height: input.sources.recording.height,
      backgroundColor: '#000000',
      aspectRatio: wallpaper.aspectRatio,
    },
  ];

  let background: Extract<SequenceEffect, { kind: 'wallpaper' }>['background'] =
    {
      kind: 'none',
    };
  if (wallpaper.gradient) {
    background = { kind: 'gradient', gradient: wallpaper.gradient };
  }
  if (wallpaper.backgroundImage && input.sources.wallpaperImage) {
    background = {
      kind: 'image',
      assetId: input.sources.wallpaperImage.asset.id,
    };
  }

  effects.push({
    id: input.createId('effect', 'wallpaper'),
    kind: 'wallpaper',
    enabled: wallpaper.enabled,
    background,
    padding: wallpaper.padding,
    corners: wallpaper.corners,
    shadow: wallpaper.shadow,
  });

  if (wallpaper.deviceFrame) {
    effects.push({
      id: input.createId('effect', 'device-frame'),
      kind: 'device-frame',
      enabled: true,
      frame: 'ios-device',
    });
  }

  state.drawingSegments.forEach(drawing => {
    const effect: AnnotationEffect = {
      id: input.createId('effect', `drawing-${drawing.id}`),
      kind: 'annotation',
      enabled: true,
      timeDomain: 'output-timeline',
      range: {
        start: decimalSecondsToTicks(drawing.startTime),
        end: decimalSecondsToTicks(drawing.endTime),
      },
      canvasWidth: drawing.canvasWidth,
      canvasHeight: drawing.canvasHeight,
      annotations: drawing.annotations,
    };
    effects.push(effect);
  });

  return effects;
};
