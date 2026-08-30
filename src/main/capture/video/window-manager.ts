import { BrowserWindow, screen, app, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { isDev, devServerUrl } from '@/main/utils/env';
import {
  getEditorProjectLocation,
  getProjectFormat,
} from './recording-project';
import { registerDockWindow } from '@/main/utils/dock';
import { EditorProjectService } from '@/main/editor-v2/project/project-service';
import { prepareV1ProjectImport } from '@/main/editor-v2/project/v1-import-coordinator';
import {
  EDITOR_V1_PRELOAD_FILE,
  EDITOR_V2_PRELOAD_FILE,
} from '@/main/editor-v2/preload-files';
import { LegacyFfmpegProbeService } from '@/main/editor-v2/project/legacy-media-probe';
import type { EditorProjectLocation } from '@/types/editor-project';
import type {
  EditorProjectSession,
  OpenEditorProjectResult,
} from '@/main/editor-v2/project/project-service';
import type { EditorVersion } from '@/types/editor-v2';

export interface VideoEditorWindowData {
  window: BrowserWindow;
  filePath: string;
  isClosingConfirmed: boolean;
  isExporting: boolean;
  editorVersion?: EditorVersion;
  projectLocation?: EditorProjectLocation;
  projectToken?: string;
  projectSession?: EditorProjectSession;
  projectOpen?: Promise<OpenEditorProjectResult>;
}

interface CreateVideoEditorWindowOptions {
  editorVersion?: EditorVersion;
  bounds?: Electron.Rectangle;
  maximized?: boolean;
}

const videoEditorWindows = new Map<number, VideoEditorWindowData>();
const projectService = new EditorProjectService();
const legacyProbeService = new LegacyFfmpegProbeService();

const canonicalizePath = (filePath: string): string => {
  const absolutePath = path.resolve(filePath);
  if (typeof fs.realpathSync !== 'function') return absolutePath;
  try {
    return fs.realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
};

const canonicalizeLocation = (
  inputPath: string
): EditorProjectLocation | null => {
  const canonicalInputPath = canonicalizePath(inputPath);
  const location = getEditorProjectLocation(canonicalInputPath);
  if (!location) return null;
  if (location.kind === 'standalone') {
    return {
      kind: 'standalone',
      sourcePath: canonicalizePath(location.sourcePath),
    };
  }
  const packagePath = canonicalizePath(location.packagePath);
  const format = getProjectFormat(packagePath) ?? location.format;
  const recordingPath = path.join(packagePath, 'recording.mov');
  return {
    kind: 'capty-package',
    packagePath,
    format,
    v1RecordingPath: fs.existsSync(recordingPath) ? recordingPath : undefined,
  };
};

const getLocationIdentity = (location: EditorProjectLocation): string =>
  location.kind === 'capty-package'
    ? location.packagePath
    : location.sourcePath;

const findWindowByLocation = (
  location: EditorProjectLocation
): VideoEditorWindowData | undefined => {
  const identity = getLocationIdentity(location);
  return [...videoEditorWindows.values()].find(data => {
    if (!data.projectLocation)
      return canonicalizePath(data.filePath) === identity;
    return getLocationIdentity(data.projectLocation) === identity;
  });
};

const getDefaultEditorVersion = (
  location: EditorProjectLocation
): EditorVersion => {
  if (isDev && location.kind === 'capty-package' && location.format === 'v2') {
    return 'v2';
  }
  return 'v1';
};

const getV1VideoPath = (location: EditorProjectLocation): string | null => {
  if (location.kind === 'standalone') return location.sourcePath;
  return location.v1RecordingPath ?? null;
};

const createV1Import = async (location: EditorProjectLocation) => {
  if (location.kind !== 'capty-package') {
    throw new Error(
      'Standalone media must be converted before opening Editor V2'
    );
  }
  const createdAt =
    typeof fs.statSync === 'function'
      ? fs.statSync(location.packagePath).birthtime.toISOString()
      : new Date(0).toISOString();
  const stablePrefix = crypto
    .createHash('sha256')
    .update(location.packagePath)
    .digest('hex')
    .slice(0, 20);
  return prepareV1ProjectImport({
    packagePath: location.packagePath,
    projectId: `project-${stablePrefix}`,
    sequenceId: `sequence-${stablePrefix}`,
    createdAt,
    importedAt: new Date().toISOString(),
    probes: legacyProbeService,
  });
};

const openV2Project = (
  location: EditorProjectLocation,
  projectToken: string
): Promise<OpenEditorProjectResult> =>
  projectService.open(getLocationIdentity(location), projectToken, () =>
    createV1Import(location)
  );

const loadEditorPage = (
  window: BrowserWindow,
  editorVersion: EditorVersion
): void => {
  const isV2 = editorVersion === 'v2';
  if (devServerUrl) {
    const url = new URL(devServerUrl);
    if (isV2) url.searchParams.set('editor', 'v2');
    window.loadURL(url.toString());
    return;
  }
  window.loadFile(
    path.join(__dirname, '../dist/index.html'),
    isV2 ? { query: { editor: 'v2' } } : undefined
  );
};

export function getWindowData(
  webContentsId: number
): VideoEditorWindowData | undefined {
  return videoEditorWindows.get(webContentsId);
}

export function setWindowData(
  webContentsId: number,
  data: VideoEditorWindowData
): void {
  videoEditorWindows.set(webContentsId, data);
}

export function deleteWindowData(webContentsId: number): void {
  videoEditorWindows.delete(webContentsId);
}

export function updateWindowFilePath(
  webContentsId: number,
  newFilePath: string
): void {
  const data = videoEditorWindows.get(webContentsId);
  if (!data) return;
  data.filePath = newFilePath;
  const location = canonicalizeLocation(newFilePath);
  if (location) data.projectLocation = location;
}

export function getWindowFromWebContentsId(
  webContentsId: number
): BrowserWindow | null {
  const data = videoEditorWindows.get(webContentsId);
  return data?.window ?? null;
}

export function getVideoEditorWindowsCount(): number {
  return videoEditorWindows.size;
}

export function createVideoEditorWindow(
  inputPath: string,
  options: CreateVideoEditorWindowOptions = {}
): BrowserWindow | undefined {
  const projectLocation = canonicalizeLocation(inputPath);
  if (!projectLocation) {
    console.error('Project or video file not found:', inputPath);
    return;
  }

  const existing = findWindowByLocation(projectLocation);
  if (existing && !existing.window.isDestroyed()) {
    existing.window.show();
    existing.window.focus();
    return existing.window;
  }

  const editorVersion =
    options.editorVersion ?? getDefaultEditorVersion(projectLocation);
  if (editorVersion === 'v2' && !isDev) {
    console.error('Editor V2 is available only in development');
    return;
  }
  const videoPath = getV1VideoPath(projectLocation);
  if (editorVersion === 'v1' && (!videoPath || !fs.existsSync(videoPath))) {
    console.error('Video file not found:', videoPath ?? inputPath);
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;
  const defaultWidth = Math.min(1280, screenWidth - 100);
  const defaultHeight = Math.min(800, screenHeight - 100);
  const existingWindowCount = videoEditorWindows.size;
  const positionOffset = existingWindowCount * 30;
  const bounds = options.bounds ?? {
    width: defaultWidth,
    height: defaultHeight,
    x: Math.floor((screenWidth - defaultWidth) / 2) + positionOffset,
    y: Math.floor((screenHeight - defaultHeight) / 2) + positionOffset,
  };
  const projectToken = crypto.randomUUID();
  const newWindow = new BrowserWindow({
    ...bounds,
    minWidth: 1200,
    minHeight: 750,
    maximizable: true,
    minimizable: true,
    resizable: true,
    webPreferences: {
      preload: path.join(
        __dirname,
        editorVersion === 'v2' ? EDITOR_V2_PRELOAD_FILE : EDITOR_V1_PRELOAD_FILE
      ),
      devTools: isDev,
      webSecurity: editorVersion === 'v2',
    },
    alwaysOnTop: false,
    titleBarStyle: 'hiddenInset',
    frame: true,
    show: false,
    backgroundColor: '#1e1e1e',
  });
  if (options.maximized) newWindow.maximize();

  const webContentsId = newWindow.webContents.id;
  const data: VideoEditorWindowData = {
    window: newWindow,
    filePath: videoPath ?? getLocationIdentity(projectLocation),
    isClosingConfirmed: false,
    isExporting: false,
    editorVersion,
    projectLocation,
    projectToken,
  };
  if (editorVersion === 'v2') {
    data.projectOpen = openV2Project(projectLocation, projectToken);
    data.projectOpen
      .then(opened => {
        if (videoEditorWindows.get(webContentsId) === data) {
          data.projectSession = opened.session;
          return;
        }
        projectService.release(opened.session);
      })
      .catch(() => undefined);
  }
  videoEditorWindows.set(webContentsId, data);
  loadEditorPage(newWindow, editorVersion);

  newWindow.webContents.on('did-finish-load', async () => {
    const currentData = videoEditorWindows.get(webContentsId);
    if (!currentData) return;
    if (currentData.editorVersion !== 'v2') {
      newWindow.webContents.send('load', {
        type: 'video-editor',
        params: {
          filePath: currentData.filePath,
          canSwitchEditorVersion: isDev,
        },
      });
      return;
    }

    try {
      const opened = await currentData.projectOpen;
      if (!opened || newWindow.isDestroyed()) return;
      currentData.projectSession = opened.session;
      const location = currentData.projectLocation!;
      const displayPath = getLocationIdentity(location);
      newWindow.webContents.send('editor-v2:project:load', {
        projectToken: currentData.projectToken,
        displayName: path.basename(
          displayPath,
          location.kind === 'capty-package'
            ? '.capty'
            : path.extname(displayPath)
        ),
        displayPath,
        project: opened.project,
        workspace: opened.workspace,
        canSwitchEditorVersion:
          isDev &&
          location.kind === 'capty-package' &&
          !!location.v1RecordingPath,
      });
    } catch (error) {
      console.error('Failed to open Editor V2 project:', error);
      if (!newWindow.isDestroyed()) {
        newWindow.webContents.send('editor-v2:project:load-error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  newWindow.once('ready-to-show', async () => {
    await registerDockWindow(newWindow, 'video-editor');
    app.focus({ steal: true });
    newWindow.show();
    newWindow.focus();
  });

  newWindow.on('close', () => {
    const windowData = videoEditorWindows.get(webContentsId);
    if (!windowData) return;
    if (!windowData.isClosingConfirmed && !newWindow.isDestroyed()) {
      windowData.isClosingConfirmed = true;
    }
  });

  newWindow.on('closed', () => {
    const windowData = videoEditorWindows.get(webContentsId);
    if (windowData?.projectSession)
      projectService.release(windowData.projectSession);
    videoEditorWindows.delete(webContentsId);
  });

  return newWindow;
}

export async function recreateVideoEditorWindow(
  webContentsId: number,
  targetVersion: EditorVersion
): Promise<BrowserWindow | undefined> {
  const data = videoEditorWindows.get(webContentsId);
  if (!data?.projectLocation || data.window.isDestroyed()) return;
  if (targetVersion === 'v1' && !getV1VideoPath(data.projectLocation)) return;
  const maximized = data.window.isMaximized();
  const bounds = maximized
    ? data.window.getNormalBounds()
    : data.window.getBounds();
  if (data.projectOpen && !data.projectSession) {
    const opened = await data.projectOpen;
    data.projectSession = opened.session;
  }
  videoEditorWindows.delete(webContentsId);
  const nextWindow = createVideoEditorWindow(
    getLocationIdentity(data.projectLocation),
    {
      editorVersion: targetVersion,
      bounds,
      maximized,
    }
  );
  if (!nextWindow) {
    videoEditorWindows.set(webContentsId, data);
    return;
  }
  if (data.projectSession) projectService.release(data.projectSession);
  data.projectSession = undefined;
  data.isClosingConfirmed = true;
  data.window.destroy();
  return nextWindow;
}

export function getVideoEditorWindow(
  webContentsId: number
): BrowserWindow | null {
  return getWindowFromWebContentsId(webContentsId);
}

export async function openVideoInEditor(): Promise<void> {
  app.focus({ steal: true });
  const result = await dialog.showOpenDialog({
    title: 'Select Video to Edit',
    filters: [
      {
        name: 'Videos and Capty Projects',
        extensions: ['capty', 'mov', 'mp4', 'webm', 'm4v', 'avi', 'mkv'],
      },
    ],
    properties: ['openFile', 'openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return;
  createVideoEditorWindow(result.filePaths[0]);
}

export { projectService as editorProjectService };
