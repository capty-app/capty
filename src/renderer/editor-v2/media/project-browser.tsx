import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link2, Plus, RefreshCw, Search } from 'lucide-react';

import {
  createAddAssetCommand,
  createRemoveAssetCommand,
  createUpdateAssetCommand,
} from '@/editor-v2/commands/operations';
import { Button } from '@/renderer/components/ui/button';
import { useEditorStore } from '@/renderer/editor-v2/store/use-editor-store';
import MediaBin from './media-bin';
import type { MediaAssetStatus, MediaImportPolicy } from '@/types/editor-v2';

interface ProjectBrowserProps {
  projectToken: string;
  onRemoveManaged: (assetId: string) => Promise<void>;
  onMediaOperationStart: () => (() => void) | null;
  operationsFrozen: boolean;
}

export default function ProjectBrowser({
  projectToken,
  onRemoveManaged,
  onMediaOperationStart,
  operationsFrozen,
}: ProjectBrowserProps) {
  const store = useEditorStore();
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<Record<string, MediaAssetStatus>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const actionPending = useRef(false);
  const statusRequest = useRef(0);
  const allAssets = store.document.assets;
  const projectRevision = store.document.revision;
  const assetIds = useMemo(() => Object.keys(allAssets).sort(), [allAssets]);
  const assets = useMemo(
    () =>
      Object.values(allAssets)
        .filter(asset =>
          asset.name.toLowerCase().includes(query.trim().toLowerCase())
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [allAssets, query]
  );

  const refreshStatuses = useCallback(async () => {
    const requestId = Math.max(statusRequest.current + 1, projectRevision + 1);
    statusRequest.current = requestId;
    if (assetIds.length === 0) {
      setStatuses({});
      setStatusRefreshing(false);
      return;
    }
    setStatusRefreshing(true);
    try {
      const results = await Promise.all(
        assetIds.map(async assetId => ({
          assetId,
          result: await window.editorV2.getMediaStatus({
            projectToken,
            assetId,
          }),
        }))
      );
      if (statusRequest.current !== requestId) return;
      const next: Record<string, MediaAssetStatus> = {};
      const failures: string[] = [];
      for (const { assetId, result } of results) {
        if (result.status === 'resolved') {
          next[assetId] = result.asset;
          continue;
        }
        next[assetId] = {
          assetId,
          availability: 'error',
          error: result.error,
        };
        failures.push(result.error);
      }
      setStatuses(next);
      setError(failures.length > 0 ? failures.join('\n') : null);
    } catch (reason) {
      if (statusRequest.current !== requestId) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (statusRequest.current === requestId) setStatusRefreshing(false);
    }
  }, [assetIds, projectRevision, projectToken]);

  useEffect(() => {
    void refreshStatuses();
    return () => {
      statusRequest.current += 1;
    };
  }, [refreshStatuses]);

  const importMedia = useCallback(
    async (policy: MediaImportPolicy) => {
      if (operationsFrozen || store.frozen || actionPending.current) return;
      const finishOperation = onMediaOperationStart();
      if (!finishOperation) return;
      actionPending.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await window.editorV2.importMedia({
          projectToken,
          policy,
        });
        if (result.status === 'cancelled') return;
        if (result.status === 'failed') {
          setError(result.error);
          return;
        }
        const added =
          result.asset.locator.kind === 'managed'
            ? store.executeWithoutHistory(createAddAssetCommand(result.asset))
            : store.execute(createAddAssetCommand(result.asset));
        if (!added) {
          setError('The imported media could not be added to the project');
          return;
        }
        setStatuses(current => ({
          ...current,
          [result.asset.id]: result.media,
        }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        actionPending.current = false;
        setBusy(false);
        finishOperation();
      }
    },
    [onMediaOperationStart, operationsFrozen, projectToken, store]
  );

  const relink = useCallback(
    async (assetId: string) => {
      if (operationsFrozen || store.frozen || actionPending.current) return;
      const finishOperation = onMediaOperationStart();
      if (!finishOperation) return;
      actionPending.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await window.editorV2.relinkMedia({
          projectToken,
          assetId,
        });
        if (result.status === 'cancelled') return;
        if (result.status === 'failed') {
          setError(result.error);
          return;
        }
        if (!store.execute(createUpdateAssetCommand(assetId, result.asset))) {
          setError('The relinked media could not be applied to the project');
          return;
        }
        setStatuses(current => ({ ...current, [assetId]: result.media }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        actionPending.current = false;
        setBusy(false);
        finishOperation();
      }
    },
    [onMediaOperationStart, operationsFrozen, projectToken, store]
  );

  const reveal = useCallback(
    async (assetId: string) => {
      if (operationsFrozen || store.frozen || actionPending.current) return;
      actionPending.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await window.editorV2.revealMedia({
          projectToken,
          assetId,
        });
        if (result.status === 'failed') setError(result.error);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        actionPending.current = false;
        setBusy(false);
      }
    },
    [operationsFrozen, projectToken, store.frozen]
  );

  const remove = useCallback(
    async (assetId: string) => {
      if (operationsFrozen || store.frozen || actionPending.current) return;
      const asset = store.document.assets[assetId];
      if (!asset) return;
      actionPending.current = true;
      setBusy(true);
      setError(null);
      try {
        if (asset.locator.kind === 'managed') {
          await onRemoveManaged(assetId);
          return;
        }
        if (!store.execute(createRemoveAssetCommand(assetId))) {
          setError('Remove this media from the timeline before removing it');
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        actionPending.current = false;
        setBusy(false);
      }
    },
    [onRemoveManaged, operationsFrozen, store]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex items-center gap-1 border-b p-2">
        <Button
          size="sm"
          className="h-7 flex-1 gap-1"
          disabled={busy || operationsFrozen || store.frozen}
          onClick={() => void importMedia('copy')}
        >
          <Plus className="size-3.5" />
          Import
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 flex-1 gap-1"
          disabled={busy || operationsFrozen || store.frozen}
          onClick={() => void importMedia('link')}
        >
          <Link2 className="size-3.5" />
          Link in Place
        </Button>
      </div>
      <div className="border-border flex h-9 items-center gap-2 border-b px-3">
        <Search className="text-muted-foreground size-3.5" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search project media</span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search project"
            className="placeholder:text-muted-foreground w-full bg-transparent text-xs outline-none"
          />
        </label>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Refresh media status"
          disabled={
            busy || operationsFrozen || store.frozen || statusRefreshing
          }
          onClick={() => void refreshStatuses()}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      {error ? (
        <div
          role="alert"
          className="text-destructive border-border border-b p-2 text-xs"
        >
          {error}
        </div>
      ) : null}
      <MediaBin
        assets={assets}
        statuses={statuses}
        disabled={busy || operationsFrozen || store.frozen}
        selectedAssetId={
          store.selection.kind === 'asset' ? store.selection.assetId : undefined
        }
        onSelect={assetId => store.setSelection({ kind: 'asset', assetId })}
        onRelink={assetId => void relink(assetId)}
        onReveal={assetId => void reveal(assetId)}
        onRemove={assetId => void remove(assetId)}
      />
    </div>
  );
}
