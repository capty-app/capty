import { useCallback, useEffect, useRef } from 'react';

import { useEditorStore } from './use-editor-store';

const PROJECT_SAVE_DEBOUNCE_MS = 300;

export const useEditorAutosave = (projectToken: string) => {
  const store = useEditorStore();
  const getSnapshot = store.getSnapshot;
  const persistedMutationRevisionRef = useRef(store.persistedMutationRevision);
  const diskRevisionRef = useRef(store.document.revision);
  const acceptSaveRef = useRef(store.acceptSave);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  persistedMutationRevisionRef.current = Math.max(
    persistedMutationRevisionRef.current,
    store.persistedMutationRevision
  );
  acceptSaveRef.current = store.acceptSave;

  const drain = useCallback(async (): Promise<void> => {
    let snapshot = getSnapshot();
    while (persistedMutationRevisionRef.current < snapshot.mutationRevision) {
      const snapshotMutationRevision = snapshot.mutationRevision;
      const result = await window.editorV2.saveProject({
        projectToken,
        expectedRevision: diskRevisionRef.current,
        project: snapshot.document,
      });
      acceptSaveRef.current(snapshotMutationRevision, result);
      if (result.status === 'stale') {
        throw new Error(
          `Project changed on disk at revision ${result.diskRevision}`
        );
      }
      if (result.status === 'failed') throw new Error(result.error);
      diskRevisionRef.current = result.revision;
      persistedMutationRevisionRef.current = snapshotMutationRevision;
      snapshot = getSnapshot();
    }
  }, [getSnapshot, projectToken]);

  const enqueue = useCallback((): Promise<void> => {
    saveQueueRef.current = saveQueueRef.current.then(drain, drain);
    return saveQueueRef.current;
  }, [drain]);

  const flushProject = useCallback(async (): Promise<number> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await enqueue();
    return diskRevisionRef.current;
  }, [enqueue]);

  const resetDiskRevision = useCallback(
    (revision: number): void => {
      diskRevisionRef.current = revision;
      persistedMutationRevisionRef.current = getSnapshot().mutationRevision;
    },
    [getSnapshot]
  );

  useEffect(() => {
    if (
      store.frozen ||
      store.recovery.kind !== 'none' ||
      store.mutationRevision <= store.persistedMutationRevision
    ) {
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      enqueue().catch(() => undefined);
    }, PROJECT_SAVE_DEBOUNCE_MS);
    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [
    enqueue,
    store.frozen,
    store.mutationRevision,
    store.persistedMutationRevision,
    store.recovery.kind,
  ]);

  return { flushProject, resetDiskRevision };
};
