import React from 'react';
import { Image as ImageIcon, Trash2 } from 'lucide-react';

import { createUpdatePreRollCommand } from '@/editor-v2/commands/operations';
import { Button } from '@/renderer/components/ui/button';
import { useEditorStore } from '../store/use-editor-store';
import { SelectControl } from './inspector-controls';
import type { ImageMediaAsset } from '@/types/editor-v2';

interface FirstFrameInspectorProps {
  asset: ImageMediaAsset;
}

export default function FirstFrameInspector({
  asset,
}: FirstFrameInspectorProps) {
  const store = useEditorStore();
  const preRoll = store.document.sequence.preRoll;
  const selected = preRoll?.assetId === asset.id;

  if (!selected) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={() =>
          store.execute(
            createUpdatePreRollCommand({
              kind: 'output-frame-count',
              assetId: asset.id,
              frames: 1,
              fit: 'cover',
            })
          )
        }
      >
        <ImageIcon className="size-3.5" />
        Use as First Frame
      </Button>
    );
  }

  return (
    <section className="border-border space-y-3 rounded-md border p-3">
      <div>
        <h3 className="text-xs font-medium">First Frame</h3>
        <p className="text-muted-foreground text-xs">
          This image is semantic output pre-roll.
        </p>
      </div>
      <p className="text-muted-foreground text-xs">
        Fixed to one frame at the active frame rate.
      </p>
      <SelectControl
        label="Fit"
        value={preRoll.fit}
        options={[
          { value: 'cover', label: 'Cover' },
          { value: 'stretch', label: 'Stretch' },
        ]}
        onChange={fit =>
          store.execute(createUpdatePreRollCommand({ ...preRoll, fit }))
        }
      />
      <Button
        size="sm"
        variant="destructive"
        className="w-full gap-2"
        onClick={() => store.execute(createUpdatePreRollCommand())}
      >
        <Trash2 className="size-3.5" />
        Remove First Frame
      </Button>
    </section>
  );
}
