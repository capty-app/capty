import React, { useMemo, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';

import {
  createAddClipEffectCommand,
  createAddSequenceEffectCommand,
} from '@/editor-v2/commands/operations';
import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { useProjectDataMutation } from '../store/project-data-mutation-context';
import { useEditorStore } from '../store/use-editor-store';
import {
  createClipEffectFromCatalog,
  createSequenceEffectFromCatalog,
  EDITOR_EFFECT_CATALOG,
  type EditorEffectCategory,
} from './effect-catalog';

const CATEGORIES: readonly EditorEffectCategory[] = [
  'Canvas',
  'Motion',
  'Recording',
  'Overlays',
];

interface EffectsBrowserProps {
  projectToken: string;
}

export default function EffectsBrowser({ projectToken }: EffectsBrowserProps) {
  const store = useEditorStore();
  const runProjectDataMutation = useProjectDataMutation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [subtitleAssetId, setSubtitleAssetId] = useState<string | null>(null);
  const selectedClip =
    store.selection.kind === 'clips'
      ? store.document.sequence.clips[store.selection.primaryClipId]
      : null;
  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return EDITOR_EFFECT_CATALOG;
    return EDITOR_EFFECT_CATALOG.filter(item =>
      `${item.name} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [query]);

  const addEffect = (itemId: string, scope: 'clip' | 'sequence') => {
    if (scope === 'clip') {
      if (!selectedClip) {
        setStatus('Select one visual clip before adding this effect.');
        return;
      }
      const effect = createClipEffectFromCatalog(
        itemId,
        store.document,
        selectedClip,
        () => crypto.randomUUID()
      );
      if (!effect) {
        if (itemId === 'subtitle') {
          setSubtitleAssetId(selectedClip.assetId);
          setStatus('Import subtitles or generate them from microphone audio.');
          return;
        }
        setStatus(
          'This clip does not provide the media or data this effect needs.'
        );
        return;
      }
      if (!store.execute(createAddClipEffectCommand(selectedClip.id, effect))) {
        setStatus('The effect could not be added. Check the track lock state.');
        return;
      }
      store.setSelection({
        kind: 'effect',
        clipId: selectedClip.id,
        effectId: effect.id,
      });
      setStatus(`${effect.kind} added.`);
      return;
    }

    const effect = createSequenceEffectFromCatalog(itemId, store.document, () =>
      crypto.randomUUID()
    );
    if (!effect) {
      setStatus('The canvas effect could not be created.');
      return;
    }
    if (
      store.document.sequence.effects.some(
        current => current.kind === effect.kind
      )
    ) {
      setStatus(
        `A ${effect.kind} effect already exists. Select it in the inspector.`
      );
      return;
    }
    if (!store.execute(createAddSequenceEffectCommand(effect))) {
      setStatus('The canvas effect could not be added.');
      return;
    }
    store.setSelection({ kind: 'effect', effectId: effect.id });
    setStatus(`${effect.kind} added.`);
  };

  const createSubtitles = async (mode: 'import' | 'generate') => {
    if (!subtitleAssetId) return;
    setStatus(
      mode === 'import'
        ? 'Waiting for a subtitle file…'
        : 'Generating subtitles…'
    );
    const result = await runProjectDataMutation(expectedRevision => {
      const base = {
        projectToken,
        expectedRevision,
        assetId: subtitleAssetId,
      };
      return mode === 'import'
        ? window.editorV2.importSubtitles(base)
        : window.editorV2.generateSubtitles({ ...base, model: 'base' });
    });
    if (result.status !== 'updated') {
      setStatus(
        result.status === 'stale'
          ? 'The project changed on disk. Reload before creating subtitles.'
          : result.error
      );
      return;
    }
    const clip = Object.values(result.project.sequence.clips).find(
      current => current.assetId === subtitleAssetId
    );
    const effect = clip?.effects.find(current => current.kind === 'subtitle');
    if (clip && effect) {
      store.setSelection({
        kind: 'effect',
        clipId: clip.id,
        effectId: effect.id,
      });
    }
    setSubtitleAssetId(null);
    setStatus('Subtitles are ready and the original V1 data is unchanged.');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="border-border flex h-9 items-center gap-2 border-b px-3">
        <Search className="text-muted-foreground size-3.5" />
        <span className="sr-only">Search effects</span>
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search effects"
          className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
        />
      </label>
      {status ? (
        <div
          role="status"
          className="border-border space-y-2 border-b px-3 py-2 text-xs"
        >
          <p>{status}</p>
          {subtitleAssetId ? (
            <div className="grid grid-cols-2 gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void createSubtitles('import')}
              >
                Import
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void createSubtitles('generate')}
              >
                Generate
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center text-xs">
            No effects match “{query}”.
          </div>
        ) : (
          CATEGORIES.map(category => {
            const categoryItems = items.filter(
              item => item.category === category
            );
            if (categoryItems.length === 0) return null;
            return (
              <section
                key={category}
                aria-labelledby={`effect-${category}`}
                className="mb-3"
              >
                <h3
                  id={`effect-${category}`}
                  className="text-muted-foreground mb-1 px-1 text-xs font-medium"
                >
                  {category}
                </h3>
                <div className="space-y-1">
                  {categoryItems.map(item => (
                    <Button
                      key={item.id}
                      variant="ghost"
                      className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
                      onClick={() => addEffect(item.id, item.scope)}
                    >
                      <Sparkles className="text-primary size-3.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">
                          {item.name}
                        </span>
                        <span className="text-muted-foreground block text-xs font-normal whitespace-normal">
                          {item.description}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
