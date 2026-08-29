import fs from 'fs';
import path from 'path';
import { getCameraVideoPath, getProjectFolder } from './recording-project';
import type { VideoEditorMediaSource } from '@/types/video';

export interface VideoMediaPaths {
  video: string;
  camera: string | null;
}

const mediaPathsBySender = new Map<number, VideoMediaPaths>();

export function resolveVideoMediaPaths(videoPath: string): VideoMediaPaths {
  const resolvedVideoPath = fs.realpathSync(videoPath);
  const projectFolder = getProjectFolder(videoPath);
  if (projectFolder) {
    const resolvedProjectFolder = fs.realpathSync(projectFolder);
    if (path.dirname(resolvedVideoPath) !== resolvedProjectFolder) {
      throw new Error('Project recording is outside the project folder');
    }
  }

  const cameraPath = getCameraVideoPath(videoPath);
  if (!fs.existsSync(cameraPath)) {
    return { video: resolvedVideoPath, camera: null };
  }

  const resolvedCameraPath = fs.realpathSync(cameraPath);
  const resolvedDirectory = fs.realpathSync(path.dirname(cameraPath));
  const camera =
    path.dirname(resolvedCameraPath) === resolvedDirectory
      ? resolvedCameraPath
      : null;
  return { video: resolvedVideoPath, camera };
}

export function setMediaPathsForSender(
  senderId: number,
  mediaPaths: VideoMediaPaths
): void {
  mediaPathsBySender.set(senderId, mediaPaths);
}

export function getMediaPathForSender(
  senderId: number,
  source: VideoEditorMediaSource
): string | null {
  return mediaPathsBySender.get(senderId)?.[source] ?? null;
}

export function deleteMediaPathsForSender(senderId: number): void {
  mediaPathsBySender.delete(senderId);
}
