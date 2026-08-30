import React from 'react';
import {
  FileAudio,
  FileImage,
  Film,
  FolderOpen,
  Link2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import type { MediaAsset, MediaAssetStatus } from '@/types/editor-v2';

interface AssetCardProps {
  asset: MediaAsset;
  status?: MediaAssetStatus;
  disabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onRelink: () => void;
  onReveal: () => void;
  onRemove: () => void;
}

const AssetIcon = ({ asset }: { asset: MediaAsset }) => {
  switch (asset.kind) {
    case 'audio':
      return <FileAudio className="size-5" />;
    case 'image':
      return <FileImage className="size-5" />;
    case 'video':
    case 'capty-recording':
      return <Film className="size-5" />;
  }
};

export default function AssetCard({
  asset,
  status,
  disabled,
  selected,
  onSelect,
  onRelink,
  onReveal,
  onRemove,
}: AssetCardProps) {
  const unavailable = !!status && status.availability !== 'available';
  return (
    <article
      className={`bg-background overflow-hidden rounded-md border ${
        selected ? 'border-primary ring-primary ring-1' : 'border-border'
      }`}
    >
      <button
        type="button"
        className="block w-full text-left"
        aria-pressed={selected}
        aria-label={`Select ${asset.name}`}
        onClick={onSelect}
      >
        <div className="bg-muted flex aspect-video items-center justify-center overflow-hidden">
          {status?.thumbnailUrl ? (
            <img
              src={status.thumbnailUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <AssetIcon asset={asset} />
          )}
        </div>
      </button>
      <div className="p-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-medium">{asset.name}</span>
          {asset.locator.kind === 'linked' ? (
            <Link2
              aria-label="Linked in place"
              className="text-muted-foreground size-3 shrink-0"
            />
          ) : null}
        </div>
        <p
          className={
            unavailable
              ? 'text-destructive mt-1 text-xs'
              : 'text-muted-foreground mt-1 text-xs'
          }
        >
          {status?.error ?? status?.availability ?? 'Checking media…'}
        </p>
        {status?.cacheWarning ? (
          <p className="text-destructive mt-1 text-xs">{status.cacheWarning}</p>
        ) : null}
        <div className="mt-2 flex items-center gap-1">
          {asset.locator.kind === 'linked' && unavailable ? (
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label={`Relink ${asset.name}`}
              disabled={disabled}
              onClick={onRelink}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Reveal ${asset.name}`}
            disabled={disabled}
            onClick={onReveal}
          >
            <FolderOpen className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive size-7"
            aria-label={`Remove ${asset.name}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
