import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '../..');

describe.runIf(process.platform === 'darwin')(
  'screen recording color configuration',
  () => {
    it('writes a Rec. 709 H.264 frame through the recorder buffer path', () => {
      const outputDirectory = mkdtempSync(
        path.join(tmpdir(), 'capty-color-configuration-')
      );
      const binaryPath = path.join(outputDirectory, 'color-configuration-test');

      try {
        execFileSync('xcrun', [
          'swiftc',
          path.join(
            projectRoot,
            'src/main/daemon/ScreenRecorder/Types/ScreenRecordingColorConfiguration.swift'
          ),
          path.join(
            projectRoot,
            'tests/native/screen-recording-color-configuration.swift'
          ),
          '-o',
          binaryPath,
        ]);

        expect(() => execFileSync(binaryPath)).not.toThrow();
      } finally {
        rmSync(outputDirectory, { recursive: true, force: true });
      }
    });
  }
);
