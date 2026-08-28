import { clipboard, nativeImage } from 'electron';
import fs from 'fs';
import { getConfig } from '@/main/settings';
import { showNotification } from '@/main/utils/notifications';

export type CaptureOutcome = 'captured' | 'cancelled' | 'failed';

export function resolveCaptureOutcome(
  error: Error | null,
  stderr: string,
  filePath: string,
  interactive: boolean
): CaptureOutcome {
  const stderrMessage = stderr.trim();
  if (interactive && error && !stderrMessage && !fs.existsSync(filePath)) {
    return 'cancelled';
  }

  const errorMessage = stderrMessage || error?.message;
  if (errorMessage) {
    console.error('screencapture failed:', errorMessage);
    showNotification({
      title: 'Screenshot Failed',
      body: errorMessage,
    });
    return 'failed';
  }

  if (fs.existsSync(filePath)) {
    return 'captured';
  }

  showNotification({
    title: 'Screenshot Failed',
    body: 'The screen could not be captured.',
  });
  return 'failed';
}

export function copyScreenshotToClipboard(filePath: string): void {
  const imageBuffer = fs.readFileSync(filePath);
  const image = nativeImage.createFromBuffer(imageBuffer);
  clipboard.writeImage(image);

  if (getConfig().general.showCaptureNotifications) {
    showNotification({
      title: 'Copied to Clipboard',
      body: 'Screenshot copied to your clipboard',
    });
  }
}
