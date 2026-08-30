import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';

import { normalizeV1Project } from '@/editor-v1/project-normalizer';
import {
  importV1Project,
  type V1ImportAudioSource,
  type V1ImportMusicSource,
  type V1ImportVideoSource,
} from '@/editor-v2/persistence/import-v1-project';
import { decimalSecondsToTicks } from '@/editor-v2/time/decimal';
import { PROJECT_FILES } from '@/main/capture/video/recording-project';
import type { PendingManagedFile } from '@/main/editor-v2/project/pending-managed-file';
import {
  createV1ImportManifest,
  fingerprintFile,
  fingerprintManifest,
  LegacyDataReader,
  type LegacyDataDiagnostic,
} from '@/main/editor-v2/data/legacy-data-reader';
import type { CameraRecordingMeta } from '@/types/camera';
import type {
  AudioStreamDescriptor,
  ImageMediaAsset,
  Rational,
  VideoStreamDescriptor,
} from '@/types/editor-v2';
import { SVG_WALLPAPER_PRESET_INPUTS } from '@/types/wallpaper-presets';

import type { PreparedV1ImportResult } from './project-service';

export interface LegacyVideoProbe {
  durationSeconds: number | string;
  width: number;
  height: number;
  frameRate: Rational;
  videoStreams: VideoStreamDescriptor[];
  audioStreams: AudioStreamDescriptor[];
  recordingOffsetSeconds?: number | string;
}

export interface LegacyAudioProbe {
  durationSeconds: number | string;
  streams: AudioStreamDescriptor[];
  channels: number;
  sampleRate: number;
  recordingOffsetSeconds?: number | string;
}

export interface LegacyMediaProbeService {
  probeVideo(filePath: string): Promise<LegacyVideoProbe | null>;
  probeAudio(filePath: string): Promise<LegacyAudioProbe | null>;
}

export interface PrepareV1ImportInput {
  packagePath: string;
  projectId: string;
  sequenceId: string;
  createdAt: string;
  importedAt: string;
  probes: LegacyMediaProbeService;
}

export interface PreparedV1ProjectImport extends PreparedV1ImportResult {
  normalizationDiagnostics: ReturnType<
    typeof normalizeV1Project
  >['diagnostics'];
  legacyDataDiagnostics: LegacyDataDiagnostic[];
}

const toSvgDataUrl = (svgContent: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;

const parseDataUrl = (
  dataUrl: string
): { bytes: Uint8Array; extension: string } | null => {
  const match = /^data:image\/([^;,]+)((?:;[^,]*)?),(.*)$/s.exec(dataUrl);
  if (!match) return null;

  const subtype = match[1].toLowerCase();
  const extensions: Record<string, string> = {
    jpeg: 'jpg',
    jpg: 'jpg',
    png: 'png',
    webp: 'webp',
    'svg+xml': 'svg',
  };
  const extension = extensions[subtype];
  if (!extension) return null;
  const isBase64 = match[2]
    .split(';')
    .some(parameter => parameter.toLowerCase() === 'base64');
  try {
    const bytes = isBase64
      ? Buffer.from(match[3], 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf-8');
    return { bytes, extension };
  } catch {
    return null;
  }
};

const prepareManagedImage = (
  dataUrl: string | null,
  name: string,
  sourceId: string,
  importedAt: string,
  width: number,
  height: number,
  createId: (kind: string, sourceId: string) => string
): { asset: ImageMediaAsset; file: PendingManagedFile } | null => {
  if (!dataUrl) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const assetId = createId('asset', sourceId);
  const relativePath = path.join(
    PROJECT_FILES.V2_MEDIA_FOLDER,
    assetId,
    `${sourceId}.${parsed.extension}`
  );
  return {
    asset: {
      id: assetId,
      kind: 'image',
      name,
      locator: { kind: 'managed', relativePath },
      importedAt,
      width,
      height,
      orientation: 1,
      defaultStillDurationTicks: decimalSecondsToTicks(3),
    },
    file: { relativePath, bytes: parsed.bytes },
  };
};

const createStableIdFactory =
  (sourceFingerprint: string) =>
  (kind: string, sourceId: string): string =>
    `${kind}-${createHash('sha256')
      .update(sourceFingerprint)
      .update('\0')
      .update(kind)
      .update('\0')
      .update(sourceId)
      .digest('hex')
      .slice(0, 20)}`;

const isCameraMetadata = (value: unknown): value is CameraRecordingMeta => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata.deviceId === 'string' &&
    typeof metadata.deviceName === 'string' &&
    typeof metadata.width === 'number' &&
    Number.isFinite(metadata.width) &&
    metadata.width > 0 &&
    typeof metadata.height === 'number' &&
    Number.isFinite(metadata.height) &&
    metadata.height > 0 &&
    typeof metadata.duration === 'number' &&
    Number.isFinite(metadata.duration) &&
    metadata.duration >= 0 &&
    typeof metadata.startTime === 'string' &&
    Number.isFinite(Date.parse(metadata.startTime)) &&
    typeof metadata.frameRate === 'number' &&
    Number.isFinite(metadata.frameRate) &&
    metadata.frameRate > 0
  );
};

const readOptionalJson = async (filePath: string): Promise<unknown> => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8')) as unknown;
  } catch {
    return undefined;
  }
};

const createVideoSource = async (
  packagePath: string,
  relativePath: string,
  probe: LegacyVideoProbe
): Promise<V1ImportVideoSource> => ({
  relativePath,
  fingerprint: await fingerprintFile(path.join(packagePath, relativePath)),
  ...probe,
  recordingOffsetSeconds: 0,
});

const createAudioSource = async (
  packagePath: string,
  relativePath: string,
  probe: LegacyAudioProbe
): Promise<V1ImportAudioSource> => ({
  relativePath,
  fingerprint: await fingerprintFile(path.join(packagePath, relativePath)),
  durationSeconds: probe.durationSeconds,
  recordingOffsetSeconds: 0,
  streams: probe.streams,
});

export const prepareV1ProjectImport = async (
  input: PrepareV1ImportInput
): Promise<PreparedV1ProjectImport> => {
  const manifest = await createV1ImportManifest(input.packagePath);
  const sourceFingerprint = fingerprintManifest(manifest);
  const createId = createStableIdFactory(sourceFingerprint);
  const recordingPath = path.join(input.packagePath, PROJECT_FILES.RECORDING);
  const recordingProbe = await input.probes.probeVideo(recordingPath);
  if (!recordingProbe) throw new Error('V1 recording could not be decoded');

  const systemAudioPath = path.join(
    input.packagePath,
    PROJECT_FILES.SYSTEM_AUDIO
  );
  const microphoneAudioPath = path.join(
    input.packagePath,
    PROJECT_FILES.MIC_AUDIO
  );
  const cameraPath = path.join(input.packagePath, PROJECT_FILES.CAMERA_VIDEO);
  const [systemProbe, microphoneProbe, cameraProbe] = await Promise.all([
    input.probes.probeAudio(systemAudioPath),
    input.probes.probeAudio(microphoneAudioPath),
    input.probes.probeVideo(cameraPath),
  ]);
  const stateValue = await readOptionalJson(
    path.join(input.packagePath, PROJECT_FILES.EDITOR_STATE)
  );
  const normalized = normalizeV1Project(stateValue, {
    recordingDuration: Number(recordingProbe.durationSeconds),
    systemAudioPath: systemProbe ? systemAudioPath : null,
    micAudioPath: microphoneProbe ? microphoneAudioPath : null,
    hasEmbeddedAudio: recordingProbe.audioStreams.length > 0,
    wallpaperPresets: SVG_WALLPAPER_PRESET_INPUTS.map(preset => ({
      id: preset.id,
      imageUrl: toSvgDataUrl(preset.svg),
    })),
    sourceFingerprint,
    createSegmentId: () => createId('segment', 'default'),
    savedAt: input.importedAt,
  });

  const reader = new LegacyDataReader(input.packagePath);
  const [cursor, keyboard, subtitles, cameraMetadata, originalV1State] =
    await Promise.all([
      reader.readCursor(PROJECT_FILES.CURSOR),
      reader.readKeyboard(PROJECT_FILES.KEYS),
      reader.readSubtitles(PROJECT_FILES.SUBTITLE),
      reader.readJson(PROJECT_FILES.CAMERA_META, isCameraMetadata),
      reader.locateFile(PROJECT_FILES.EDITOR_STATE),
    ]);

  const musicSources: V1ImportMusicSource[] = [];
  for (const track of normalized.state.musicTracks) {
    if (track.source !== 'music') continue;
    const relativePath = path.join(PROJECT_FILES.MUSIC_FOLDER, track.fileName);
    const absolutePath = path.join(input.packagePath, relativePath);
    const probe = await input.probes.probeAudio(absolutePath);
    if (!probe) continue;
    musicSources.push({
      fileName: track.fileName,
      relativePath,
      fingerprint: await fingerprintFile(absolutePath),
      durationSeconds: probe.durationSeconds,
      channels: probe.channels,
      sampleRate: probe.sampleRate,
      streams: probe.streams,
    });
  }

  const firstFrameImage = prepareManagedImage(
    normalized.state.firstFrame.imageData,
    'First Frame',
    'first-frame',
    input.importedAt,
    recordingProbe.width,
    recordingProbe.height,
    createId
  );
  const wallpaperImage = prepareManagedImage(
    normalized.state.wallpaper.backgroundImage,
    'Wallpaper',
    'wallpaper',
    input.importedAt,
    recordingProbe.width,
    recordingProbe.height,
    createId
  );
  const result = importV1Project({
    projectId: input.projectId,
    projectName: path.basename(input.packagePath, '.capty'),
    sequenceId: input.sequenceId,
    createdAt: input.createdAt,
    importedAt: input.importedAt,
    sourceFingerprint,
    importFiles: manifest,
    normalizedState: normalized.state,
    sources: {
      recording: await createVideoSource(
        input.packagePath,
        PROJECT_FILES.RECORDING,
        recordingProbe
      ),
      systemAudio: systemProbe
        ? await createAudioSource(
            input.packagePath,
            PROJECT_FILES.SYSTEM_AUDIO,
            systemProbe
          )
        : undefined,
      microphoneAudio: microphoneProbe
        ? await createAudioSource(
            input.packagePath,
            PROJECT_FILES.MIC_AUDIO,
            microphoneProbe
          )
        : undefined,
      cameraVideo: cameraProbe
        ? await createVideoSource(
            input.packagePath,
            PROJECT_FILES.CAMERA_VIDEO,
            cameraProbe
          )
        : undefined,
      music: musicSources,
      data: {
        cursor: cursor.locator,
        keyboard: keyboard.locator,
        subtitles: subtitles.locator,
        cameraMetadata: cameraMetadata.locator,
        originalV1State: originalV1State.locator,
      },
      firstFrameImage: firstFrameImage
        ? { asset: firstFrameImage.asset }
        : undefined,
      wallpaperImage: wallpaperImage
        ? { asset: wallpaperImage.asset }
        : undefined,
    },
    createId,
  });
  const legacyDataDiagnostics = [
    cursor.diagnostic,
    keyboard.diagnostic,
    subtitles.diagnostic,
    cameraMetadata.diagnostic,
    originalV1State.diagnostic,
  ].filter(
    (diagnostic): diagnostic is LegacyDataDiagnostic => diagnostic !== undefined
  );

  return {
    ...result,
    pendingManagedFiles: [
      ...(firstFrameImage ? [firstFrameImage.file] : []),
      ...(wallpaperImage ? [wallpaperImage.file] : []),
    ],
    normalizationDiagnostics: normalized.diagnostics,
    legacyDataDiagnostics,
  };
};
