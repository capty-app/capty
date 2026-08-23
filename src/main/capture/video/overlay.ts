import { daemon } from '@/main/daemon';

export async function showRecordingOverlay(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  try {
    await daemon.call('recording-overlay', 'show', { x, y, width, height });
  } catch (error) {
    console.error('Failed to show recording overlay:', error);
  }
}

export async function hideRecordingOverlay(): Promise<void> {
  try {
    await daemon.call('recording-overlay', 'hide');
  } catch (error) {
    console.error('Failed to hide recording overlay:', error);
  }
}

export async function prewarmOverlay(): Promise<void> {}
