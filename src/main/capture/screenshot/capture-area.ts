import { exec } from 'child_process';
import { getConfig } from '@/main/settings';
import { addToHistory } from '@/main/history';
import { generateScreenshotPath } from './utils.ts';
import type { AreaSelection } from '@/types/area.ts';
import { showCapturePreview } from '@/main/capture/capture-preview';
import { openScreenshotEditor } from '@/main/capture/screenshot/open-editor';
import {
  resolveCaptureOutcome,
  copyScreenshotToClipboard,
} from './capture-feedback.ts';

export interface CaptureAreaOptions {
  onCaptured?: () => void | Promise<void>;
}

export async function captureArea(
  area: AreaSelection,
  options?: CaptureAreaOptions
): Promise<string | null> {
  if (
    area.x === undefined ||
    area.y === undefined ||
    area.width === undefined ||
    area.height === undefined
  ) {
    console.error('Invalid area selection');
    return null;
  }

  const config = getConfig();
  const screenshotPath = generateScreenshotPath();
  const disableSound = !config.general.playSoundOnScreenshot;

  let command = 'screencapture';

  if (disableSound) {
    command += ' -x';
  }

  command += ` -R ${area.x},${area.y},${area.width},${area.height}`;
  command += ` -t png "${screenshotPath}"`;

  return new Promise((resolve, reject) => {
    exec(command, async (error, _stdout, stderr) => {
      if (
        resolveCaptureOutcome(error, stderr, screenshotPath, false) !==
        'captured'
      ) {
        if (error) {
          reject(error);
          return;
        }
        resolve(null);
        return;
      }

      await options?.onCaptured?.();

      const historyItem = await addToHistory(screenshotPath);

      if (config.screenshot.captureToClipboard) {
        copyScreenshotToClipboard(screenshotPath);
        resolve(screenshotPath);
        return;
      }

      if (config.screenshot.showPreview) {
        showCapturePreview(screenshotPath, 'screenshot', historyItem?.id);
        resolve(screenshotPath);
        return;
      }

      openScreenshotEditor(screenshotPath, historyItem?.id);
      resolve(screenshotPath);
    });
  });
}
