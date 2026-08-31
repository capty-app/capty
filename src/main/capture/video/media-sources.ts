import fs from 'fs';
import path from 'path';
import type { VideoEditorMediaSource } from '@/types/video';
import { getCameraVideoPath, getProjectFolder } from './recording-project';

export interface MediaFileIdentity {
  device: number;
  inode: number;
}

export interface AuthorizedMediaSource {
  path: string;
  identity: MediaFileIdentity;
}

export interface VideoMediaPaths {
  video: string;
  camera: string | null;
  identities: {
    video: MediaFileIdentity;
    camera: MediaFileIdentity | null;
  };
}

const mediaPathsBySender = new Map<number, VideoMediaPaths>();

function resolveRegularMediaSource(filePath: string): AuthorizedMediaSource {
  const resolvedPath = fs.realpathSync(filePath);
  const descriptor = fs.openSync(
    resolvedPath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
  );

  try {
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile()) throw new Error('Media source is not a regular file');

    return {
      path: resolvedPath,
      identity: { device: stats.dev, inode: stats.ino },
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

export function resolveVideoMediaPaths(videoPath: string): VideoMediaPaths {
  const video = resolveRegularMediaSource(videoPath);
  const projectFolder = getProjectFolder(videoPath);
  if (projectFolder) {
    const resolvedProjectFolder = fs.realpathSync(projectFolder);
    if (path.dirname(video.path) !== resolvedProjectFolder) {
      throw new Error('Project recording is outside the project folder');
    }
  }

  const cameraPath = getCameraVideoPath(videoPath);
  if (!fs.existsSync(cameraPath)) {
    return {
      video: video.path,
      camera: null,
      identities: { video: video.identity, camera: null },
    };
  }

  const camera = resolveRegularMediaSource(cameraPath);
  const resolvedDirectory = fs.realpathSync(path.dirname(cameraPath));
  const authorizedCamera =
    path.dirname(camera.path) === resolvedDirectory ? camera : null;

  return {
    video: video.path,
    camera: authorizedCamera?.path ?? null,
    identities: {
      video: video.identity,
      camera: authorizedCamera?.identity ?? null,
    },
  };
}

export function setMediaPathsForSender(
  senderId: number,
  mediaPaths: VideoMediaPaths
): void {
  mediaPathsBySender.set(senderId, mediaPaths);
}

export function getMediaSourceForSender(
  senderId: number,
  source: VideoEditorMediaSource
): AuthorizedMediaSource | null {
  const mediaPaths = mediaPathsBySender.get(senderId);
  const filePath = mediaPaths?.[source];
  const identity = mediaPaths?.identities[source];
  if (!filePath || !identity) return null;
  return { path: filePath, identity };
}

export function deleteMediaPathsForSender(senderId: number): void {
  mediaPathsBySender.delete(senderId);
}
