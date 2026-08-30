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
  const [error, setError] = useState<string | null>(null);
  const workspaceRef = useRef(payload.workspace);
  const workspaceRevisionRef = useRef(payload.workspace.revision);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<number>>(
    Promise.resolve(payload.workspace.revision)
  );
  const workspaceDirtyRef = useRef(false);
  const workspaceFrozenRef = useRef(false);

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

  useEffect(
    () =>
      window.editorV2.onMutationUnfreeze(() => {
        workspaceFrozenRef.current = false;
        store.unfreeze();
      }),
    [store]
  );

  useEffect(() => {
    return window.editorV2.onFlushRequest(request => {
      workspaceFrozenRef.current = true;
      store.freeze();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      Promise.all([flushProject(), enqueueWorkspaceSave()])
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
  }, [enqueueWorkspaceSave, flushProject, store]);

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
      store.unfreeze();
      setError(result.error);
    }
  }, [store]);

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

  return (
    <>
      <ThreeDockShell
        displayName={payload.displayName}
        displayPath={payload.displayPath}
        project={store.document}
        workspace={workspace}
        canSwitchVersion={canShowEditorVersionSwitch(
          payload.canSwitchEditorVersion
        )}
        onWorkspaceChange={updateWorkspace}
        onWorkspaceCommit={commitWorkspace}
        onSwitchVersion={switchVersion}
      />
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
