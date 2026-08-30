import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import fs from 'fs/promises';

import type { MediaFingerprint } from '@/types/editor-v2';

export const fingerprintMediaFile = async (
  filePath: string
): Promise<MediaFingerprint> => {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) throw new Error('Media source must be a file');
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return {
    byteLength: stats.size,
    sha256: hash.digest('hex'),
    modifiedAt: stats.mtime.toISOString(),
  };
};
