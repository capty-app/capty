import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditorCloseCoordinator } from '@/main/editor-v2/project/close-coordinator';
import type {
  EditorCloseFailureDecision,
  EditorExportCloseDecision,
} from '@/main/editor-v2/project/close-coordinator';
import type { EditorV2FlushRequest } from '@/types/editor-v2';

interface HarnessOptions {
  rendererAvailable?: boolean;
  exportActive?: boolean;
  exportDecision?: EditorExportCloseDecision;
  failureDecisions?: EditorCloseFailureDecision[];
  verified?: boolean;
  exportCancelFailures?: number;
}

const createHarness = (options: HarnessOptions = {}) => {
  const requests: EditorV2FlushRequest[] = [];
  let rendererAvailable = options.rendererAvailable ?? true;
  let exportActive = options.exportActive ?? false;
  const failureDecisions = [...(options.failureDecisions ?? ['cancel'])];
  let requestSequence = 0;
  let exportCancelFailures = options.exportCancelFailures ?? 0;
  const cancelExport = vi.fn(async () => {
    if (exportCancelFailures > 0) {
      exportCancelFailures -= 1;
      throw new Error('export cleanup failed');
    }
    exportActive = false;
  });
  const chooseFailureDecision = vi.fn(
    async () => failureDecisions.shift() ?? 'cancel'
  );
  const onCancelled = vi.fn();
  const coordinator = new EditorCloseCoordinator({
    sendFlush: request => requests.push(request),
    verifyFlush: async () => options.verified ?? true,
    onCancelled,
    isRendererAvailable: () => rendererAvailable,
    isExportActive: () => exportActive,
    chooseExportDecision: async () =>
      options.exportDecision ?? 'cancel-export-and-close',
    cancelExport,
    chooseFailureDecision,
    createRequestId: () => `request-${++requestSequence}`,
    timeoutMs: 100,
  });
  return {
    coordinator,
    requests,
    cancelExport,
    chooseFailureDecision,
    onCancelled,
    setRendererAvailable: (available: boolean) => {
      rendererAvailable = available;
    },
  };
};

const flushResult = (
  requestId: string,
  status: 'flushed' | 'failed' = 'flushed'
) => ({
  requestId,
  status,
  projectRevision: 2,
  workspaceRevision: 3,
  error: status === 'failed' ? 'save rejected' : undefined,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Editor V2 close coordinator', () => {
  it('deduplicates close requests and confirms only a matching flush', async () => {
    const harness = createHarness();
    const first = harness.coordinator.request('close');
    const duplicate = harness.coordinator.request('close');

    expect(first).toBe(duplicate);
    expect(harness.requests).toEqual([{ requestId: 'request-1' }]);
    expect(harness.coordinator.acknowledge(flushResult('wrong'))).toBe(false);
    expect(harness.coordinator.acknowledge(flushResult('request-1'))).toBe(
      true
    );
    await expect(first).resolves.toBe(true);
    expect(harness.coordinator.state).toBe('close-confirmed');
  });

  it('rejects flush acknowledgements not confirmed by main revisions', async () => {
    const harness = createHarness({
      verified: false,
      failureDecisions: ['cancel'],
    });
    const closing = harness.coordinator.request('close');
    harness.coordinator.acknowledge(flushResult('request-1'));

    await expect(closing).resolves.toBe(false);
    expect(harness.chooseFailureDecision).toHaveBeenCalledWith(
      'Saved revisions could not be confirmed',
      true
    );
    expect(harness.onCancelled).toHaveBeenCalledWith('request-1');
  });

  it('retries a rejected save with a fresh request', async () => {
    const harness = createHarness({ failureDecisions: ['retry'] });
    const closing = harness.coordinator.request('close');
    harness.coordinator.acknowledge(flushResult('request-1', 'failed'));
    await vi.waitFor(() => expect(harness.requests).toHaveLength(2));

    expect(harness.requests[1]).toEqual({ requestId: 'request-2' });
    harness.coordinator.acknowledge(flushResult('request-2'));
    await expect(closing).resolves.toBe(true);
  });

  it('allows explicit discard for close but never for switch', async () => {
    const closeHarness = createHarness({ failureDecisions: ['discard'] });
    const closing = closeHarness.coordinator.request('close');
    closeHarness.coordinator.acknowledge(flushResult('request-1', 'failed'));
    await expect(closing).resolves.toBe(true);
    expect(closeHarness.chooseFailureDecision).toHaveBeenCalledWith(
      'save rejected',
      true
    );

    const switchHarness = createHarness({ failureDecisions: ['discard'] });
    const switching = switchHarness.coordinator.request('switch');
    switchHarness.coordinator.acknowledge(flushResult('request-1', 'failed'));
    await expect(switching).resolves.toBe(false);
    expect(switchHarness.chooseFailureDecision).toHaveBeenCalledWith(
      'save rejected',
      false
    );
  });

  it('cancels an active export before requesting a flush', async () => {
    const harness = createHarness({ exportActive: true });
    const closing = harness.coordinator.request('close');
    await vi.waitFor(() => expect(harness.cancelExport).toHaveBeenCalledOnce());
    expect(harness.requests).toEqual([{ requestId: 'request-1' }]);
    harness.coordinator.acknowledge(flushResult('request-1'));
    await expect(closing).resolves.toBe(true);
  });

  it('retries export cancellation before flushing after cleanup failure', async () => {
    const harness = createHarness({
      exportActive: true,
      exportCancelFailures: 1,
      failureDecisions: ['retry'],
    });
    const closing = harness.coordinator.request('close');
    await vi.waitFor(() =>
      expect(harness.cancelExport).toHaveBeenCalledTimes(2)
    );
    expect(harness.requests).toEqual([{ requestId: 'request-1' }]);
    harness.coordinator.acknowledge(flushResult('request-1'));
    await expect(closing).resolves.toBe(true);
  });

  it('keeps the window open when the user keeps exporting', async () => {
    const harness = createHarness({
      exportActive: true,
      exportDecision: 'keep-exporting',
    });
    await expect(harness.coordinator.request('close')).resolves.toBe(false);
    expect(harness.cancelExport).not.toHaveBeenCalled();
    expect(harness.requests).toEqual([]);
    expect(harness.coordinator.state).toBe('open');
  });

  it('routes timeout and renderer crash through Retry or Cancel decisions', async () => {
    vi.useFakeTimers();
    const timeoutHarness = createHarness({ failureDecisions: ['cancel'] });
    const timedOut = timeoutHarness.coordinator.request('close');
    await vi.advanceTimersByTimeAsync(100);
    await expect(timedOut).resolves.toBe(false);
    expect(timeoutHarness.chooseFailureDecision).toHaveBeenCalledWith(
      'Timed out while saving editor changes',
      true
    );

    const crashHarness = createHarness({ failureDecisions: ['cancel'] });
    const crashed = crashHarness.coordinator.request('close');
    crashHarness.coordinator.rendererUnavailable();
    await expect(crashed).resolves.toBe(false);
    expect(crashHarness.chooseFailureDecision).toHaveBeenCalledWith(
      'Editor renderer became unavailable during save',
      true
    );
  });

  it('handles a renderer that is already unavailable', async () => {
    const harness = createHarness({
      rendererAvailable: false,
      failureDecisions: ['cancel'],
    });
    await expect(harness.coordinator.request('reload')).resolves.toBe(false);
    expect(harness.requests).toEqual([]);
    expect(harness.chooseFailureDecision).toHaveBeenCalledWith(
      'Editor renderer is not available',
      true
    );
  });
});
