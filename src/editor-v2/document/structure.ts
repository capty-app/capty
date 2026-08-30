export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string');

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNonNegativeInteger = (value: unknown): boolean =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const isPositiveInteger = (value: unknown): boolean =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isRational = (value: unknown): boolean =>
  isRecord(value) &&
  isPositiveInteger(value.numerator) &&
  isPositiveInteger(value.denominator);

const isSafeRelativePath = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return false;
  return !value.split(/[\\/]/).some(segment => segment === '..');
};

const isFingerprint = (value: unknown): boolean =>
  isRecord(value) &&
  isNonNegativeInteger(value.byteLength) &&
  typeof value.sha256 === 'string' &&
  value.sha256.length > 0 &&
  (value.modifiedAt === undefined || typeof value.modifiedAt === 'string');

const isMediaLocator = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'managed':
      return isSafeRelativePath(value.relativePath);
    case 'legacy-package-read-only':
      return (
        isSafeRelativePath(value.relativePath) &&
        isFingerprint(value.fingerprint)
      );
    case 'linked':
      return (
        typeof value.absolutePath === 'string' &&
        isFingerprint(value.fingerprint)
      );
    default:
      return false;
  }
};

const isDataLocator = (value: unknown): boolean => {
  if (
    !isRecord(value) ||
    (value.kind !== 'v1-read-only' && value.kind !== 'v2-data') ||
    !isSafeRelativePath(value.relativePath) ||
    !isFingerprint(value.fingerprint)
  ) {
    return false;
  }
  if (value.kind === 'v1-read-only') return true;
  return (
    value.provenance === undefined ||
    (isRecord(value.provenance) &&
      value.provenance.kind === 'v1-read-only' &&
      isSafeRelativePath(value.provenance.relativePath) &&
      isFingerprint(value.provenance.fingerprint))
  );
};

const isVideoStream = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.codec === 'string' &&
  isPositiveInteger(value.durationTicks) &&
  isPositiveInteger(value.width) &&
  isPositiveInteger(value.height) &&
  isRational(value.frameRate) &&
  typeof value.hasAlpha === 'boolean';

const isAudioStream = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.codec === 'string' &&
  isPositiveInteger(value.durationTicks) &&
  isPositiveInteger(value.channels) &&
  isPositiveInteger(value.sampleRate);

const isArrayOf = (
  value: unknown,
  predicate: (entry: unknown) => boolean
): boolean => Array.isArray(value) && value.every(predicate);

const isCaptyDataSource = (value: unknown): boolean =>
  isRecord(value) &&
  isDataLocator(value.locator) &&
  isNonNegativeInteger(value.recordingOffsetTicks);

const isCaptyVideoSource = (value: unknown): boolean =>
  isRecord(value) &&
  value.kind === 'video' &&
  isMediaLocator(value.locator) &&
  isNonNegativeInteger(value.recordingOffsetTicks) &&
  isPositiveInteger(value.durationTicks) &&
  isArrayOf(value.streams, isVideoStream);

const isCaptyAudioSource = (value: unknown): boolean =>
  isRecord(value) &&
  value.kind === 'audio' &&
  isMediaLocator(value.locator) &&
  isNonNegativeInteger(value.recordingOffsetTicks) &&
  isPositiveInteger(value.durationTicks) &&
  isArrayOf(value.streams, isAudioStream);

const isOptional = (
  value: unknown,
  predicate: (entry: unknown) => boolean
): boolean => value === undefined || predicate(value);

export const isAssetStructure = (value: Record<string, unknown>): boolean => {
  const base =
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.importedAt === 'string' &&
    isMediaLocator(value.locator);
  if (!base) return false;

  switch (value.kind) {
    case 'video':
      return (
        isPositiveInteger(value.durationTicks) &&
        isPositiveInteger(value.width) &&
        isPositiveInteger(value.height) &&
        isRational(value.frameRate) &&
        isArrayOf(value.videoStreams, isVideoStream) &&
        isArrayOf(value.audioStreams, isAudioStream)
      );
    case 'audio':
      return (
        isPositiveInteger(value.durationTicks) &&
        isPositiveInteger(value.channels) &&
        isPositiveInteger(value.sampleRate) &&
        isArrayOf(value.audioStreams, isAudioStream)
      );
    case 'image':
      return (
        isPositiveInteger(value.width) &&
        isPositiveInteger(value.height) &&
        isFiniteNumber(value.orientation) &&
        isPositiveInteger(value.defaultStillDurationTicks)
      );
    case 'capty-recording': {
      if (
        !isPositiveInteger(value.durationTicks) ||
        !isPositiveInteger(value.width) ||
        !isPositiveInteger(value.height) ||
        !isRational(value.frameRate) ||
        !isArrayOf(value.videoStreams, isVideoStream) ||
        !isArrayOf(value.audioStreams, isAudioStream) ||
        !isRecord(value.sources)
      ) {
        return false;
      }
      const sources = value.sources;
      return (
        isOptional(sources.systemAudio, isCaptyAudioSource) &&
        isOptional(sources.microphoneAudio, isCaptyAudioSource) &&
        isOptional(sources.cameraVideo, isCaptyVideoSource) &&
        isOptional(sources.cameraMetadata, isCaptyDataSource) &&
        isOptional(sources.cursor, isCaptyDataSource) &&
        isOptional(sources.keyboard, isCaptyDataSource) &&
        isOptional(sources.subtitles, isCaptyDataSource) &&
        isOptional(
          sources.originalV1State,
          value =>
            isRecord(value) &&
            value.kind === 'v1-read-only' &&
            isDataLocator(value)
        )
      );
    }
    default:
      return false;
  }
};

export const isTrackStructure = (value: Record<string, unknown>): boolean => {
  const base =
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isStringArray(value.clipIds) &&
    typeof value.locked === 'boolean';
  if (!base) return false;

  if (value.kind === 'video') {
    return (
      typeof value.visible === 'boolean' &&
      isNonNegativeInteger(value.compositingOrder)
    );
  }
  if (value.kind === 'audio') {
    return (
      typeof value.muted === 'boolean' &&
      typeof value.solo === 'boolean' &&
      isFiniteNumber(value.gain) &&
      isNonNegativeInteger(value.mixOrder)
    );
  }
  return false;
};

const isTimeDomain = (value: unknown): boolean =>
  value === 'asset-source' ||
  value === 'content-timeline' ||
  value === 'output-timeline';

const isRange = (value: unknown): boolean =>
  isRecord(value) &&
  isNonNegativeInteger(value.start) &&
  isPositiveInteger(value.end) &&
  Number(value.end) > Number(value.start);

const isEffect = (value: unknown): boolean => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.enabled !== 'boolean'
  ) {
    return false;
  }

  switch (value.kind) {
    case 'transform':
      return isRecord(value.value);
    case 'opacity':
      return isFiniteNumber(value.opacity);
    case 'cursor':
      return (
        isTimeDomain(value.timeDomain) &&
        isDataLocator(value.data) &&
        isRecord(value.style)
      );
    case 'zoom':
      return (
        isTimeDomain(value.timeDomain) &&
        isRange(value.range) &&
        isFiniteNumber(value.scale) &&
        (value.target === 'cursor' || value.target === 'manual') &&
        isNonNegativeInteger(value.transitionInTicks) &&
        isNonNegativeInteger(value.transitionOutTicks) &&
        isFiniteNumber(value.followSmoothness) &&
        isNonNegativeInteger(value.lookAheadTicks)
      );
    case 'camera-layout':
      return isRecord(value.style);
    case 'annotation':
      return (
        isTimeDomain(value.timeDomain) &&
        isRange(value.range) &&
        isPositiveInteger(value.canvasWidth) &&
        isPositiveInteger(value.canvasHeight) &&
        Array.isArray(value.annotations)
      );
    case 'keyboard':
      return (
        isTimeDomain(value.timeDomain) &&
        isDataLocator(value.data) &&
        isRecord(value.style) &&
        isRecord(value.sound)
      );
    case 'subtitle':
      return (
        isTimeDomain(value.timeDomain) &&
        isDataLocator(value.data) &&
        isRecord(value.style)
      );
    case 'audio-gain':
      return isFiniteNumber(value.gain);
    default:
      return false;
  }
};

export const isClipStructure = (value: Record<string, unknown>): boolean => {
  const base =
    typeof value.id === 'string' &&
    typeof value.trackId === 'string' &&
    typeof value.assetId === 'string' &&
    typeof value.name === 'string' &&
    isNonNegativeInteger(value.timelineStart) &&
    isPositiveInteger(value.timelineDuration) &&
    isNonNegativeInteger(value.sourceStart) &&
    isPositiveInteger(value.sourceDuration) &&
    isRational(value.playbackRate) &&
    (value.linkedGroupId === undefined ||
      typeof value.linkedGroupId === 'string') &&
    isArrayOf(value.effects, isEffect);
  if (!base) return false;

  if (value.kind === 'video') {
    return (
      value.sourceStreamId === undefined ||
      typeof value.sourceStreamId === 'string'
    );
  }
  if (value.kind === 'image') return true;
  if (value.kind === 'audio') {
    return (
      (value.sourceStreamId === undefined ||
        typeof value.sourceStreamId === 'string') &&
      isFiniteNumber(value.gain) &&
      isNonNegativeInteger(value.fadeInTicks) &&
      isNonNegativeInteger(value.fadeOutTicks)
    );
  }
  return false;
};

export const isTransitionStructure = (
  value: Record<string, unknown>
): boolean => {
  if (
    typeof value.id !== 'string' ||
    typeof value.trackId !== 'string' ||
    !isPositiveInteger(value.durationTicks)
  ) {
    return false;
  }

  if (value.type === 'video-fade-black') {
    return (
      typeof value.clipId === 'string' &&
      (value.edge === 'in' || value.edge === 'out')
    );
  }

  return (
    (value.type === 'video-cross-dissolve' ||
      value.type === 'audio-crossfade') &&
    typeof value.fromClipId === 'string' &&
    typeof value.toClipId === 'string' &&
    isNonNegativeInteger(value.cutTick) &&
    value.alignment === 'center'
  );
};

export const isSequenceEffect = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  if (value.kind === 'annotation') return isEffect(value);
  if (typeof value.id !== 'string' || typeof value.enabled !== 'boolean') {
    return false;
  }

  if (value.kind === 'canvas-settings') {
    return (
      isPositiveInteger(value.width) &&
      isPositiveInteger(value.height) &&
      typeof value.backgroundColor === 'string'
    );
  }
  if (value.kind === 'wallpaper') {
    return (
      isRecord(value.background) &&
      isFiniteNumber(value.padding) &&
      isFiniteNumber(value.corners) &&
      isFiniteNumber(value.shadow)
    );
  }
  if (value.kind === 'device-frame') return value.frame === 'ios-device';
  return false;
};

export const isImportProvenance = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return (
    typeof value.packageFingerprint === 'string' &&
    typeof value.importedAt === 'string' &&
    Array.isArray(value.files) &&
    value.files.every(
      file =>
        isRecord(file) &&
        isSafeRelativePath(file.relativePath) &&
        isFingerprint(file.fingerprint)
    )
  );
};

export const isPreRoll = (value: unknown): boolean =>
  isRecord(value) &&
  value.kind === 'output-frame-count' &&
  typeof value.assetId === 'string' &&
  isPositiveInteger(value.frames) &&
  (value.fit === 'cover' || value.fit === 'stretch');
