import { getSequenceOutputDuration } from '@/editor-v2/timeline';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
import type {
  ClipEffect,
  EditableDataLocator,
  EditorClip,
  EditorProjectV2,
  SequenceEffect,
} from '@/types/editor-v2';

export type EditorEffectCategory =
  'Canvas' | 'Motion' | 'Recording' | 'Overlays';

export interface EditorEffectCatalogItem {
  id: string;
  name: string;
  description: string;
  category: EditorEffectCategory;
  scope: 'clip' | 'sequence';
}

export const EDITOR_EFFECT_CATALOG: readonly EditorEffectCatalogItem[] = [
  {
    id: 'canvas-settings',
    name: 'Canvas & Aspect',
    description: 'Set output dimensions, aspect ratio, and canvas color.',
    category: 'Canvas',
    scope: 'sequence',
  },
  {
    id: 'transform',
    name: 'Transform & Crop',
    description: 'Position, scale, rotate, and crop a visual clip.',
    category: 'Motion',
    scope: 'clip',
  },
  {
    id: 'opacity',
    name: 'Opacity',
    description: 'Blend a visual clip with layers below it.',
    category: 'Motion',
    scope: 'clip',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Add a timed cursor-follow or manual focus zoom.',
    category: 'Motion',
    scope: 'clip',
  },
  {
    id: 'camera-layout',
    name: 'Camera Layout',
    description: 'Place and style a Capty camera source.',
    category: 'Recording',
    scope: 'clip',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Render captured pointer movement and click feedback.',
    category: 'Recording',
    scope: 'clip',
  },
  {
    id: 'keyboard',
    name: 'Keyboard',
    description: 'Show captured keyboard shortcuts.',
    category: 'Recording',
    scope: 'clip',
  },
  {
    id: 'subtitle',
    name: 'Subtitles',
    description: 'Render imported or generated subtitles.',
    category: 'Overlays',
    scope: 'clip',
  },
  {
    id: 'wallpaper',
    name: 'Wallpaper',
    description: 'Add canvas padding, corners, shadow, and background.',
    category: 'Canvas',
    scope: 'sequence',
  },
  {
    id: 'device-frame',
    name: 'Device Frame',
    description: 'Frame an iOS recording in a matching device.',
    category: 'Canvas',
    scope: 'sequence',
  },
  {
    id: 'annotation',
    name: 'Drawing & Redaction',
    description: 'Add timed annotations, highlights, and redactions.',
    category: 'Overlays',
    scope: 'sequence',
  },
];

const without = <T extends object, K extends keyof T>(
  value: T,
  key: K
): Omit<T, K> => {
  const result = { ...value };
  delete result[key];
  return result;
};

const findDataLocator = (
  project: EditorProjectV2,
  clip: EditorClip,
  kind: 'cursor' | 'keyboard' | 'subtitles'
): EditableDataLocator | null => {
  const asset = project.assets[clip.assetId];
  if (asset?.kind !== 'capty-recording') return null;
  return asset.sources[kind]?.locator ?? null;
};

export const createClipEffectFromCatalog = (
  itemId: string,
  project: EditorProjectV2,
  clip: EditorClip,
  createId: () => string
): ClipEffect | null => {
  const id = createId();
  const range = {
    start: clip.timelineStart,
    end: clip.timelineStart + clip.timelineDuration,
  };
  switch (itemId) {
    case 'transform':
      if (clip.kind === 'audio') return null;
      return {
        id,
        kind: 'transform',
        enabled: true,
        value: {
          positionX: 0,
          positionY: 0,
          scaleX: 1,
          scaleY: 1,
          rotationDegrees: 0,
          anchorX: 0.5,
          anchorY: 0.5,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
          cropLeft: 0,
        },
      };
    case 'opacity':
      if (clip.kind === 'audio') return null;
      return { id, kind: 'opacity', enabled: true, opacity: 1 };
    case 'zoom':
      if (clip.kind === 'audio') return null;
      return {
        id,
        kind: 'zoom',
        enabled: true,
        timeDomain: 'content-timeline',
        range,
        scale: 2,
        target: 'cursor',
        transitionInTicks: Math.min(
          45_000,
          Math.floor(clip.timelineDuration / 4)
        ),
        transitionOutTicks: Math.min(
          45_000,
          Math.floor(clip.timelineDuration / 4)
        ),
        followSmoothness: 0.12,
        lookAheadTicks: 18_000,
      };
    case 'camera-layout':
      if (clip.kind === 'audio') return null;
      return {
        id,
        kind: 'camera-layout',
        enabled: true,
        style: without(DEFAULT_CAMERA_STYLE, 'visible'),
      };
    case 'cursor': {
      const data = findDataLocator(project, clip, 'cursor');
      if (!data || clip.kind === 'audio') return null;
      return {
        id,
        kind: 'cursor',
        enabled: true,
        timeDomain: 'asset-source',
        data,
        style: without(DEFAULT_CURSOR_STYLE, 'enabled'),
      };
    }
    case 'keyboard': {
      const data = findDataLocator(project, clip, 'keyboard');
      if (!data || clip.kind === 'audio') return null;
      return {
        id,
        kind: 'keyboard',
        enabled: true,
        timeDomain: 'asset-source',
        data,
        style: without(DEFAULT_KEYBOARD_STYLE, 'visible'),
        sound: { enabled: false, volume: 0.7, type: 'cherry-blue' },
      };
    }
    case 'subtitle': {
      const data = findDataLocator(project, clip, 'subtitles');
      if (!data || clip.kind === 'audio') return null;
      return {
        id,
        kind: 'subtitle',
        enabled: true,
        timeDomain: 'asset-source',
        data,
        style: without(DEFAULT_SUBTITLE_STYLE, 'visible'),
      };
    }
    default:
      return null;
  }
};

export const createSequenceEffectFromCatalog = (
  itemId: string,
  project: EditorProjectV2,
  createId: () => string
): SequenceEffect | null => {
  switch (itemId) {
    case 'canvas-settings': {
      const firstVisualAsset = Object.values(project.assets).find(
        asset => asset.kind === 'video' || asset.kind === 'image'
      );
      return {
        id: createId(),
        kind: 'canvas-settings',
        enabled: true,
        width: firstVisualAsset?.width ?? 1920,
        height: firstVisualAsset?.height ?? 1080,
        backgroundColor: '#000000',
        aspectRatio: null,
      };
    }
    case 'wallpaper':
      return {
        id: createId(),
        kind: 'wallpaper',
        enabled: true,
        background: {
          kind: 'gradient',
          gradient: {
            id: 'editor-v2-ocean',
            colors: ['#0f172a', '#0e7490'],
            angle: 135,
          },
        },
        padding: 8,
        corners: 12,
        shadow: 50,
      };
    case 'device-frame':
      return {
        id: createId(),
        kind: 'device-frame',
        enabled: true,
        frame: 'ios-device',
      };
    case 'annotation':
      return {
        id: createId(),
        kind: 'annotation',
        enabled: true,
        timeDomain: 'output-timeline',
        range: {
          start: 0,
          end: Math.max(1, getSequenceOutputDuration(project)),
        },
        canvasWidth: 1920,
        canvasHeight: 1080,
        annotations: [],
      };
    default:
      return null;
  }
};
