import { describe, expect, it } from 'vitest';
import { resolveImportResult } from '@/renderer/components/video-editor/utils/import-result';

describe('resolveImportResult', () => {
  it('returns the resolved result without an error on success', async () => {
    const result = { success: true, value: 'imported' };

    await expect(
      resolveImportResult(() => Promise.resolve(result), 'Import failed')
    ).resolves.toEqual({ result, error: null });
  });

  it('returns a resolved operation error', async () => {
    const result = { success: false, error: 'Unsupported file' };

    await expect(
      resolveImportResult(() => Promise.resolve(result), 'Import failed')
    ).resolves.toEqual({ result, error: 'Unsupported file' });
  });

  it('keeps cancellation silent', async () => {
    const result = { success: false, error: 'Cancelled' };

    await expect(
      resolveImportResult(() => Promise.resolve(result), 'Import failed')
    ).resolves.toEqual({ result, error: null });
  });

  it('returns a rejected operation message', async () => {
    await expect(
      resolveImportResult(
        () => Promise.reject(new Error('IPC disconnected')),
        'Import failed'
      )
    ).resolves.toEqual({ result: null, error: 'IPC disconnected' });
  });

  it('uses the fallback for a message-less Error rejection', async () => {
    await expect(
      resolveImportResult(() => Promise.reject(new Error()), 'Import failed')
    ).resolves.toEqual({ result: null, error: 'Import failed' });
  });

  it('uses the fallback for an unknown rejection', async () => {
    await expect(
      resolveImportResult(() => Promise.reject('failed'), 'Import failed')
    ).resolves.toEqual({ result: null, error: 'Import failed' });
  });
});
