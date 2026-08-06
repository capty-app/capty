import { daemon } from '@/main/daemon';
import type { AspectRatio } from '@/types/aspect-ratio';
import { setAreaSelectorAspectRatio } from '@/main/capture/area-selector';

let currentAreaSelection: {
  x: number;
  y: number;
  width: number;
  height: number;
} | null = null;

let onCloseCallback: (() => void) | null = null;
let onScreenshotCallback: (() => void) | null = null;
let onRecordCallback: (() => void) | null = null;
let onUpdateSizeCallback:
  ((size: { width: number; height: number }) => void | Promise<void>) | null =
  null;
let onSizeEditorOpenedCallback: (() => void) | null = null;
let onSizeEditorClosedCallback: (() => void) | null = null;
let eventCleanup: (() => void) | null = null;

const WINDOW_WIDTH = 288;
const WINDOW_HEIGHT = 48;

function calculateCenteredPosition(area: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  const x = Math.round(area.x + area.width / 2 - WINDOW_WIDTH / 2);
  const y = Math.round(area.y + area.height / 2 - WINDOW_HEIGHT / 2);
  return { x, y };
}

interface AspectRatioEventData {
  width: number;
  height: number;
  name: string;
}

function isSizeEventData(
  data: unknown
): data is { width: number; height: number } {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const size = data as { width?: unknown; height?: unknown };
  return typeof size.width === 'number' && typeof size.height === 'number';
}

function handleEvent(event: string, data?: unknown): void {
  switch (event) {
    case 'all-in-one:close':
      onCloseCallback?.();
      break;
    case 'all-in-one:screenshot':
      onScreenshotCallback?.();
      break;
    case 'all-in-one:record':
      onRecordCallback?.();
      break;
    case 'all-in-one:select-aspect-ratio':
      handleAspectRatioSelected(data as AspectRatioEventData);
      break;
    case 'all-in-one:update-size':
      if (isSizeEventData(data)) {
        void onUpdateSizeCallback?.(data);
      }
      break;
    case 'all-in-one:size-editor-opened':
      onSizeEditorOpenedCallback?.();
      break;
    case 'all-in-one:size-editor-closed':
      onSizeEditorClosedCallback?.();
      break;
  }
}

async function handleAspectRatioSelected(
  data: AspectRatioEventData
): Promise<void> {
  const ratio: AspectRatio = {
    name: data.name,
    width: data.width,
    height: data.height,
  };
  await setAreaSelectorAspectRatio(ratio);
}

function setupEventListener(): void {
  if (eventCleanup) return;

  const handler = (event: string, data?: unknown) => {
    handleEvent(event, data);
  };

  daemon.onEvent(handler);
  eventCleanup = () => daemon.offEvent(handler);
}

function cleanupEventListener(): void {
  eventCleanup?.();
  eventCleanup = null;
}

export async function showAllInOneControl(area?: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  currentAreaSelection = area || null;
  setupEventListener();

  const position = area ? calculateCenteredPosition(area) : { x: 100, y: 100 };
  const params = area
    ? {
        ...position,
        selectionWidth: area.width,
        selectionHeight: area.height,
      }
    : position;

  try {
    await daemon.call('all-in-one', 'show', params);
  } catch (error) {
    console.error('Failed to show all-in-one control:', error);
  }
}

export async function updateAllInOnePosition(area: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  currentAreaSelection = area;

  const position = calculateCenteredPosition(area);
  const params = {
    ...position,
    selectionWidth: area.width,
    selectionHeight: area.height,
  };

  try {
    await daemon.call('all-in-one', 'update', params);
  } catch (error) {
    console.error('Failed to update all-in-one position:', error);
  }
}

export async function hideAllInOneControl(): Promise<void> {
  cleanupEventListener();

  try {
    await daemon.call('all-in-one', 'hide');
  } catch (error) {
    console.error('Failed to hide all-in-one control:', error);
  }

  currentAreaSelection = null;
}

export function getCurrentAreaSelection(): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  return currentAreaSelection;
}

export function setAllInOneCallbacks(callbacks: {
  onClose?: () => void;
  onScreenshot?: () => void;
  onRecord?: () => void;
  onUpdateSize?: (size: {
    width: number;
    height: number;
  }) => void | Promise<void>;
  onSizeEditorOpened?: () => void;
  onSizeEditorClosed?: () => void;
}): void {
  onCloseCallback = callbacks.onClose || null;
  onScreenshotCallback = callbacks.onScreenshot || null;
  onRecordCallback = callbacks.onRecord || null;
  onUpdateSizeCallback = callbacks.onUpdateSize || null;
  onSizeEditorOpenedCallback = callbacks.onSizeEditorOpened || null;
  onSizeEditorClosedCallback = callbacks.onSizeEditorClosed || null;
}
