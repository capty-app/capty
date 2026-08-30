import type { EditorExportSettings } from './export';
import type { Rational, TimelineTick } from './time';

export const EDITOR_V2_WORKSPACE_VERSION = 1;

export interface EditorDockWorkspace {
  collapsed: boolean;
  size: number;
}

export interface EditorV2Workspace {
  version: typeof EDITOR_V2_WORKSPACE_VERSION;
  revision: number;
  browserTab: 'project' | 'effects';
  browserView: 'grid' | 'list';
  leftDock: EditorDockWorkspace;
  rightDock: EditorDockWorkspace;
  timeline: {
    collapsed: boolean;
    height: number;
    zoom: number;
    scrollTick: TimelineTick;
  };
  snappingEnabled: boolean;
  rippleEnabled: boolean;
  scrubAudioEnabled: boolean;
  previewFrameRate: Rational;
  lastExportSettings: EditorExportSettings;
}
