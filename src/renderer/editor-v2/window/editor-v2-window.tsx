import React, { useCallback, useEffect, useRef, useState } from 'react';

import { canShowEditorVersionSwitch } from '../shell/editor-version-switch';
import ThreeDockShell from '../shell/three-dock-shell';
import type {
  EditorV2LoadPayload,
  EditorV2Workspace,
  EditorVersionSwitchResult,
} from '@/types/editor-v2';

const WORKSPACE_SAVE_DEBOUNCE_MS = 250;

export default function EditorV2Window() {
  const [payload, setPayload] = useState<EditorV2LoadPayload | null>(null);
  const [workspace, setWorkspace] = useState<EditorV2Workspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const workspaceRef = useRef<EditorV2Workspace | null>(null);
  const workspaceRevisionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dirtyRef = useRef(false);

  const saveWorkspace = useCallback(async (): Promise<void> => {
    if (!payload) return;

    while (workspaceRef.current && dirtyRef.current) {
      const snapshot = workspaceRef.current;
      dirtyRef.current = false;
      const result = await window.editorV2.saveWorkspace({
        projectToken: payload.projectToken,
        expectedRevision: workspaceRevisionRef.current,
        workspace: snapshot,
      });
      if (result.status !== 'saved') {
        dirtyRef.current = true;
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
      setWorkspace(current =>
        current ? { ...current, revision: result.revision } : current
      );
    }
  }, [payload]);

  const enqueueWorkspaceSave = useCallback((): Promise<void> => {
    saveQueueRef.current = saveQueueRef.current.then(
      saveWorkspace,
      saveWorkspace
    );
    return saveQueueRef.current;
  }, [saveWorkspace]);

  const commitWorkspace = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      enqueueWorkspaceSave().catch(error => {
        setLoadError(error instanceof Error ? error.message : String(error));
      });
    }, WORKSPACE_SAVE_DEBOUNCE_MS);
  }, [enqueueWorkspaceSave]);

  const updateWorkspace = useCallback(
    (update: (workspace: EditorV2Workspace) => EditorV2Workspace) => {
      const current = workspaceRef.current;
      if (!current) return;
      const nextWorkspace = update(current);
      workspaceRef.current = nextWorkspace;
      dirtyRef.current = true;
      setWorkspace(nextWorkspace);
    },
    []
  );

  useEffect(() => {
    return window.editorV2.onLoad(nextPayload => {
      workspaceRevisionRef.current = nextPayload.workspace.revision;
      workspaceRef.current = nextPayload.workspace;
      dirtyRef.current = false;
      setWorkspace(nextPayload.workspace);
      setPayload(nextPayload);
      setLoadError(null);
    });
  }, []);

  useEffect(
    () => window.editorV2.onLoadError(error => setLoadError(error.error)),
    []
  );

  useEffect(() => {
    return window.editorV2.onFlushRequest(request => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      enqueueWorkspaceSave()
        .then(() => {
          window.editorV2.acknowledgeFlush({
            requestId: request.requestId,
            status: 'flushed',
            projectRevision: payload?.project.revision ?? 0,
            workspaceRevision: workspaceRevisionRef.current,
          });
        })
        .catch(error => {
          window.editorV2.acknowledgeFlush({
            requestId: request.requestId,
            status: 'failed',
            projectRevision: payload?.project.revision ?? 0,
            workspaceRevision: workspaceRevisionRef.current,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    });
  }, [enqueueWorkspaceSave, payload?.project.revision]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  const switchVersion = useCallback(async () => {
    const result: EditorVersionSwitchResult =
      await window.editorV2.switchVersion({
        targetVersion: 'v1',
      });
    if (result.status === 'cancelled') setLoadError(result.error);
  }, []);

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

  if (!payload || !workspace) {
    return (
      <div className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
        Opening Editor V2…
      </div>
    );
  }

  return (
    <ThreeDockShell
      displayName={payload.displayName}
      displayPath={payload.displayPath}
      project={payload.project}
      workspace={workspace}
      canSwitchVersion={canShowEditorVersionSwitch(
        payload.canSwitchEditorVersion
      )}
      onWorkspaceChange={updateWorkspace}
      onWorkspaceCommit={commitWorkspace}
      onSwitchVersion={switchVersion}
    />
  );
}
