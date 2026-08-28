import fs from 'fs';
import { daemon } from '@/main/daemon';
import { getConfig, updateConfig } from '@/main/settings';
import {
  hideDesktopIcons,
  showDesktopIcons,
  isSupported as isDesktopIconsSupported,
  checkAccessibilityPermission,
} from '@/main/capture/desktop-icons';
import { addToHistory } from '@/main/history';
import { generateScreenshotPath } from '@/main/capture/screenshot/utils';
import { showCapturePreview } from '@/main/capture/capture-preview';
import { openScreenshotEditor } from '@/main/capture/screenshot/open-editor';
import { copyScreenshotToClipboard } from '@/main/capture/screenshot/capture-feedback';
import { showNotification } from '@/main/utils/notifications';
import {
  startAreaSelection,
  cancelAreaSelection,
} from '@/main/capture/area-selector';
import type { AreaSelection } from '@/types/area';
import type { AutoScrollSpeed } from '@/types/settings';

interface ScrollCaptureState {
  isCapturing: boolean;
  frameCount: number;
  estimatedHeight: number;
}

const SCROLL_CAPTURE_FAILURE = {
  title: 'Scroll Capture Failed',
  body: 'The scrolling screenshot could not be captured.',
};

let activeEventHandler: ((event: string, data: unknown) => void) | null = null;

function cleanupEventListener(): void {
  if (activeEventHandler) {
    daemon.offEvent(activeEventHandler);
    activeEventHandler = null;
  }
}

export async function startScrollCapture(): Promise<void> {
  const config = getConfig();
  let shouldHideIcons =
    config.screenshot.hideDesktopIcons && isDesktopIconsSupported();

  if (shouldHideIcons && !checkAccessibilityPermission(false)) {
    shouldHideIcons = false;
    updateConfig({
      screenshot: { ...config.screenshot, hideDesktopIcons: false },
    });
  }

  if (shouldHideIcons) {
    await hideDesktopIcons('capture');
  }

  return new Promise<void>(resolve => {
    let areaSelected = false;
    let captureCompleted = false;

    const cleanup = async () => {
      cleanupEventListener();
      if (shouldHideIcons) {
        await showDesktopIcons('capture');
      }
    };

    const finishCapture = async (outputPath: string) => {
      if (captureCompleted) return;
      captureCompleted = true;

      await cleanup();
      await handleCaptureComplete(outputPath);
      resolve();
    };

    const cancelCapture = async () => {
      if (captureCompleted) return;
      captureCompleted = true;

      await cleanup();
      resolve();
    };

    const handleAreaSelected = async (selection: AreaSelection) => {
      if (areaSelected) return;
      if (
        selection.x === undefined ||
        selection.y === undefined ||
        selection.width === undefined ||
        selection.height === undefined
      ) {
        return;
      }

      areaSelected = true;
      await cancelAreaSelection();

      await new Promise(r => setTimeout(r, 100));

      const outputPath = generateScreenshotPath();

      const scrollConfig = config.scrollCapture ?? {
        autoScrollSpeed: 'medium' as AutoScrollSpeed,
        maxHeight: 20000,
      };

      activeEventHandler = async (event: string) => {
        if (!event.startsWith('scroll-capture:')) return;

        const eventType = event.replace('scroll-capture:', '');

        if (eventType === 'done') {
          try {
            const result = await daemon.call<{
              success: boolean;
              outputPath: string;
              width: number;
              height: number;
            }>('scroll-capture', 'finish', { outputPath });

            if (result.success) {
              await finishCapture(result.outputPath);
            } else {
              showNotification(SCROLL_CAPTURE_FAILURE);
              await cancelCapture();
            }
          } catch (error) {
            console.error('Scroll capture finish failed:', error);
            showNotification(SCROLL_CAPTURE_FAILURE);
            await cancelCapture();
          }
        } else if (eventType === 'cancelled') {
          await cancelCapture();
        }
      };

      daemon.onEvent(activeEventHandler);

      try {
        await daemon.call('scroll-capture', 'start', {
          x: selection.x,
          y: selection.y,
          width: selection.width,
          height: selection.height,
          screenId: selection.screenId,
          autoScrollSpeed: scrollConfig.autoScrollSpeed,
          maxHeight: scrollConfig.maxHeight,
        });
      } catch (error) {
        console.error('Failed to start scroll capture:', error);
        showNotification({
          title: 'Scroll Capture Failed',
          body: 'The scrolling capture could not be started.',
        });
        await cancelCapture();
      }
    };

    startAreaSelection({
      onSelected: handleAreaSelected,
      onCancelled: async () => {
        if (!areaSelected) {
          await cleanup();
        }
        resolve();
      },
      showPrompt: true,
      style: 'default',
    });
  });
}

async function handleCaptureComplete(outputPath: string): Promise<void> {
  if (!fs.existsSync(outputPath)) {
    console.error('Scroll capture output file not found:', outputPath);
    showNotification(SCROLL_CAPTURE_FAILURE);
    return;
  }

  const config = getConfig();
  const historyItem = await addToHistory(outputPath);

  if (config.screenshot.captureToClipboard) {
    copyScreenshotToClipboard(outputPath);
    return;
  }

  if (config.screenshot.showPreview) {
    showCapturePreview(outputPath, 'screenshot', historyItem?.id);
    return;
  }

  openScreenshotEditor(outputPath, historyItem?.id);
}

export async function cancelScrollCapture(): Promise<void> {
  try {
    await daemon.call('scroll-capture', 'cancel');
  } catch (error) {
    console.error('Failed to cancel scroll capture:', error);
  }
  cleanupEventListener();
}

export async function getScrollCaptureStatus(): Promise<ScrollCaptureState> {
  try {
    const result = await daemon.call<ScrollCaptureState>(
      'scroll-capture',
      'status'
    );
    return result;
  } catch (error) {
    console.error('Failed to get scroll capture status:', error);
    return {
      isCapturing: false,
      frameCount: 0,
      estimatedHeight: 0,
    };
  }
}

export default startScrollCapture;
