import type { StreamTargetChunk } from 'mediabunny';

import {
  EDITOR_EXPORT_CHUNK_SIZE,
  type EditorExportChunk,
} from '@/types/editor-v2';

interface ExportChunkStreamOptions {
  jobId: string;
  write: (chunk: EditorExportChunk) => Promise<void>;
  createChunkId?: () => string;
}

export const createExportChunkStream = ({
  jobId,
  write,
  createChunkId = () => crypto.randomUUID(),
}: ExportChunkStreamOptions): WritableStream<StreamTargetChunk> =>
  new WritableStream<StreamTargetChunk>({
    async write(chunk) {
      if (chunk.type !== 'write') throw new Error('Unsupported export chunk');
      if (chunk.position < 0 || !Number.isSafeInteger(chunk.position)) {
        throw new Error('Export chunk position is invalid');
      }
      if (chunk.data.byteLength > EDITOR_EXPORT_CHUNK_SIZE) {
        throw new Error('Export chunk exceeds the bounded transfer size');
      }
      await write({
        jobId,
        chunkId: createChunkId(),
        position: chunk.position,
        data: chunk.data,
      });
    },
  });
