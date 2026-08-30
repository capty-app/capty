import React, { useCallback, useState } from 'react';

import { createUpdateAudioClipCommand } from '@/editor-v2/commands/operations';
import { NumberControl } from './inspector-controls';
import { useEditorStore } from '../store/use-editor-store';
import { EDITOR_V2_TICKS_PER_SECOND, type AudioClip } from '@/types/editor-v2';

interface AudioClipInspectorProps {
  clip: AudioClip;
}

export default function AudioClipInspector({ clip }: AudioClipInspectorProps) {
  const store = useEditorStore();
  const [error, setError] = useState<string | null>(null);
  const update = useCallback(
    (change: Parameters<typeof createUpdateAudioClipCommand>[1]) => {
      const succeeded = store.execute(
        createUpdateAudioClipCommand(clip.id, change)
      );
      setError(succeeded ? null : 'The audio clip could not be updated');
    },
    [clip.id, store]
  );
  const maximumFadeSeconds = clip.timelineDuration / EDITOR_V2_TICKS_PER_SECOND;

  return (
    <section aria-label="Audio clip" className="space-y-3">
      <h3 className="text-muted-foreground text-xs font-medium">Audio</h3>
      <NumberControl
        label="Clip gain"
        value={clip.gain}
        minimum={0}
        maximum={2}
        step={0.01}
        onChange={gain => update({ gain })}
      />
      <NumberControl
        label="Fade in"
        value={clip.fadeInTicks / EDITOR_V2_TICKS_PER_SECOND}
        minimum={0}
        maximum={maximumFadeSeconds}
        step={0.01}
        onChange={seconds =>
          update({
            fadeInTicks: Math.round(seconds * EDITOR_V2_TICKS_PER_SECOND),
          })
        }
      />
      <NumberControl
        label="Fade out"
        value={clip.fadeOutTicks / EDITOR_V2_TICKS_PER_SECOND}
        minimum={0}
        maximum={maximumFadeSeconds}
        step={0.01}
        onChange={seconds =>
          update({
            fadeOutTicks: Math.round(seconds * EDITOR_V2_TICKS_PER_SECOND),
          })
        }
      />
      {error ? (
        <p role="status" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </section>
  );
}
