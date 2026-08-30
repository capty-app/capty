import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/renderer/components/ui/button';
import { canShowEditorVersionSwitch } from '../shell/editor-version-switch';
import ThreeDockShell from '../shell/three-dock-shell';
import EditorProvider from '../store/editor-provider';
import { useEditorAutosave } from '../store/use-autosave';
import { useEditorStore } from '../store/use-editor-store';
import type {
  EditorV2LoadPayload,
  EditorV2Workspace,
  EditorVersionSwitchResult,
} from '@/types/editor-v2';

const WORKSPACE_SAVE_DEBOUNCE_MS = 250;

interface EditorV2SessionProps {
  payload: EditorV2LoadPayload;
}

function EditorV2Session({ payload }: EditorV2SessionProps) {
  const store = useEditorStore();
  const { flushProject, resetDiskRevision } = useEditorAutosave(
    payload.projectToken
  );
  const [workspace, setWorkspace] = useState(payload.workspace);
  const [displayName, setDisplayName] = useState(payload.displayName);
  const [displayPath, setDisplayPath] = useState(payload.displayPath);
  const [requiresProjectCreation, setRequiresProjectCreation] = useState(
    payload.requiresProjectCreation
  );
  const [historyNotice, setHistoryNotice] = useState<string | null>(
    payload.mediaRecoveryWarnings.length > 0
      ? payload.mediaRecoveryWarnings.join('\n')
      : null
  );
  const [error, setError] = useState<string | null>(null);
  const workspaceRef = useRef(payload.workspace);
  const workspaceRevisionRef = useRef(payload.workspace.revision);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<number>>(
    Promise.resolve(payload.workspace.revision)
  );
  const workspaceDirtyRef = useRef(false);
  const workspaceFrozenRef = useRef(false);
  const mediaOperationsFrozenRef = useRef(false);
  const mediaOperationCountRef = useRef(0);
  const mediaIdlePromiseRef = useRef(Promise.resolve());
  const mediaIdleResolveRef = useRef<(() => void) | null>(null);
  const [mediaOperationsFrozen, setMediaOperationsFrozen] = useState(false);

  const saveWorkspace = useCallback(async (): Promise<number> => {
    while (workspaceDirtyRef.current) {
      const snapshot = workspaceRef.current;
      workspaceDirtyRef.current = false;
      const result = await window.editorV2.saveWorkspace({
        projectToken: payload.projectToken,
        expectedRevision: workspaceRevisionRef.current,
        workspace: snapshot,
      });
      if (result.status !== 'saved') {
        workspaceDirtyRef.current = true;
        store.acceptSave(
          store.mutationRevision,
          result.status === 'stale'
            ? { status: 'stale', diskRevision: result.diskRevision }
            : { status: 'failed', error: result.error }
        );
        throw new Error(
          result.status === 'failed'
            ? result.error
            : `Workspace changed on disk at revision ${result.diskRevision}`
        );
      }
      workspaceRevisionRef.current = result.revision;
      workspaceRef.current = {
        ...workspaceRef.current,
        revision: result.revision,
      };
      setWorkspace(current => ({ ...current, revision: result.revision }));
    }
    return workspaceRevisionRef.current;
  }, [payload.projectToken, store]);

  const enqueueWorkspaceSave = useCallback((): Promise<number> => {
    saveQueueRef.current = saveQueueRef.current.then(
      saveWorkspace,
      saveWorkspace
    );
    return saveQueueRef.current;
  }, [saveWorkspace]);

  const commitWorkspace = useCallback(() => {
    if (workspaceFrozenRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      enqueueWorkspaceSave().catch(reason => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    }, WORKSPACE_SAVE_DEBOUNCE_MS);
  }, [enqueueWorkspaceSave]);

  const updateWorkspace = useCallback(
    (update: (current: EditorV2Workspace) => EditorV2Workspace) => {
      if (workspaceFrozenRef.current) return;
      const nextWorkspace = update(workspaceRef.current);
      workspaceRef.current = nextWorkspace;
      workspaceDirtyRef.current = true;
      setWorkspace(nextWorkspace);
    },
    []
  );

  const beginMediaOperation = useCallback((): (() => void) | null => {
    if (mediaOperationsFrozenRef.current) return null;
    if (mediaOperationCountRef.current === 0) {
      mediaIdlePromiseRef.current = new Promise<void>(resolve => {
        mediaIdleResolveRef.current = resolve;
      });
    }
    mediaOperationCountRef.current += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      mediaOperationCountRef.current -= 1;
      if (mediaOperationCountRef.current !== 0) return;
      mediaIdleResolveRef.current?.();
      mediaIdleResolveRef.current = null;
    };
  }, []);

  const setMediaFrozen = useCallback((frozen: boolean) => {
    mediaOperationsFrozenRef.current = frozen;
    setMediaOperationsFrozen(frozen);
  }, []);

  useEffect(
    () =>
      window.editorV2.onMutationUnfreeze(() => {
        workspaceFrozenRef.current = false;
        setMediaFrozen(false);
        store.unfreeze();
      }),
    [setMediaFrozen, store]
  );

  useEffect(() => {
    return window.editorV2.onFlushRequest(request => {
      setMediaFrozen(true);
      void mediaIdlePromiseRef.current
        .then(() => {
          workspaceFrozenRef.current = true;
          store.freeze();
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          return Promise.all([flushProject(), enqueueWorkspaceSave()]);
        })
        .then(([projectRevision, workspaceRevision]) => {
          window.editorV2.acknowledgeFlush({
            requestId: request.requestId,
            status: 'flushed',
            projectRevision,
            workspaceRevision,
          });
        })
        .catch(reason => {
          workspaceFrozenRef.current = false;
          setMediaFrozen(false);
          store.unfreeze();
          window.editorV2.acknowledgeFlush({
            requestId: request.requestId,
            status: 'failed',
            projectRevision: store.document.revision,
            workspaceRevision: workspaceRevisionRef.current,
            error: reason instanceof Error ? reason.message : String(reason),
          });
        });
    });
  }, [enqueueWorkspaceSave, flushProject, setMediaFrozen, store]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  const switchVersion = useCallback(async () => {
    const result: EditorVersionSwitchResult =
      await window.editorV2.switchVersion({ targetVersion: 'v1' });
    if (result.status === 'cancelled') {
      workspaceFrozenRef.current = false;
      setMediaFrozen(false);
      store.unfreeze();
      setError(result.error);
    }
  }, [setMediaFrozen, store]);

  const reloadFromDisk = useCallback(async () => {
    workspaceFrozenRef.current = true;
    store.freeze();
    const result = await window.editorV2.reloadProject({
      projectToken: payload.projectToken,
    });
    if (result.status === 'loaded') {
      workspaceRef.current = result.workspace;
      workspaceRevisionRef.current = result.workspace.revision;
      workspaceDirtyRef.current = false;
      setWorkspace(result.workspace);
      store.replaceFromDisk(result.project);
      resetDiskRevision(result.project.revision);
      setHistoryNotice(
        result.mediaRecoveryWarnings.length > 0
          ? result.mediaRecoveryWarnings.join('\n')
          : null
      );
      workspaceFrozenRef.current = false;
      return;
    }
    workspaceFrozenRef.current = false;
    store.unfreeze();
    if (result.status === 'failed') setError(result.error);
  }, [payload.projectToken, resetDiskRevision, store]);

  const saveCopy = useCallback(async () => {
    const result = await window.editorV2.saveProjectCopy({
      projectToken: payload.projectToken,
      project: store.document,
      workspace: workspaceRef.current,
    });
    if (result.status === 'failed') setError(result.error);
  }, [payload.projectToken, store.document]);

  const createProject = useCallback(
    async (policy: 'copy' | 'link') => {
      const finishOperation = beginMediaOperation();
      if (!finishOperation) return;
      workspaceFrozenRef.current = true;
      store.freeze();
      try {
        const result = await window.editorV2.createProject({
          projectToken: payload.projectToken,
          policy,
          workspace: workspaceRef.current,
        });
        if (result.status === 'created') {
          store.replaceFromDisk(result.project);
          resetDiskRevision(result.project.revision);
          setDisplayName(result.displayName);
          setDisplayPath(result.displayPath);
          setRequiresProjectCreation(false);
          workspaceFrozenRef.current = false;
          return;
        }
        workspaceFrozenRef.current = false;
        store.unfreeze();
        if (result.status === 'failed') setError(result.error);
      } catch (reason) {
        workspaceFrozenRef.current = false;
        store.unfreeze();
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        finishOperation();
      }
    },
    [beginMediaOperation, payload.projectToken, resetDiskRevision, store]
  );

  const removeManaged = useCallback(
    async (assetId: string): Promise<void> => {
      const finishOperation = beginMediaOperation();
      if (!finishOperation) throw new Error('Media operations are frozen');
      workspaceFrozenRef.current = true;
      store.freeze();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      try {
        const [projectRevision] = await Promise.all([
          flushProject(),
          enqueueWorkspaceSave(),
        ]);
        const result = await window.editorV2.removeManagedMedia({
          projectToken: payload.projectToken,
          assetId,
          expectedRevision: projectRevision,
        });
        if (result.status === 'removed') {
          store.replaceFromDisk(result.project);
          resetDiskRevision(result.revision);
          workspaceFrozenRef.current = false;
          setHistoryNotice(
            [
              'Managed media was permanently removed. Undo history was cleared.',
              result.cleanupWarning,
            ]
              .filter(Boolean)
              .join('\n')
          );
          return;
        }
        workspaceFrozenRef.current = false;
        store.unfreeze();
        if (result.status === 'cancelled') return;
        if (result.status === 'stale') {
          store.acceptSave(store.mutationRevision, result);
          throw new Error(
            `Project changed on disk at revision ${result.diskRevision}`
          );
        }
        throw new Error(result.error);
      } catch (reason) {
        workspaceFrozenRef.current = false;
        store.unfreeze();
        throw reason;
      } finally {
        finishOperation();
      }
    },
    [
      beginMediaOperation,
      enqueueWorkspaceSave,
      flushProject,
      payload.projectToken,
      resetDiskRevision,
      store,
    ]
  );

  return (
    <>
      <ThreeDockShell
        displayName={displayName}
        displayPath={displayPath}
        projectToken={payload.projectToken}
        project={store.document}
        workspace={workspace}
        canSwitchVersion={canShowEditorVersionSwitch(
          payload.canSwitchEditorVersion
        )}
        onWorkspaceChange={updateWorkspace}
        onWorkspaceCommit={commitWorkspace}
        onRemoveManaged={removeManaged}
        onMediaOperationStart={beginMediaOperation}
        operationsFrozen={mediaOperationsFrozen}
        onSwitchVersion={switchVersion}
      />
      {requiresProjectCreation ? (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            className="bg-card border-border max-w-md rounded-md border p-5 shadow-lg"
          >
            <h2 id="create-project-title" className="text-sm font-medium">
              Create a Capty project to continue
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Editor V2 needs a Capty project before the first edit or media
              import. Copying the source into the project is recommended.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={mediaOperationsFrozen}
                onClick={() => void createProject('link')}
              >
                Link in Place
              </Button>
              <Button
                size="sm"
                disabled={mediaOperationsFrozen}
                onClick={() => void createProject('copy')}
              >
                Create with Copy
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {store.recovery.kind !== 'none' ? (
        <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="editor-recovery-title"
            className="bg-card border-border max-w-md rounded-md border p-5 shadow-lg"
          >
            <h2 id="editor-recovery-title" className="text-sm font-medium">
              Project save needs attention
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {store.recovery.kind === 'stale'
                ? `The project changed on disk at revision ${store.recovery.diskRevision}. Your edits were not overwritten.`
                : store.recovery.error}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setError('Choose reload or save a copy to continue')
                }
              >
                Cancel
              </Button>
              <Button variant="outline" size="sm" onClick={saveCopy}>
                Save a Copy
              </Button>
              <Button size="sm" onClick={reloadFromDisk}>
                Reload from Disk
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {historyNotice ? (
        <button
          type="button"
          className="bg-card border-border fixed bottom-4 left-4 z-50 max-w-sm rounded-md border p-3 text-left text-sm"
          onClick={() => setHistoryNotice(null)}
        >
          {historyNotice}
        </button>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="bg-destructive text-destructive-foreground fixed right-4 bottom-4 z-50 max-w-sm rounded-md p-3 text-sm"
        >
          {error}
        </div>
      ) : null}
    </>
  );
}

export default function EditorV2Window() {
  const [payload, setPayload] = useState<EditorV2LoadPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    return window.editorV2.onLoad(nextPayload => {
      setPayload(nextPayload);
      setLoadError(null);
    });
  }, []);

  useEffect(
    () => window.editorV2.onLoadError(error => setLoadError(error.error)),
    []
  );

  if (loadError) {
    return (
      <div className="bg-background flex h-screen items-center justify-center p-6">
        <div className="border-destructive/40 bg-card max-w-md rounded-md border p-5">
          <p className="text-sm font-medium">Editor V2 could not continue</p>
          <p className="text-muted-foreground mt-2 text-sm">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
        Opening Editor V2…
      </div>
    );
  }

  return (
    <EditorProvider initialDocument={payload.project}>
      <EditorV2Session payload={payload} />
    </EditorProvider>
  );
}
