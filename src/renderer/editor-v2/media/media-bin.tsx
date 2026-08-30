import React from 'react';

import AssetCard from './asset-card';
import type { MediaAsset, MediaAssetStatus } from '@/types/editor-v2';

interface MediaBinProps {
  assets: MediaAsset[];
  statuses: Record<string, MediaAssetStatus>;
  disabled: boolean;
  selectedAssetId?: string;
  onSelect: (assetId: string) => void;
  onRelink: (assetId: string) => void;
  onReveal: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}

export default function MediaBin({
  assets,
  statuses,
  disabled,
  selectedAssetId,
  onSelect,
  onRelink,
  onReveal,
  onRemove,
}: MediaBinProps) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-5 text-center">
        <div>
          <p className="text-sm font-medium">No project media</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Import a managed copy or explicitly link a file in place.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 overflow-y-auto p-2">
      {assets.map(asset => (
        <AssetCard
          key={asset.id}
          asset={asset}
          status={statuses[asset.id]}
          disabled={disabled}
          selected={selectedAssetId === asset.id}
          onSelect={() => onSelect(asset.id)}
          onRelink={() => onRelink(asset.id)}
          onReveal={() => onReveal(asset.id)}
          onRemove={() => onRemove(asset.id)}
        />
      ))}
    </div>
  );
}
