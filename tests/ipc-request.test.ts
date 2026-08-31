import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendCorrelatedIpcRequest } from '@/renderer/utils/ipc-request';

const listeners = new Map<string, (...args: unknown[]) => void>();
const on = vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
  listeners.set(channel, listener);
});
const off = vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
  if (listeners.get(channel) === listener) listeners.delete(channel);
});
const send = vi.fn();

describe('sendCorrelatedIpcRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    vi.stubGlobal('window', {
      ipcRenderer: { on, off, send },
    });
  });

  it('resolves only the matching response and removes its listener', async () => {
    const request = sendCorrelatedIpcRequest<{ source: string }, number>({
      requestChannel: 'request',
      responseChannel: 'response',
      payload: { source: 'video' },
      requestId: 'matching-request',
    });
    const listener = listeners.get('response');

    listener?.({}, { requestId: 'different-request', result: 1 });
    expect(off).not.toHaveBeenCalled();
    listener?.({}, { requestId: 'matching-request', result: 2 });

    await expect(request).resolves.toBe(2);
    expect(send).toHaveBeenCalledWith('request', {
      source: 'video',
      requestId: 'matching-request',
    });
    expect(off).toHaveBeenCalledWith('response', listener);
  });

  it('rejects on abort and removes its listener', async () => {
    const controller = new AbortController();
    const request = sendCorrelatedIpcRequest<Record<string, never>, number>({
      requestChannel: 'request',
      responseChannel: 'response',
      payload: {},
      requestId: 'aborted-request',
      signal: controller.signal,
    });
    const listener = listeners.get('response');

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(off).toHaveBeenCalledWith('response', listener);
  });

  it('rejects an invalid request id before registering a listener', async () => {
    const request = sendCorrelatedIpcRequest<Record<string, never>, number>({
      requestChannel: 'request',
      responseChannel: 'response',
      payload: {},
      requestId: '',
    });

    await expect(request).rejects.toThrow('Invalid correlated IPC request ID');
    expect(on).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
