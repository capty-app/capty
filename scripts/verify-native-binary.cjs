const { execFileSync, spawnSync } = require('node:child_process');

const SYSTEM_LIBRARY_PREFIXES = ['/System/Library/', '/usr/lib/'];
const ARCHITECTURES = ['arm64', 'x86_64'];
const SMOKE_TEST_TIMEOUT = 10000;
const REQUIRED_FFMPEG_FEATURES = {
  encoders: [
    'h264_videotoolbox',
    'hevc_videotoolbox',
    'prores_videotoolbox',
    'aac',
    'aac_at',
    'pcm_s16le',
    'gif',
    'png',
    'mjpeg',
  ],
  decoders: [
    'h264',
    'hevc',
    'aac',
    'mp3',
    'opus',
    'pcm_s16le',
    'vorbis',
    'gif',
    'png',
    'mjpeg',
    'prores',
  ],
  muxers: [
    'mp4',
    'mov',
    'adts',
    'ipod',
    'wav',
    'gif',
    'image2',
    'mjpeg',
    'null',
  ],
  demuxers: [
    'mp4',
    'mov',
    'aac',
    'concat',
    'mp3',
    'ogg',
    'wav',
    'gif',
    'image2',
    'mjpeg',
  ],
  devices: ['lavfi'],
  protocols: ['file', 'pipe'],
  filters: [
    'scale',
    'fps',
    'palettegen',
    'paletteuse',
    'split',
    'pad',
    'format',
    'null',
    'aformat',
    'anull',
    'adelay',
    'amix',
    'anullsrc',
    'atempo',
    'volume',
    'concat',
    'trim',
    'atrim',
    'setpts',
    'asetpts',
    'select',
    'aselect',
  ],
};

function parseLinkedDependencies(output) {
  return output
    .split('\n')
    .filter(line => /^\s+\S/.test(line))
    .map(line => line.trim().split(' (compatibility version')[0])
    .filter(Boolean);
}

function getUnsupportedDependencies(outputs) {
  return [
    ...new Set(
      outputs
        .flatMap(parseLinkedDependencies)
        .filter(
          dependency =>
            !SYSTEM_LIBRARY_PREFIXES.some(prefix =>
              dependency.startsWith(prefix)
            )
        )
    ),
  ];
}

function parseFFmpegFeatures(output, featureType) {
  const featurePattern =
    featureType === 'protocols'
      ? /^\s{2,}([a-z0-9][a-z0-9_+.-]*)\s*$/i
      : /^\s+\S+\s+(\S+)/;

  return output
    .split('\n')
    .flatMap(line => line.match(featurePattern)?.[1]?.split(',') || []);
}

function getMissingFeatures(output, requiredFeatures, featureType) {
  const availableFeatures = new Set(parseFFmpegFeatures(output, featureType));

  return requiredFeatures.filter(feature => !availableFeatures.has(feature));
}

function runBinary(
  label,
  binaryPath,
  args,
  input,
  architecture,
  spawnBinary = spawnSync
) {
  const result = spawnBinary(
    '/usr/bin/arch',
    [`-${architecture}`, binaryPath, ...args],
    {
      encoding: 'utf8',
      input,
      killSignal: 'SIGKILL',
      maxBuffer: 10 * 1024 * 1024,
      timeout: SMOKE_TEST_TIMEOUT,
    }
  );
  const architectureLabel = `${label} (${architecture})`;

  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${architectureLabel} smoke test timed out: ${binaryPath}`);
  }

  if (result.error) {
    throw new Error(
      `${architectureLabel} failed to start: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    const details = result.stderr?.trim();
    throw new Error(
      details || `${architectureLabel} exited with status ${result.status}`
    );
  }

  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function verifyFFmpegRuntime(binaryPath, architecture, run = runBinary) {
  run('FFmpeg', binaryPath, ['-version'], undefined, architecture);

  for (const [featureType, requiredFeatures] of Object.entries(
    REQUIRED_FFMPEG_FEATURES
  )) {
    const output = run(
      'FFmpeg',
      binaryPath,
      ['-hide_banner', `-${featureType}`],
      undefined,
      architecture
    );
    const missingFeatures = getMissingFeatures(
      output,
      requiredFeatures,
      featureType
    );

    if (missingFeatures.length === 0) continue;

    throw new Error(
      `FFmpeg (${architecture}) is missing required ${featureType}: ${missingFeatures.join(', ')}`
    );
  }
}

function verifyNativeRuntime(label, binaryPath, architecture, run = runBinary) {
  switch (label) {
    case 'capty-daemon': {
      const output = run(
        label,
        binaryPath,
        [],
        [
          '{"id":"ping","module":"system","method":"ping"}',
          '{"id":"quit","module":"system","method":"quit"}',
          '',
        ].join('\n'),
        architecture
      );

      if (
        !output.includes('"event":"system:ready"') ||
        !output.includes('"pong":true')
      ) {
        throw new Error(
          `${label} (${architecture}) failed its protocol smoke test: ${binaryPath}`
        );
      }
      return;
    }
    case 'FFmpeg':
      verifyFFmpegRuntime(binaryPath, architecture, run);
      return;
    case 'Whisper': {
      const output = run(
        label,
        binaryPath,
        ['--help'],
        undefined,
        architecture
      );

      if (!output.includes('-dtw') || !output.includes('-ojf')) {
        throw new Error(
          `${label} (${architecture}) failed its feature smoke test: ${binaryPath}`
        );
      }
    }
  }
}

function verifyNativeBinary(
  label,
  binaryPath,
  inspectBinary = execFileSync,
  verifyRuntime = verifyNativeRuntime
) {
  const outputs = ARCHITECTURES.map(architecture =>
    inspectBinary('/usr/bin/otool', ['-L', '-arch', architecture, binaryPath], {
      encoding: 'utf8',
    })
  );
  const unsupportedDependencies = getUnsupportedDependencies(outputs);

  if (unsupportedDependencies.length > 0) {
    throw new Error(
      `${label} links to non-system libraries:\n${unsupportedDependencies
        .map(dependency => `  ${dependency}`)
        .join('\n')}`
    );
  }

  for (const architecture of ARCHITECTURES) {
    verifyRuntime(label, binaryPath, architecture);
  }
}

if (require.main === module) {
  const [, , label, binaryPath] = process.argv;

  if (!label || !binaryPath) {
    process.stderr.write('Usage: verify-native-binary.cjs <label> <path>\n');
    process.exit(1);
  }

  try {
    verifyNativeBinary(label, binaryPath);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  REQUIRED_FFMPEG_FEATURES,
  getMissingFeatures,
  getUnsupportedDependencies,
  parseLinkedDependencies,
  runBinary,
  verifyFFmpegRuntime,
  verifyNativeBinary,
};
