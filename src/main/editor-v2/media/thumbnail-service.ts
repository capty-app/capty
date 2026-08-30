import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { ensureSafeProjectWritePath } from '@/main/editor-v2/project/project-paths';
import { assertSafeAssetId } from '@/main/editor-v2/security/project-path-policy';
import { getFFmpegPath } from '@/main/utils/ffmpeg';

const execFileAsync = promisify(execFile);

export interface ThumbnailGenerator {
  generate(sourcePath: string, outputPath: string): Promise<void>;
}

const defaultGenerator: ThumbnailGenerator = {
  async generate(sourcePath, outputPath) {
    await execFileAsync(
      getFFmpegPath(),
      [
        '-nostdin',
        '-v',
        'error',
        '-y',
        '-i',
        sourcePath,
        '-frames:v',
        '1',
        '-vf',
        'scale=640:360:force_original_aspect_ratio=decrease',
        '-q:v',
        '3',
        outputPath,
      ],
      { timeout: 20_000, maxBuffer: 2 * 1024 * 1024 }
    );
  },
};

const isUsableCache = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
};

export class ThumbnailService {
  constructor(
    private readonly generator: ThumbnailGenerator = defaultGenerator
  ) {}

  async ensure(
    packagePath: string,
    assetId: string,
    sourcePath: string,
    force = false
  ): Promise<string> {
    assertSafeAssetId(assetId);
    const relativePath = path.join('cache', 'thumbnails', `${assetId}.jpg`);
    const target = await ensureSafeProjectWritePath(packagePath, relativePath);
    if (!force && (await isUsableCache(target))) return target;

    const temporary = await ensureSafeProjectWritePath(
      packagePath,
      path.join('cache', 'thumbnails', `${assetId}.tmp.jpg`)
    );
    await fs.rm(temporary, { force: true });
    try {
      await this.generator.generate(sourcePath, temporary);
      if (!(await isUsableCache(temporary))) {
        throw new Error('Thumbnail generation produced no image');
      }
      await fs.rename(temporary, target);
      return target;
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
  }
}
