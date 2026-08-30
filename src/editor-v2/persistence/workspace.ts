import {
  EDITOR_V2_WORKSPACE_VERSION,
  type EditorV2Workspace,
} from '@/types/editor-v2';
import type { NormalizedV1EditorState } from '@/editor-v1/project-normalizer';

const frameRateFromV1 = (frameRate: string) => ({
  numerator: Number(frameRate),
  denominator: 1,
});

export const createDefaultEditorWorkspace = (): EditorV2Workspace => ({
  version: EDITOR_V2_WORKSPACE_VERSION,
  revision: 0,
  browserTab: 'project',
  browserView: 'grid',
  leftDock: { collapsed: false, size: 280 },
  rightDock: { collapsed: false, size: 320 },
  timeline: {
    collapsed: false,
    height: 280,
    zoom: 100,
    scrollTick: 0,
  },
  snappingEnabled: true,
  rippleEnabled: false,
  scrubAudioEnabled: false,
  previewFrameRate: { numerator: 60, denominator: 1 },
  lastExportSettings: {
    format: 'mp4',
    resolution: 'original',
    quality: 'studio',
    frameRate: { numerator: 60, denominator: 1 },
    revealWhenComplete: true,
    uploadWhenComplete: false,
  },
});

export const createWorkspaceFromV1 = (
  state: NormalizedV1EditorState
): EditorV2Workspace => {
  const workspace = createDefaultEditorWorkspace();
  const frameRate = frameRateFromV1(state.exportSettings.frameRate);

  return {
    ...workspace,
    leftDock: {
      ...workspace.leftDock,
      collapsed: !state.ui.sidebarOpen,
    },
    timeline: {
      ...workspace.timeline,
      zoom: state.timelineZoom,
    },
    scrubAudioEnabled: state.ui.scrubAudioEnabled,
    previewFrameRate: frameRate,
    lastExportSettings: {
      format: state.exportSettings.format,
      resolution: state.exportSettings.resolution,
      quality: state.exportSettings.qualityPreset,
      frameRate,
      revealWhenComplete: state.exportSettings.openInFinder,
      uploadWhenComplete: false,
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isRational = (value: unknown): boolean =>
  isRecord(value) &&
  Number.isSafeInteger(value.numerator) &&
  Number(value.numerator) > 0 &&
  Number.isSafeInteger(value.denominator) &&
  Number(value.denominator) > 0;

const isDock = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.collapsed === 'boolean' &&
  isPositiveNumber(value.size);

const isTimeline = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.collapsed === 'boolean' &&
  isPositiveNumber(value.height) &&
  isPositiveNumber(value.zoom) &&
  Number.isSafeInteger(value.scrollTick) &&
  Number(value.scrollTick) >= 0;

const isExportSettings = (value: unknown): boolean =>
  isRecord(value) &&
  (value.format === 'mp4' || value.format === 'gif') &&
  (value.resolution === 'original' ||
    value.resolution === '4k' ||
    value.resolution === '1080p' ||
    value.resolution === '720p' ||
    value.resolution === '480p') &&
  (value.quality === 'studio' ||
    value.quality === 'social' ||
    value.quality === 'web' ||
    value.quality === 'web-low') &&
  isRational(value.frameRate) &&
  typeof value.revealWhenComplete === 'boolean' &&
  typeof value.uploadWhenComplete === 'boolean';

export const validateEditorWorkspace = (
  value: unknown
): value is EditorV2Workspace => {
  if (!isRecord(value)) return false;

  return (
    value.version === EDITOR_V2_WORKSPACE_VERSION &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    (value.browserTab === 'project' || value.browserTab === 'effects') &&
    (value.browserView === 'grid' || value.browserView === 'list') &&
    typeof value.snappingEnabled === 'boolean' &&
    typeof value.rippleEnabled === 'boolean' &&
    typeof value.scrubAudioEnabled === 'boolean' &&
    isDock(value.leftDock) &&
    isDock(value.rightDock) &&
    isTimeline(value.timeline) &&
    isRational(value.previewFrameRate) &&
    isExportSettings(value.lastExportSettings)
  );
};
