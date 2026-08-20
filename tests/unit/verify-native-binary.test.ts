import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

type FeatureType =
  | 'encoders'
  | 'decoders'
  | 'muxers'
  | 'demuxers'
  | 'devices'
  | 'protocols'
  | 'filters';

type RequiredFFmpegFeatures = Record<FeatureType, string[]>;

type RunBinary = (
  label: string,
  binaryPath: string,
  args: string[],
  input: string | undefined,
  architecture: string
) => string;

interface SpawnResult {
  error?: Error & { code?: string };
  status?: number | null;
  stdout?: string;
  stderr?: string;
}

interface NativeBinaryVerifier {
  REQUIRED_FFMPEG_FEATURES: RequiredFFmpegFeatures;
  getMissingFeatures(
    output: string,
    requiredFeatures: string[],
    featureType: string
  ): string[];
  getUnsupportedDependencies(outputs: string[]): string[];
  parseLinkedDependencies(output: string): string[];
  runBinary(
    label: string,
    binaryPath: string,
    args: string[],
    input: string | undefined,
    architecture: string,
    spawnBinary: (
      command: string,
      args: string[],
      options: Record<string, unknown>
    ) => SpawnResult
  ): string;
  verifyFFmpegRuntime(
    binaryPath: string,
    architecture: string,
    runBinary: RunBinary
  ): void;
  verifyNativeBinary(
    label: string,
    binaryPath: string,
    inspectBinary: (
      command: string,
      args: string[],
      options: Record<string, unknown>
    ) => string,
    verifyRuntime: (
      label: string,
      binaryPath: string,
      architecture: string
    ) => void
  ): void;
}

const require = createRequire(import.meta.url);
const verifier =
  require('../../scripts/verify-native-binary.cjs') as NativeBinaryVerifier;

const systemDependencies = `binary (architecture arm64):
\t/System/Library/Frameworks/CoreMedia.framework/Versions/A/CoreMedia (compatibility version 1.0.0, current version 1.0.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1356.0.0)
`;

const productionFFmpegRequirements: Array<[FeatureType, string]> = [
  ['encoders', 'aac'],
  ['encoders', 'pcm_s16le'],
  ['decoders', 'opus'],
  ['decoders', 'pcm_s16le'],
  ['decoders', 'vorbis'],
  ['muxers', 'adts'],
  ['muxers', 'ipod'],
  ['muxers', 'null'],
  ['muxers', 'wav'],
  ['demuxers', 'aac'],
  ['demuxers', 'concat'],
  ['demuxers', 'mp3'],
  ['demuxers', 'ogg'],
  ['demuxers', 'wav'],
  ['devices', 'lavfi'],
  ['protocols', 'file'],
  ['filters', 'adelay'],
  ['filters', 'amix'],
  ['filters', 'anullsrc'],
  ['filters', 'atempo'],
  ['filters', 'volume'],
];

function createFFmpegFeatureOutput(
  featureType: FeatureType,
  missingFeature: string | null
): string {
  return verifier.REQUIRED_FFMPEG_FEATURES[featureType]
    .filter(feature => feature !== missingFeature)
    .map(feature =>
      featureType === 'protocols' ? `  ${feature}` : ` E ${feature} Description`
    )
    .join('\n');
}

describe('native binary verification', () => {
  it('parses linked libraries from otool output', () => {
    expect(verifier.parseLinkedDependencies(systemDependencies)).toEqual([
      '/System/Library/Frameworks/CoreMedia.framework/Versions/A/CoreMedia',
      '/usr/lib/libSystem.B.dylib',
    ]);
  });

  it('accepts macOS system libraries', () => {
    expect(verifier.getUnsupportedDependencies([systemDependencies])).toEqual(
      []
    );
  });

  it('rejects libraries inherited from the build machine', () => {
    const runnerDependencies = `${systemDependencies}\t/opt/homebrew/opt/libxcb/lib/libxcb.1.dylib (compatibility version 3.0.0, current version 3.0.0)\n`;

    expect(
      verifier.getUnsupportedDependencies([
        runnerDependencies,
        runnerDependencies,
      ])
    ).toEqual(['/opt/homebrew/opt/libxcb/lib/libxcb.1.dylib']);
  });

  it('rejects unresolved relative library references', () => {
    const relativeDependency = `${systemDependencies}\t@rpath/libexample.dylib (compatibility version 1.0.0, current version 1.0.0)\n`;

    expect(verifier.getUnsupportedDependencies([relativeDependency])).toEqual([
      '@rpath/libexample.dylib',
    ]);
  });

  it('detects missing FFmpeg features and comma-separated aliases', () => {
    const output = ` D mov,mp4,m4a QuickTime / MOV\n V png PNG image`;

    expect(
      verifier.getMissingFeatures(
        output,
        ['mov', 'mp4', 'png', 'mjpeg'],
        'demuxers'
      )
    ).toEqual(['mjpeg']);
  });

  it('does not treat protocol headings as available protocols', () => {
    const output = `Supported file protocols:\nInput:\n  pipe`;

    expect(
      verifier.getMissingFeatures(output, ['file', 'pipe'], 'protocols')
    ).toEqual(['file']);
  });

  it('does not treat feature descriptions as feature names', () => {
    const output = ` E image2pipe      piped image2 sequence`;

    expect(verifier.getMissingFeatures(output, ['image2'], 'muxers')).toEqual([
      'image2',
    ]);
  });

  it('executes a binary through an explicit architecture selector', () => {
    const spawnBinary = vi.fn(() => ({
      status: 0,
      stdout: 'ok',
      stderr: '',
    }));

    expect(
      verifier.runBinary(
        'FFmpeg',
        '/native/ffmpeg',
        ['-version'],
        undefined,
        'x86_64',
        spawnBinary
      )
    ).toContain('ok');
    expect(spawnBinary).toHaveBeenCalledWith(
      '/usr/bin/arch',
      ['-x86_64', '/native/ffmpeg', '-version'],
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it('verifies runtime behavior for both architecture slices', () => {
    const inspectBinary = vi.fn(() => systemDependencies);
    const verifyRuntime = vi.fn();

    verifier.verifyNativeBinary(
      'FFmpeg',
      '/native/ffmpeg',
      inspectBinary,
      verifyRuntime
    );

    expect(inspectBinary.mock.calls.map(([, args]) => args)).toEqual([
      ['-L', '-arch', 'arm64', '/native/ffmpeg'],
      ['-L', '-arch', 'x86_64', '/native/ffmpeg'],
    ]);
    expect(verifyRuntime.mock.calls).toEqual([
      ['FFmpeg', '/native/ffmpeg', 'arm64'],
      ['FFmpeg', '/native/ffmpeg', 'x86_64'],
    ]);
  });

  it.each(productionFFmpegRequirements)(
    'rejects FFmpeg without required %s feature %s',
    (missingFeatureType, missingFeature) => {
      const runBinary = vi.fn<RunBinary>(
        (_label, _binaryPath, args, _input, _architecture) => {
          if (args[0] === '-version') return '';

          const featureType = args[1].slice(1) as FeatureType;
          const omittedFeature =
            featureType === missingFeatureType ? missingFeature : null;
          return createFFmpegFeatureOutput(featureType, omittedFeature);
        }
      );

      expect(() =>
        verifier.verifyFFmpegRuntime('/native/ffmpeg', 'arm64', runBinary)
      ).toThrow(
        `FFmpeg (arm64) is missing required ${missingFeatureType}: ${missingFeature}`
      );
    }
  );

  it('fails a smoke test that exceeds its timeout', () => {
    const timeoutError = Object.assign(new Error('timed out'), {
      code: 'ETIMEDOUT',
    });

    expect(() =>
      verifier.runBinary(
        'FFmpeg',
        '/native/ffmpeg',
        ['-version'],
        undefined,
        'arm64',
        () => ({
          error: timeoutError,
        })
      )
    ).toThrow('FFmpeg (arm64) smoke test timed out: /native/ffmpeg');
  });
});
