import {
  cancelAreaSelection,
  startAreaSelection,
  updateAreaSelection,
  updateAreaSelectionCallbacks,
} from '@/main/capture/area-selector';
import {
  showAllInOneControl,
  updateAllInOnePosition,
  hideAllInOneControl,
  getCurrentAreaSelection,
  setAllInOneCallbacks,
} from './open-all-in-one.ts';
import { captureArea } from '@/main/capture/screenshot/capture-area.ts';
import {
  showPreRecordingControl,
  updateRecordingControlPosition,
  hidePreRecordingControl,
  prewarmRecordingControlWindow,
} from '@/main/capture/video/recording-control.ts';
import { prewarmRecorder } from '@/main/capture/video/recorder.ts';
import { prewarmOverlay } from '@/main/capture/video/overlay.ts';
import type { AreaSelection } from '@/types/area.ts';
import { globalShortcut, screen } from 'electron';
import { getConfig, updateConfig } from '@/main/settings';

export { showAllInOneControl, updateAllInOnePosition, hideAllInOneControl };

const ALL_IN_ONE_SHORTCUTS = ['C', 'Enter', 'R'];
const MIN_SELECTION_SIZE = 20;

type AreaBounds = { x: number; y: number; width: number; height: number };
type ManualSize = { width: number; height: number };

function persistAreaSelection(bounds: AreaBounds): void {
  updateConfig({ allInOne: { lastArea: bounds } });
}

function getPersistedArea(): AreaBounds | null {
  const config = getConfig();
  const lastArea = config.allInOne?.lastArea;

  if (!lastArea) {
    return null;
  }

  const displays = screen.getAllDisplays();
  const isOnAnyDisplay = displays.some(display => {
    const { x, y, width, height } = display.bounds;
    return (
      lastArea.x >= x &&
      lastArea.x < x + width &&
      lastArea.y >= y &&
      lastArea.y < y + height
    );
  });

  if (!isOnAnyDisplay) {
    return null;
  }

  return lastArea;
}

function registerAllInOneShortcuts(
  onScreenshot: () => void,
  onRecord: () => void
): void {
  unregisterAllInOneShortcuts();
  globalShortcut.register('C', onScreenshot);
  globalShortcut.register('Enter', onScreenshot);
  globalShortcut.register('R', onRecord);
}

function unregisterAllInOneShortcuts(): void {
  for (const shortcut of ALL_IN_ONE_SHORTCUTS) {
    globalShortcut.unregister(shortcut);
  }
}

function extractBounds(selection: AreaSelection): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (
    selection.x === undefined ||
    selection.y === undefined ||
    selection.width === undefined ||
    selection.height === undefined
  ) {
    return null;
  }

  return {
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isValidManualSize(size: ManualSize): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

function getDisplayForArea(area: AreaBounds): Electron.Display | null {
  const displays = screen.getAllDisplays();
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;

  const displayContainingCenter = displays.find(display => {
    const { x, y, width, height } = display.bounds;
    return (
      centerX >= x &&
      centerX < x + width &&
      centerY >= y &&
      centerY < y + height
    );
  });

  if (displayContainingCenter) {
    return displayContainingCenter;
  }

  const displayContainingOrigin = displays.find(display => {
    const { x, y, width, height } = display.bounds;
    return (
      area.x >= x && area.x < x + width && area.y >= y && area.y < y + height
    );
  });

  return displayContainingOrigin ?? displays[0] ?? null;
}

function getBoundsForManualSize(
  area: AreaBounds,
  size: ManualSize
): AreaBounds | null {
  if (!isValidManualSize(size)) {
    return null;
  }

  const display = getDisplayForArea(area);
  if (!display) {
    return null;
  }

  const displayBounds = display.bounds;
  const width = clamp(
    Math.round(size.width),
    MIN_SELECTION_SIZE,
    displayBounds.width
  );
  const height = clamp(
    Math.round(size.height),
    MIN_SELECTION_SIZE,
    displayBounds.height
  );
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;
  const maxX = displayBounds.x + displayBounds.width - width;
  const maxY = displayBounds.y + displayBounds.height - height;

  return {
    x: clamp(Math.round(centerX - width / 2), displayBounds.x, maxX),
    y: clamp(Math.round(centerY - height / 2), displayBounds.y, maxY),
    width,
    height,
  };
}

async function handleScreenshotAction(): Promise<void> {
  const area = getCurrentAreaSelection();
  if (!area) {
    return;
  }

  unregisterAllInOneShortcuts();
  await Promise.all([cancelAreaSelection(), hideAllInOneControl()]);

  try {
    await captureArea({
      status: 'confirmed',
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
    });
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
  }
}

function handleRecordAction(): void {
  const area = getCurrentAreaSelection();
  if (!area) {
    return;
  }

  unregisterAllInOneShortcuts();
  prewarmRecordingControlWindow();
  prewarmRecorder();
  prewarmOverlay();

  hideAllInOneControl();

  updateAreaSelectionCallbacks({
    onUpdate: selection => {
      if (
        selection.status === 'updated' &&
        selection.x !== undefined &&
        selection.y !== undefined &&
        selection.width !== undefined &&
        selection.height !== undefined
      ) {
        updateRecordingControlPosition({
          x: selection.x,
          y: selection.y,
          width: selection.width,
          height: selection.height,
        });
      }
    },
    onCancelled: () => {
      hidePreRecordingControl();
    },
  });

  showPreRecordingControl(area);
}

async function handleUpdateSizeAction(size: ManualSize): Promise<void> {
  const area = getCurrentAreaSelection();
  if (!area) {
    return;
  }

  const bounds = getBoundsForManualSize(area, size);
  if (!bounds) {
    return;
  }

  const updated = await updateAreaSelection(bounds);
  if (!updated) {
    return;
  }

  persistAreaSelection(bounds);
  await updateAllInOnePosition(bounds);
}

function handleSizeEditorOpened(): void {
  unregisterAllInOneShortcuts();
}

function handleSizeEditorClosed(): void {
  const area = getCurrentAreaSelection();
  if (!area) {
    return;
  }

  registerAllInOneShortcuts(handleScreenshotAction, handleRecordAction);
}

function handleCloseAction(): void {
  unregisterAllInOneShortcuts();
  cancelAreaSelection();
  hideAllInOneControl();
}

export default async function startAllInOne(): Promise<void> {
  setAllInOneCallbacks({
    onClose: handleCloseAction,
    onScreenshot: handleScreenshotAction,
    onRecord: handleRecordAction,
    onUpdateSize: handleUpdateSizeAction,
    onSizeEditorOpened: handleSizeEditorOpened,
    onSizeEditorClosed: handleSizeEditorClosed,
  });

  const handleSelected = (selection: AreaSelection) => {
    const bounds = extractBounds(selection);
    if (bounds) {
      persistAreaSelection(bounds);
      showAllInOneControl(bounds);
      registerAllInOneShortcuts(handleScreenshotAction, handleRecordAction);
    }
  };

  const handleUpdate = (selection: AreaSelection) => {
    const bounds = extractBounds(selection);
    if (bounds) {
      persistAreaSelection(bounds);
      updateAllInOnePosition(bounds);
    }
  };

  const handleCancelled = () => {
    unregisterAllInOneShortcuts();
    void hideAllInOneControl();
  };

  const persistedArea = getPersistedArea();

  const selection = await startAreaSelection({
    preset: persistedArea ?? undefined,
    onSelected: handleSelected,
    onUpdate: handleUpdate,
    onCancelled: handleCancelled,
  });

  if (!selection) {
    unregisterAllInOneShortcuts();
    hideAllInOneControl();
  }
}

export function init(): void {
  setAllInOneCallbacks({
    onClose: handleCloseAction,
    onScreenshot: handleScreenshotAction,
    onRecord: handleRecordAction,
    onUpdateSize: handleUpdateSizeAction,
    onSizeEditorOpened: handleSizeEditorOpened,
    onSizeEditorClosed: handleSizeEditorClosed,
  });
}
