import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { getLicenseNoticesPath } from '@/main/utils/paths';

export function init(): void {
  ipcMain.on('legal:open-notices', async event => {
    const error = await shell.openPath(getLicenseNoticesPath());
    if (!error) {
      return;
    }

    console.error('Failed to open license notices:', error);

    const options = {
      type: 'error' as const,
      title: 'Unable to Open Licenses',
      message: 'Unable to Open Licenses',
      detail: error,
      buttons: ['OK'],
    };
    const parentWindow = BrowserWindow.fromWebContents(event.sender);

    if (parentWindow) {
      await dialog.showMessageBox(parentWindow, options);
      return;
    }

    await dialog.showMessageBox(options);
  });
}
