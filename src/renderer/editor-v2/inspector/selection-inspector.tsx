import React from 'react';
import { ChevronRight, Film, Layers3, Music2, Sparkles } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import { useEditorStore } from '../store/use-editor-store';
import EffectInspector from './effect-inspector';
import FirstFrameInspector from './first-frame-inspector';

interface SelectionInspectorProps {
  projectToken: string;
}

export default function SelectionInspector({
  projectToken,
}: SelectionInspectorProps) {
  const store = useEditorStore();
  const selection = store.selection;

  if (selection.kind === 'effect') {
    const effect = selection.clipId
      ? store.document.sequence.clips[selection.clipId]?.effects.find(
          current => current.id === selection.effectId
        )
      : store.document.sequence.effects.find(
          current => current.id === selection.effectId
        );
    if (effect) {
      return (
        <EffectInspector
          key={`${selection.clipId ?? 'sequence'}:${effect.id}`}
          projectToken={projectToken}
          clipId={selection.clipId}
          effect={effect}
        />
      );
    }
  }

  if (selection.kind === 'clips') {
    const clip = store.document.sequence.clips[selection.primaryClipId];
    if (!clip) return null;
    return (
      <div className="space-y-4 p-3">
        <div className="flex items-center gap-2">
          {clip.kind === 'audio' ? (
            <Music2 className="text-muted-foreground size-4" />
          ) : (
            <Film className="text-muted-foreground size-4" />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{clip.name}</h2>
            <p className="text-muted-foreground text-xs">
              {selection.clipIds.length === 1
                ? `${clip.kind} clip`
                : `${selection.clipIds.length} clips selected`}
            </p>
          </div>
        </div>
        <div>
          <h3 className="text-muted-foreground mb-2 text-xs font-medium">
            Effects
          </h3>
          {clip.effects.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Choose an effect from the Effects browser.
            </p>
          ) : (
            <div className="space-y-1">
              {clip.effects.map(effect => (
                <Button
                  key={effect.id}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-between px-2"
                  onClick={() =>
                    store.setSelection({
                      kind: 'effect',
                      clipId: clip.id,
                      effectId: effect.id,
                    })
                  }
                >
                  <span className="flex items-center gap-2 text-xs">
                    <Sparkles className="size-3.5" />
                    {effect.kind}
                  </span>
                  <ChevronRight className="size-3.5" />
                </Button>
              ))}
            </div>
          )}
        </div>
        {store.document.sequence.effects.length > 0 ? (
          <div>
            <h3 className="text-muted-foreground mb-2 text-xs font-medium">
              Canvas Effects
            </h3>
            <div className="space-y-1">
              {store.document.sequence.effects.map(effect => (
                <Button
                  key={effect.id}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-between px-2"
                  onClick={() =>
                    store.setSelection({ kind: 'effect', effectId: effect.id })
                  }
                >
                  <span className="flex items-center gap-2 text-xs">
                    <Layers3 className="size-3.5" />
                    {effect.kind}
                  </span>
                  <ChevronRight className="size-3.5" />
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (selection.kind === 'track') {
    const track = store.document.sequence.tracks[selection.trackId];
    if (!track) return null;
    return (
      <div className="space-y-2 p-3">
        <h2 className="text-sm font-medium">{track.name}</h2>
        <p className="text-muted-foreground text-xs">
          {track.kind} track with {track.clipIds.length} clips
        </p>
        <p className="text-xs">{track.locked ? 'Locked' : 'Editable'}</p>
      </div>
    );
  }

  if (selection.kind === 'asset') {
    const asset = store.document.assets[selection.assetId];
    if (!asset) return null;
    return (
      <div className="space-y-2 p-3">
        <h2 className="text-sm font-medium">{asset.name}</h2>
        <p className="text-muted-foreground text-xs">{asset.kind} asset</p>
        <p className="text-xs">{asset.locator.kind.replaceAll('-', ' ')}</p>
        {asset.kind === 'image' ? <FirstFrameInspector asset={asset} /> : null}
      </div>
    );
  }

  if (selection.kind === 'transition') {
    const transition =
      store.document.sequence.transitions[selection.transitionId];
    if (!transition) return null;
    return (
      <div className="space-y-2 p-3">
        <h2 className="text-sm font-medium">{transition.type}</h2>
        <p className="text-muted-foreground text-xs">
          {transition.durationTicks} ticks
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-center">
      <div>
        <p className="text-sm font-medium">Nothing selected</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Select a clip, track, effect, or transition to edit its properties.
        </p>
      </div>
    </div>
  );
}
