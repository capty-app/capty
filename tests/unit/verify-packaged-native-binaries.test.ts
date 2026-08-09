import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface PackContext {
  appOutDir: string;
  packager: {
    appInfo: {
      productFilename: string;
    };
  };
}

interface PackagedNativeBinary {
  label: string;
  binaryPath: string;
}

interface VerifyPackagedNativeBinaries {
  (context: PackContext): Promise<void>;
  getPackagedNativeBinaries(context: PackContext): PackagedNativeBinary[];
}

const require = createRequire(import.meta.url);
const verifyPackagedNativeBinaries =
  require('../../scripts/verify-packaged-native-binaries.cjs') as VerifyPackagedNativeBinaries;

const context: PackContext = {
  appOutDir: '/build/mac-universal',
  packager: {
    appInfo: {
      productFilename: 'Capty',
    },
  },
};

describe('verify packaged native binaries', () => {
  it('resolves every binary outside app.asar', () => {
    expect(
      verifyPackagedNativeBinaries.getPackagedNativeBinaries(context)
    ).toEqual([
      {
        label: 'capty-daemon',
        binaryPath:
          '/build/mac-universal/Capty.app/Contents/Resources/daemon/capty-daemon',
      },
      {
        label: 'FFmpeg',
        binaryPath:
          '/build/mac-universal/Capty.app/Contents/Resources/binaries/ffmpeg/ffmpeg',
      },
      {
        label: 'Whisper',
        binaryPath:
          '/build/mac-universal/Capty.app/Contents/Resources/binaries/whisper/whisper',
      },
    ]);
  });

  it('rejects a package that omits native binaries', async () => {
    await expect(verifyPackagedNativeBinaries(context)).rejects.toThrow(
      'Missing capty-daemon'
    );
  });
});
