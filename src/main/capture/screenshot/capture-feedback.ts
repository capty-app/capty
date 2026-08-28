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
  if (error || stderr.trim()) {
    console.error('screencapture failed:', error?.message || stderr);
    showNotification({
      title: 'Screenshot Failed',
      body:
        stderr.trim() || error?.message || 'The screen could not be captured.',
    });
    return 'failed';
  }

  if (fs.existsSync(filePath)) {
    return 'captured';
  }

  if (interactive) {
    return 'cancelled';
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
