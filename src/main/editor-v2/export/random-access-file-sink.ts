import fs from 'fs/promises';

export interface RandomAccessFileHandle {
  write(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number
  ): Promise<{ bytesWritten: number }>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export class RandomAccessFileSink {
  private handle: RandomAccessFileHandle | null = null;
  private queue = Promise.resolve();
  private closed = false;

  constructor(
    private readonly filePath: string,
    private readonly openFile: (
      filePath: string
    ) => Promise<RandomAccessFileHandle> = async target => fs.open(target, 'w+')
  ) {}

  write(data: Uint8Array, position: number): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Export sink is closed'));
    if (position < 0 || !Number.isSafeInteger(position)) {
      return Promise.reject(new Error('Export chunk position is invalid'));
    }
    const bytes = data.slice();
    const operation = this.queue.then(async () => {
      this.handle ??= await this.openFile(this.filePath);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const result = await this.handle.write(
          bytes,
          offset,
          bytes.byteLength - offset,
          position + offset
        );
        if (result.bytesWritten <= 0) throw new Error('Export write stalled');
        offset += result.bytesWritten;
      }
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.queue;
    if (!this.handle) return;
    await this.handle.sync();
    await this.handle.close();
    this.handle = null;
  }
}
