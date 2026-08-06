import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  collectPackageNotices,
  generateLicenseNotices,
  LICENSE_NOTICES_PATH,
} from '../../scripts/license-notices';

describe('license notices', () => {
  it('covers the shipped native components and direct runtime packages', () => {
    const notices = generateLicenseNotices();
    const packageIdentifiers = collectPackageNotices().map(
      notice => notice.identifier
    );

    expect(notices).toContain('FFmpeg 7.1');
    expect(notices).toContain('whisper.cpp v1.8.3');
    expect(notices).toContain('OpenAI Whisper model weights');
    expect(packageIdentifiers).toContain('electron@39.8.10');
    expect(packageIdentifiers).toContain('mediabunny@1.52.3');
    expect(packageIdentifiers).toContain('react@18.3.1');
  });

  it('matches the checked-in notice file', () => {
    expect(fs.readFileSync(LICENSE_NOTICES_PATH, 'utf8')).toBe(
      generateLicenseNotices()
    );
  });
});
