import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface NativeBinaryVerifier {
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
    spawnBinary: () => { error?: Error & { code?: string } }
  ): string;
}

const require = createRequire(import.meta.url);
const verifier =
  require('../../scripts/verify-native-binary.cjs') as NativeBinaryVerifier;

const systemDependencies = `binary (architecture arm64):
\t/System/Library/Frameworks/CoreMedia.framework/Versions/A/CoreMedia (compatibility version 1.0.0, current version 1.0.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1356.0.0)
`;

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
        () => ({
          error: timeoutError,
        })
      )
    ).toThrow('FFmpeg smoke test timed out: /native/ffmpeg');
  });
});
