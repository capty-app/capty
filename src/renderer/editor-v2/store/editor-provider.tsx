import React, { useCallback, useMemo, useReducer, useRef } from 'react';

import { EditorCommandHistory } from '@/editor-v2/commands/history';
import { reconcileEditorSelection } from '@/editor-v2/commands/selection-reconciliation';
import { EditorCommandTransaction } from '@/editor-v2/commands/transaction';
import { EditorStoreContext, type EditorRecoveryState } from './editor-context';
import type {
  EditorCommand,
  EditorCommandExecution,
} from '@/editor-v2/commands/command';
import type {
  EditorProjectV2,
  EditorSelection,
  EditorV2SaveResult,
} from '@/types/editor-v2';

interface EditorState {
  document: EditorProjectV2;
  selection: EditorSelection;
  mutationRevision: number;
  persistedMutationRevision: number;
  frozen: boolean;
  recovery: EditorRecoveryState;
  canUndo: boolean;
  canRedo: boolean;
}

type EditorAction =
  | {
      type: 'apply';
      execution: EditorCommandExecution;
      canUndo: boolean;
      canRedo: boolean;
    }
  | { type: 'preview'; document: EditorProjectV2 }
  | { type: 'selection'; selection: EditorSelection }
  | { type: 'freeze'; frozen: boolean }
  | {
      type: 'save-result';
      mutationRevision: number;
      result: EditorV2SaveResult;
    }
  | { type: 'replace'; document: EditorProjectV2 }
  | { type: 'clear-recovery' };

const reducer = (state: EditorState, action: EditorAction): EditorState => {
  switch (action.type) {
    case 'apply':
      return {
        ...state,
        document: action.execution.document,
        selection: reconcileEditorSelection(
          action.execution.document,
          state.selection
        ),
        mutationRevision: state.mutationRevision + 1,
        canUndo: action.canUndo,
        canRedo: action.canRedo,
      };
    case 'preview':
      return {
        ...state,
        document: action.document,
        selection: reconcileEditorSelection(action.document, state.selection),
      };
    case 'selection':
      return {
        ...state,
        selection: reconcileEditorSelection(state.document, action.selection),
      };
    case 'freeze':
      return { ...state, frozen: action.frozen };
    case 'save-result':
      if (action.result.status === 'saved') {
        return {
          ...state,
          document: { ...state.document, revision: action.result.revision },
          persistedMutationRevision: Math.max(
            state.persistedMutationRevision,
            action.mutationRevision
          ),
          recovery: { kind: 'none' },
        };
      }
      return {
        ...state,
        recovery:
          action.result.status === 'stale'
            ? { kind: 'stale', diskRevision: action.result.diskRevision }
            : { kind: 'save-failed', error: action.result.error },
      };
    case 'replace':
      return {
        document: action.document,
        selection: { kind: 'none' },
        mutationRevision: 0,
        persistedMutationRevision: 0,
        frozen: false,
        recovery: { kind: 'none' },
        canUndo: false,
        canRedo: false,
      };
    case 'clear-recovery':
      return { ...state, recovery: { kind: 'none' } };
  }
};

interface EditorProviderProps {
  initialDocument: EditorProjectV2;
  children: React.ReactNode;
}

export default function EditorProvider({
  initialDocument,
  children,
}: EditorProviderProps) {
  const historyRef = useRef(new EditorCommandHistory());
  const transactionRef = useRef<EditorCommandTransaction | null>(null);
  const [state, dispatch] = useReducer(reducer, {
    document: initialDocument,
    selection: { kind: 'none' },
    mutationRevision: 0,
    persistedMutationRevision: 0,
    frozen: false,
    recovery: { kind: 'none' },
    canUndo: false,
    canRedo: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const getSnapshot = useCallback(
    () => ({
      document: stateRef.current.document,
      mutationRevision: stateRef.current.mutationRevision,
      persistedMutationRevision: stateRef.current.persistedMutationRevision,
    }),
    []
  );

  const dispatchAndTrack = useCallback((action: EditorAction): void => {
    stateRef.current = reducer(stateRef.current, action);
    dispatch(action);
  }, []);

  const applyExecution = useCallback(
    (execution: EditorCommandExecution) => {
      dispatchAndTrack({
        type: 'apply',
        execution,
        canUndo: historyRef.current.canUndo,
        canRedo: historyRef.current.canRedo,
      });
    },
    [dispatchAndTrack]
  );

  const execute = useCallback(
    (command: EditorCommand): boolean => {
      if (stateRef.current.frozen || transactionRef.current) return false;
      try {
        const execution = historyRef.current.execute(
          stateRef.current.document,
          command
        );
        applyExecution(execution);
        return true;
      } catch {
        return false;
      }
    },
    [applyExecution]
  );

  const executeWithoutHistory = useCallback(
    (command: EditorCommand): boolean => {
      if (stateRef.current.frozen || transactionRef.current) return false;
      try {
        const execution = historyRef.current.executeWithoutHistory(
          stateRef.current.document,
          command
        );
        applyExecution(execution);
        return true;
      } catch {
        return false;
      }
    },
    [applyExecution]
  );

  const beginTransaction = useCallback((): boolean => {
    if (stateRef.current.frozen || transactionRef.current) return false;
    transactionRef.current = new EditorCommandTransaction(
      stateRef.current.document
    );
    return true;
  }, []);

  const previewTransaction = useCallback(
    (command: EditorCommand): boolean => {
      if (stateRef.current.frozen || !transactionRef.current) return false;
      try {
        const document = transactionRef.current.preview(command);
        dispatchAndTrack({ type: 'preview', document });
        return true;
      } catch {
        return false;
      }
    },
    [dispatchAndTrack]
  );

  const commitTransaction = useCallback(
    (id: string, label: string): boolean => {
      const transaction = transactionRef.current;
      if (stateRef.current.frozen || !transaction) return false;
      const initialDocument = transaction.cancel();
      const command = transaction.commit(id, label);
      transactionRef.current = null;
      if (!command) {
        dispatchAndTrack({ type: 'preview', document: initialDocument });
        return false;
      }
      const execution = historyRef.current.execute(initialDocument, command);
      applyExecution(execution);
      return true;
    },
    [applyExecution, dispatchAndTrack]
  );

  const cancelTransaction = useCallback((): boolean => {
    const transaction = transactionRef.current;
    if (!transaction) return false;
    transactionRef.current = null;
    dispatchAndTrack({ type: 'preview', document: transaction.cancel() });
    return true;
  }, [dispatchAndTrack]);

  const undo = useCallback((): boolean => {
    if (stateRef.current.frozen || transactionRef.current) return false;
    const execution = historyRef.current.undo(stateRef.current.document);
    if (!execution) return false;
    applyExecution(execution);
    return true;
  }, [applyExecution]);

  const redo = useCallback((): boolean => {
    if (stateRef.current.frozen || transactionRef.current) return false;
    const execution = historyRef.current.redo(stateRef.current.document);
    if (!execution) return false;
    applyExecution(execution);
    return true;
  }, [applyExecution]);

  const replaceFromDisk = useCallback(
    (document: EditorProjectV2) => {
      historyRef.current.clear();
      dispatchAndTrack({ type: 'replace', document });
    },
    [dispatchAndTrack]
  );
  const setSelection = useCallback(
    (selection: EditorSelection) =>
      dispatchAndTrack({ type: 'selection', selection }),
    [dispatchAndTrack]
  );
  const freeze = useCallback(
    () => dispatchAndTrack({ type: 'freeze', frozen: true }),
    [dispatchAndTrack]
  );
  const unfreeze = useCallback(
    () => dispatchAndTrack({ type: 'freeze', frozen: false }),
    [dispatchAndTrack]
  );
  const acceptSave = useCallback(
    (mutationRevision: number, result: EditorV2SaveResult) =>
      dispatchAndTrack({ type: 'save-result', mutationRevision, result }),
    [dispatchAndTrack]
  );
  const clearRecovery = useCallback(
    () => dispatchAndTrack({ type: 'clear-recovery' }),
    [dispatchAndTrack]
  );

  const value = useMemo(
    () => ({
      ...state,
      getSnapshot,
      execute,
      executeWithoutHistory,
      beginTransaction,
      previewTransaction,
      commitTransaction,
      cancelTransaction,
      undo,
      redo,
      setSelection,
      freeze,
      unfreeze,
      acceptSave,
      replaceFromDisk,
      clearRecovery,
    }),
    [
      acceptSave,
      beginTransaction,
      cancelTransaction,
      clearRecovery,
      commitTransaction,
      execute,
      executeWithoutHistory,
      freeze,
      getSnapshot,
      previewTransaction,
      redo,
      replaceFromDisk,
      setSelection,
      state,
      undo,
      unfreeze,
    ]
  );

  return (
    <EditorStoreContext.Provider value={value}>
      {children}
    </EditorStoreContext.Provider>
  );
}
