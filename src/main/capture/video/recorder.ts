import { app } from 'electron';
import path from 'path';
import { showRecordingOverlay, hideRecordingOverlay } from './overlay.ts';
import {
  showRecordingTray,
  hideRecordingTray,
} from '@/main/menu/recording-tray.ts';
import { ensureDirectoryExists, isValidDirectory } from '@/main/utils/paths.ts';
import { getConfig } from '@/main/settings';
import { generateFilename } from '@/main/utils/filename-generator';
import { DEFAULT_STORAGE_CONFIG } from '@/types/settings';
import { createProjectFolder } from './recording-project';
import {
  PROJECT_EXTENSION,
  type RecorderResponse,
  type RecorderState,
  type RecordingConfig,
} from '@/types/video';
import { daemon } from '@/main/daemon';

let recorderState: RecorderState = 'idle';
let currentRecordingPath: string | null = null;
let currentDuration = 0;

export function getRecordingsDir(): string {
  const config = getConfig();
  const customPath = config.storage?.recordingsPath;

  if (customPath && isValidDirectory(customPath)) {
    return ensureDirectoryExists(customPath);
  }

  const moviesPath = app.getPath('videos');
  const defaultDir = path.join(moviesPath, 'Capty');
  return ensureDirectoryExists(defaultDir);
}

export function generateRecordingProjectName(): string {
  const config = getConfig();
  const pattern =
    config.storage?.namingPattern || DEFAULT_STORAGE_CONFIG.namingPattern;

  const baseName = generateFilename({
    pattern,
    type: 'Recording',
    extension: '',
  });

  return baseName.replace(/\.$/, '') + PROJECT_EXTENSION;
}

export function createRecordingProject(): string {
  const projectPath = path.join(
    getRecordingsDir(),
    generateRecordingProjectName()
  );
  return createProjectFolder(projectPath);
}

export function generateRecordingExportName(extension = 'mp4'): string {
  const config = getConfig();
  const pattern =
    config.storage?.namingPattern || DEFAULT_STORAGE_CONFIG.namingPattern;

  return generateFilename({
    pattern,
    type: 'Recording',
    extension,
  });
}

export function isRecording(): boolean {
  return recorderState === 'recording' || recorderState === 'paused';
}

export function isPaused(): boolean {
  return recorderState === 'paused';
}

export function getRecordingDuration(): number {
  return currentDuration;
}

export function getRecordingState(): RecorderState {
  return recorderState;
}

export function getCurrentRecordingPath(): string | null {
  return currentRecordingPath;
}

export async function startRecordingWithConfig(
  config: RecordingConfig,
  showControl: () => void | Promise<void>
): Promise<void> {
  const isAreaRecording =
    config.x !== undefined &&
    config.y !== undefined &&
    config.width !== undefined &&
    config.height !== undefined;

  const isIOSRecording = config.iosDeviceId != null;

  const startPromise = daemon.call<RecorderResponse>(
    'screen-recorder',
    'start',
    {
      x: config.x,
      y: config.y,
      width: config.width,
      height: config.height,
      displayId: config.displayId,
      includeAudio: config.includeAudio ?? true,
      micEnabled: config.micEnabled ?? false,
      micDeviceId: config.micDeviceId,
      micDeviceName: config.micDeviceName,
      cameraEnabled: config.cameraEnabled ?? false,
      cameraDeviceId: config.cameraDeviceId,
      cameraDeviceName: config.cameraDeviceName,
      keyboardEnabled: config.keyboardEnabled ?? false,
      frameRate: config.frameRate ?? 60,
      outputPath: config.outputPath,
      iosDeviceId: config.iosDeviceId,
      iosDeviceName: config.iosDeviceName,
    },
    60000
  );

  const overlayPromise =
    isAreaRecording && !isIOSRecording
      ? showRecordingOverlay(
          config.x!,
          config.y!,
          config.width!,
          config.height!
        )
      : Promise.resolve();

  const [response] = await Promise.all([startPromise, overlayPromise]);

  if (!response.success) {
    throw new Error(response.message || 'Failed to start recording');
  }

  recorderState = 'recording';
  currentRecordingPath = config.outputPath;
  await showControl();
  showRecordingTray();
}

export async function pauseRecording(): Promise<void> {
  if (recorderState !== 'recording') {
    console.log('Not recording, cannot pause');
    return;
  }

  const response = await daemon.call<RecorderResponse>(
    'screen-recorder',
    'pause'
  );

  if (!response.success) {
    throw new Error(response.message || 'Failed to pause recording');
  }

  recorderState = 'paused';
  if (response.duration !== undefined) {
    currentDuration = response.duration;
  }
}

export async function resumeRecording(): Promise<void> {
  if (recorderState !== 'paused') {
    console.log('Not paused, cannot resume');
    return;
  }

  const response = await daemon.call<RecorderResponse>(
    'screen-recorder',
    'resume'
  );

  if (!response.success) {
    throw new Error(response.message || 'Failed to resume recording');
  }

  recorderState = 'recording';
  if (response.duration !== undefined) {
    currentDuration = response.duration;
  }
}

export async function stopRecording(
  hideControl: () => void | Promise<void>
): Promise<string | null> {
  if (!isRecording()) {
    console.log('Not recording, nothing to stop');
    return null;
  }

  const outputPath = currentRecordingPath;
  await hideControl();

  let response: RecorderResponse | null = null;
  let stopError: Error | null = null;

  try {
    response = await daemon.call<RecorderResponse>(
      'screen-recorder',
      'stop',
      undefined,
      60000
    );
    if (!response.success) {
      stopError = new Error(response.message || 'Failed to stop recording');
    }
  } catch (error) {
    stopError = error instanceof Error ? error : new Error(String(error));
  }

  await hideRecordingOverlay();
  hideRecordingTray();

  currentRecordingPath = null;
  currentDuration = 0;
  recorderState = 'idle';

  if (stopError) {
    throw stopError;
  }

  const finalPath = response?.outputPath || outputPath;
  console.log('Recording saved to:', finalPath);

  return finalPath;
}

export async function quitRecorder(): Promise<void> {
  await hideRecordingOverlay();
  hideRecordingTray();

  if (recorderState !== 'idle') {
    try {
      await daemon.call('screen-recorder', 'stop', undefined, 5000);
    } catch {
      // Ignore errors during quit
    }
  }

  recorderState = 'idle';
}

export async function prewarmRecorder(): Promise<void> {
  try {
    await daemon.call('screen-recorder', 'status', undefined, 5000);
  } catch (error) {
    console.error('Failed to prewarm recorder:', error);
  }
}
