import { exec } from 'child_process';
import { app, clipboard } from 'electron';
import fs from 'fs';
import path from 'path';
import { getConfig } from '@/main/settings';
import {
  hideDesktopIcons,
  showDesktopIcons,
  isSupported as isDesktopIconsSupported,
} from '@/main/capture/desktop-icons';
import { daemon } from '@/main/daemon';
import { showNotification } from '@/main/utils/notifications';

export default async function scanQRCode(): Promise<void> {
  const config = getConfig();
  const shouldHideIcons =
    config.screenshot.hideDesktopIcons && isDesktopIconsSupported();

  if (shouldHideIcons) {
    await hideDesktopIcons('capture');
  }

  const timestamp = Date.now();
  const tempDir = app.getPath('temp');
  const tempScreenshotPath = path.join(
    tempDir,
    `capty-qrcode-${timestamp}.png`
  );

  const command = `screencapture -i -x -t png "${tempScreenshotPath}"`;

  exec(command, async (error, _stdout, stderr) => {
    if (shouldHideIcons) {
      await showDesktopIcons('capture');
    }

    if (error) {
      console.log(`Screencapture error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`Screencapture stderr: ${stderr}`);
      return;
    }

    if (!fs.existsSync(tempScreenshotPath)) {
      return;
    }

    try {
      const qrCodeValue = await extractQRCode(tempScreenshotPath);

      fs.unlinkSync(tempScreenshotPath);

      if (qrCodeValue && qrCodeValue.trim()) {
        clipboard.writeText(qrCodeValue.trim());
        showNotification({
          title: 'QR Code Copied',
          body: 'QR code value has been copied to clipboard',
        });
      } else {
        showNotification({
          title: 'No QR Code Found',
          body: 'No QR code was detected in the selected area',
        });
      }
    } catch (err) {
      console.error('QR code scan error:', err);
      if (fs.existsSync(tempScreenshotPath)) {
        fs.unlinkSync(tempScreenshotPath);
      }
      showNotification({
        title: 'Scan Failed',
        body: 'Failed to scan QR code from the image',
      });
    }
  });
}

async function extractQRCode(imagePath: string): Promise<string> {
  const result = await daemon.call<{ payload: string }>('qrcode', 'detect', {
    imagePath,
  });
  return result?.payload || '';
}
