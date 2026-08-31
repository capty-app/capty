import type { CorrelatedIpcResponse } from '@/types/ipc';
import { isValidCorrelatedIpcRequestId } from '@/types/ipc';

interface CorrelatedIpcRequestOptions<TPayload extends object> {
  requestChannel: string;
  responseChannel: string;
  payload: TPayload;
  requestId?: string;
  signal?: AbortSignal;
}

function createAbortError(): DOMException {
  return new DOMException('IPC request cancelled', 'AbortError');
}

export function sendCorrelatedIpcRequest<TPayload extends object, TResult>({
  requestChannel,
  responseChannel,
  payload,
  requestId = crypto.randomUUID(),
  signal,
}: CorrelatedIpcRequestOptions<TPayload>): Promise<TResult> {
  if (!isValidCorrelatedIpcRequestId(requestId)) {
    return Promise.reject(new Error('Invalid correlated IPC request ID'));
  }
  if (signal?.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.ipcRenderer.off(responseChannel, handleResponse);
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const handleResponse = (
      _event: Electron.IpcRendererEvent,
      response: unknown
    ) => {
      if (!response || typeof response !== 'object') return;
      const candidate = response as Partial<CorrelatedIpcResponse<TResult>>;
      if (candidate.requestId !== requestId || !('result' in candidate)) return;

      cleanup();
      resolve(candidate.result as TResult);
    };

    window.ipcRenderer.on(responseChannel, handleResponse);
    signal?.addEventListener('abort', handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }

    try {
      window.ipcRenderer.send(requestChannel, { ...payload, requestId });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
