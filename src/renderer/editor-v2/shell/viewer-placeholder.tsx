import React from 'react';
import { Maximize2, Play, SkipBack, SkipForward } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import type { EditorProjectV2 } from '@/types/editor-v2';

interface ViewerPlaceholderProps {
  project: EditorProjectV2;
}

export default function ViewerPlaceholder({ project }: ViewerPlaceholderProps) {
  const assetCount = Object.keys(project.assets).length;
  return (
    <main
      aria-label="Viewer"
      className="bg-background flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/70 p-6">
        <div className="border-border/70 bg-card/20 flex aspect-video max-h-full w-full max-w-4xl items-center justify-center border shadow-2xl">
          <div className="text-center">
            <p className="text-sm font-medium text-white">Composition viewer</p>
            <p className="mt-1 text-xs text-white/50">
              {assetCount === 0
                ? 'This project has no media assets.'
                : `${assetCount} media ${assetCount === 1 ? 'asset' : 'assets'} ready for evaluation.`}
            </p>
          </div>
        </div>
      </div>
      <div className="border-border bg-card flex h-11 shrink-0 items-center justify-between border-t px-3">
        <span className="text-muted-foreground font-mono text-xs">
          00:00:00:00
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Previous frame"
            disabled
          >
            <SkipBack className="size-3.5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="size-8"
            aria-label="Play"
            disabled
          >
            <Play className="size-4 fill-current" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Next frame"
            disabled
          >
            <SkipForward className="size-3.5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Fit viewer"
          disabled
        >
          <Maximize2 className="size-3.5" />
        </Button>
      </div>
    </main>
  );
}
