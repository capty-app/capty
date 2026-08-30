import crypto from 'crypto';

import type {
  EditorV2FlushRequest,
  EditorV2FlushResult,
} from '@/types/editor-v2';

export type EditorCloseState =
  'open' | 'flush-requested' | 'awaiting-decision' | 'close-confirmed';
export type EditorCloseAction = 'close' | 'reload' | 'switch';
export type EditorCloseFailureDecision = 'retry' | 'discard' | 'cancel';
export type EditorExportCloseDecision =
  'cancel-export-and-close' | 'keep-exporting';

export interface EditorCloseCoordinatorDependencies {
  sendFlush: (request: EditorV2FlushRequest) => void;
  verifyFlush: (result: EditorV2FlushResult) => Promise<boolean>;
  onCancelled: (requestId: string | null) => void;
  isRendererAvailable: () => boolean;
  isExportActive: () => boolean;
  chooseExportDecision: () => Promise<EditorExportCloseDecision>;
  cancelExport: () => Promise<void>;
  chooseFailureDecision: (
    error: string,
    allowDiscard: boolean
  ) => Promise<EditorCloseFailureDecision>;
  createRequestId?: () => string;
  timeoutMs?: number;
}

interface PendingClose {
  action: EditorCloseAction;
  allowDiscard: boolean;
  promise: Promise<boolean>;
  resolve: (confirmed: boolean) => void;
}

export class EditorCloseCoordinator {
  private currentState: EditorCloseState = 'open';
  private requestId: string | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingClose | null = null;

  constructor(
    private readonly dependencies: EditorCloseCoordinatorDependencies
  ) {}

  get state(): EditorCloseState {
    return this.currentState;
  }

  get activeRequestId(): string | null {
    return this.requestId;
  }

  request(action: EditorCloseAction): Promise<boolean> {
    if (this.currentState === 'close-confirmed') return Promise.resolve(true);
    if (this.pending) {
      return this.pending.action === action
        ? this.pending.promise
        : Promise.resolve(false);
    }

    let resolve!: (confirmed: boolean) => void;
    const promise = new Promise<boolean>(next => {
      resolve = next;
    });
    this.pending = {
      action,
      allowDiscard: action !== 'switch',
      promise,
      resolve,
    };
    void this.begin();
    return promise;
  }

  acknowledge(result: EditorV2FlushResult): boolean {
    if (
      this.currentState !== 'flush-requested' ||
      !this.requestId ||
      result.requestId !== this.requestId
    ) {
      return false;
    }
    this.clearTimeout();
    if (result.status === 'flushed') {
      const pendingRequestId = this.requestId;
      void this.dependencies.verifyFlush(result).then(
        verified => {
          if (
            this.currentState !== 'flush-requested' ||
            this.requestId !== pendingRequestId
          ) {
            return;
          }
          if (verified) {
            this.confirm();
            return;
          }
          void this.handleFailure('Saved revisions could not be confirmed');
        },
        error => {
          void this.handleFailure(
            error instanceof Error ? error.message : String(error)
          );
        }
      );
      return true;
    }
    void this.handleFailure(
      result.error ?? 'Editor changes could not be saved'
    );
    return true;
  }

  rendererUnavailable(): void {
    if (this.currentState !== 'flush-requested') return;
    this.clearTimeout();
    void this.handleFailure('Editor renderer became unavailable during save');
  }

  reset(): void {
    this.clearTimeout();
    this.currentState = 'open';
    this.requestId = null;
    this.pending = null;
  }

  private async begin(): Promise<void> {
    if (!this.pending) return;
    if (this.dependencies.isExportActive()) {
      const decision = await this.dependencies.chooseExportDecision();
      if (decision === 'keep-exporting') {
        this.cancel();
        return;
      }
      try {
        await this.dependencies.cancelExport();
      } catch (error) {
        if (this.pending) this.pending.allowDiscard = false;
        await this.handleFailure(
          error instanceof Error ? error.message : String(error)
        );
        return;
      }
    }
    this.issueFlush();
  }

  private issueFlush(): void {
    if (!this.pending) return;
    if (!this.dependencies.isRendererAvailable()) {
      void this.handleFailure('Editor renderer is not available');
      return;
    }
    this.currentState = 'flush-requested';
    this.requestId =
      this.dependencies.createRequestId?.() ?? crypto.randomUUID();
    this.dependencies.sendFlush({ requestId: this.requestId });
    this.timeout = setTimeout(() => {
      this.timeout = null;
      void this.handleFailure('Timed out while saving editor changes');
    }, this.dependencies.timeoutMs ?? 15_000);
  }

  private async handleFailure(error: string): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    this.currentState = 'awaiting-decision';
    const decision = await this.dependencies.chooseFailureDecision(
      error,
      pending.allowDiscard
    );
    if (this.pending !== pending) return;
    if (decision === 'retry') {
      void this.begin();
      return;
    }
    if (decision === 'discard' && pending.allowDiscard) {
      this.confirm();
      return;
    }
    this.cancel();
  }

  private confirm(): void {
    const pending = this.pending;
    if (!pending) return;
    this.clearTimeout();
    this.currentState = 'close-confirmed';
    this.requestId = null;
    this.pending = null;
    pending.resolve(true);
  }

  private cancel(): void {
    const pending = this.pending;
    if (!pending) return;
    this.clearTimeout();
    const requestId = this.requestId;
    this.currentState = 'open';
    this.requestId = null;
    this.pending = null;
    this.dependencies.onCancelled(requestId);
    pending.resolve(false);
  }

  private clearTimeout(): void {
    if (!this.timeout) return;
    clearTimeout(this.timeout);
    this.timeout = null;
  }
}
