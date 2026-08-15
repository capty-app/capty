const { execFileSync, spawnSync } = require('node:child_process');

const SYSTEM_LIBRARY_PREFIXES = ['/System/Library/', '/usr/lib/'];
const ARCHITECTURES = ['arm64', 'x86_64'];
const SMOKE_TEST_TIMEOUT = 10000;
const FFMPEG_FEATURES = {
  encoders: [
    'h264_videotoolbox',
    'hevc_videotoolbox',
    'prores_videotoolbox',
    'aac_at',
    'gif',
    'png',
    'mjpeg',
  ],
  decoders: ['h264', 'hevc', 'aac', 'mp3', 'gif', 'png', 'mjpeg', 'prores'],
  muxers: ['mp4', 'mov', 'gif', 'image2', 'mjpeg'],
  demuxers: ['mp4', 'mov', 'gif', 'image2', 'mjpeg'],
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

function runBinary(label, binaryPath, args, input, spawnBinary = spawnSync) {
  const result = spawnBinary(binaryPath, args, {
    encoding: 'utf8',
    input,
    killSignal: 'SIGKILL',
    maxBuffer: 10 * 1024 * 1024,
    timeout: SMOKE_TEST_TIMEOUT,
  });

  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(`${label} smoke test timed out: ${binaryPath}`);
  }

  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const details = result.stderr?.trim();
    throw new Error(details || `${label} exited with status ${result.status}`);
  }

  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function verifyFFmpegRuntime(binaryPath) {
  runBinary('FFmpeg', binaryPath, ['-version']);

  for (const [featureType, requiredFeatures] of Object.entries(
    FFMPEG_FEATURES
  )) {
    const output = runBinary('FFmpeg', binaryPath, [
      '-hide_banner',
      `-${featureType}`,
    ]);
    const missingFeatures = getMissingFeatures(
      output,
      requiredFeatures,
      featureType
    );

    if (missingFeatures.length === 0) continue;

    throw new Error(
      `FFmpeg is missing required ${featureType}: ${missingFeatures.join(', ')}`
    );
  }
}

function verifyNativeRuntime(label, binaryPath) {
  switch (label) {
    case 'capty-daemon': {
      const output = runBinary(
        label,
        binaryPath,
        [],
        [
          '{"id":"ping","module":"system","method":"ping"}',
          '{"id":"quit","module":"system","method":"quit"}',
          '',
        ].join('\n')
      );

      if (
        !output.includes('"event":"system:ready"') ||
        !output.includes('"pong":true')
      ) {
        throw new Error(
          `${label} failed its protocol smoke test: ${binaryPath}`
        );
      }
      return;
    }
    case 'FFmpeg':
      verifyFFmpegRuntime(binaryPath);
      return;
    case 'Whisper': {
      const output = runBinary(label, binaryPath, ['--help']);

      if (!output.includes('-dtw') || !output.includes('-ojf')) {
        throw new Error(
          `${label} failed its feature smoke test: ${binaryPath}`
        );
      }
    }
  }
}

function verifyNativeBinary(label, binaryPath) {
  const outputs = ARCHITECTURES.map(architecture =>
    execFileSync('/usr/bin/otool', ['-L', '-arch', architecture, binaryPath], {
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

  verifyNativeRuntime(label, binaryPath);
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
  getMissingFeatures,
  getUnsupportedDependencies,
  parseLinkedDependencies,
  runBinary,
  verifyNativeBinary,
};
