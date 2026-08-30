import { useCallback, useEffect, useRef, useState } from 'react';

import { renderEditorExport } from './export-renderer';
import type {
  EditorExportProgress,
  EditorExportResult,
  EditorExportSettings,
} from '@/types/editor-v2';

interface UseEditorExportOptions {
  projectToken: string;
  flushProject: () => Promise<number>;
  initialSettings: EditorExportSettings;
  onSettingsChange: (settings: EditorExportSettings) => void;
}

export const useEditorExport = ({
  projectToken,
  flushProject,
  initialSettings,
  onSettingsChange,
}: UseEditorExportOptions) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<EditorExportProgress | null>(null);
  const [result, setResult] = useState<EditorExportResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const removeProgress = window.editorV2.onExportProgress(next => {
      setProgress(current =>
        current?.jobId && current.jobId !== next.jobId ? current : next
      );
    });
    const removeComplete = window.editorV2.onExportComplete(next => {
      setActiveJobId(current => (current === next.jobId ? null : current));
      setProgress(current => (current?.jobId === next.jobId ? null : current));
      setResult(next);
      abortControllerRef.current = null;
    });
    return () => {
      removeProgress();
      removeComplete();
    };
  }, []);

  const start = useCallback(
    async (settings: EditorExportSettings) => {
      setResult(null);
      try {
        const expectedRevision = await flushProject();
        const response = await window.editorV2.startExport({
          projectToken,
          expectedRevision,
          settings,
        });
        if (response.status === 'cancelled') return;
        if (response.status === 'failed') {
          setResult({ jobId: '', status: 'failed', error: response.error });
          return;
        }
        onSettingsChange(response.snapshot.workspace.exportSettings);
        setDialogOpen(false);
        setActiveJobId(response.jobId);
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        try {
          await renderEditorExport({
            jobId: response.jobId,
            projectToken,
            snapshot: response.snapshot,
            signal: abortController.signal,
          });
          const finish = await window.editorV2.finishExport({
            jobId: response.jobId,
          });
          if (finish.status === 'failed') throw new Error(finish.error);
        } catch (error) {
          if (abortController.signal.aborted) return;
          const message = error instanceof Error ? error.message : String(error);
          await window.editorV2.cancelExport({
            jobId: response.jobId,
            error: message,
          });
        }
      } catch (error) {
        setResult({
          jobId: '',
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [flushProject, onSettingsChange, projectToken]
  );

  const cancel = useCallback(async () => {
    if (!activeJobId) return;
    abortControllerRef.current?.abort();
    await window.editorV2.cancelExport({ jobId: activeJobId });
  }, [activeJobId]);

  return {
    dialogOpen,
    setDialogOpen,
    activeJobId,
    progress,
    result,
    initialSettings,
    start,
    cancel,
  };
};
