export interface CorrelatedIpcResponse<TResult> {
  requestId: string;
  result: TResult;
}

export function isValidCorrelatedIpcRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export const CORRELATED_IPC_CHANNELS = {
  equalizerAnalyze: {
    request: 'video-editor:equalizer:analyze',
    response: 'video-editor:equalizer:analyze:response',
  },
  mediaGetSize: {
    request: 'video-editor:media:get-size',
    response: 'video-editor:media:get-size:response',
  },
  mediaReadRange: {
    request: 'video-editor:media:read-range',
    response: 'video-editor:media:read-range:response',
  },
} as const;
