import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { ensureSafeProjectWritePath } from '@/main/editor-v2/project/project-paths';
import { assertSafeAssetId } from '@/main/editor-v2/security/project-path-policy';
import { getFFmpegPath } from '@/main/utils/ffmpeg';

const execFileAsync = promisify(execFile);

export interface WaveformGenerator {
  generate(sourcePath: string): Promise<number[]>;
}

const parsePgm = (buffer: Buffer): number[] => {
  const header = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(
    buffer.subarray(0, 128).toString('ascii')
  );
  if (!header) throw new Error('Waveform generator returned an invalid image');
  const width = Number(header[1]);
  const height = Number(header[2]);
  const maximum = Number(header[3]);
  const offset = header[0].length;
  const pixels = buffer.subarray(offset, offset + width * height);
  if (pixels.length !== width * height || maximum <= 0 || maximum > 255) {
    throw new Error('Waveform generator returned invalid pixels');
  }
  return Array.from({ length: width }, (_, x) => {
    let peak = 0;
    for (let y = 0; y < height; y += 1) {
      peak = Math.max(peak, pixels[y * width + x]);
    }
    return peak / maximum;
  });
};

const defaultGenerator: WaveformGenerator = {
  async generate(sourcePath) {
    const result = await execFileAsync(
      getFFmpegPath(),
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        sourcePath,
        '-filter_complex',
        'showwavespic=s=512x64:colors=white,format=gray',
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'pgm',
        '-',
      ],
      {
        timeout: 30_000,
        encoding: 'buffer',
        maxBuffer: 1024 * 1024,
      }
    );
    return parsePgm(Buffer.from(result.stdout));
  },
};

const readCache = async (filePath: string): Promise<number[] | null> => {
  try {
    const value: unknown = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every(item => typeof item === 'number' && item >= 0 && item <= 1)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
};

export class WaveformService {
  constructor(
    private readonly generator: WaveformGenerator = defaultGenerator
  ) {}

  async ensure(
    packagePath: string,
    assetId: string,
    sourcePath: string,
    force = false
  ): Promise<string> {
    assertSafeAssetId(assetId);
    const relativePath = path.join('cache', 'waveforms', `${assetId}.json`);
    const target = await ensureSafeProjectWritePath(packagePath, relativePath);
    if (!force && (await readCache(target))) return target;

    const temporary = await ensureSafeProjectWritePath(
      packagePath,
      path.join('cache', 'waveforms', `${assetId}.json.tmp`)
    );
    try {
      const peaks = await this.generator.generate(sourcePath);
      if (
        peaks.length === 0 ||
        !peaks.every(
          value => Number.isFinite(value) && value >= 0 && value <= 1
        )
      ) {
        throw new Error('Waveform generation returned invalid peaks');
      }
      await fs.writeFile(temporary, JSON.stringify(peaks), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      await fs.rename(temporary, target);
      return target;
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }
}
