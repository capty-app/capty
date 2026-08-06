import { ipcMain, shell } from 'electron';
import { getLicenseNoticesPath } from '@/main/utils/paths';

export function init(): void {
  ipcMain.on('legal:open-notices', async () => {
    const error = await shell.openPath(getLicenseNoticesPath());
    if (error) {
      console.error('Failed to open license notices:', error);
    }
  });
}
