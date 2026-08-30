import React, { useCallback, useState } from 'react';

import { createUpdateTrackCommand } from '@/editor-v2/commands/timeline-edits';
import { NumberControl, ToggleControl } from './inspector-controls';
import { useEditorStore } from '../store/use-editor-store';
import type { AudioTrack } from '@/types/editor-v2';

interface AudioTrackInspectorProps {
  track: AudioTrack;
}

export default function AudioTrackInspector({
  track,
}: AudioTrackInspectorProps) {
  const store = useEditorStore();
  const [error, setError] = useState<string | null>(null);
  const update = useCallback(
    (change: Parameters<typeof createUpdateTrackCommand>[1]) => {
      const succeeded = store.execute(
        createUpdateTrackCommand(track.id, change)
      );
      setError(succeeded ? null : 'The audio track could not be updated');
    },
    [store, track.id]
  );

  return (
    <section aria-label="Audio track" className="space-y-3">
      <NumberControl
        label="Track gain"
        value={track.gain}
        minimum={0}
        maximum={2}
        step={0.01}
        onChange={gain => update({ gain })}
      />
      <ToggleControl
        label="Muted"
        checked={track.muted}
        onChange={muted => update({ muted })}
      />
      <ToggleControl
        label="Solo"
        checked={track.solo}
        onChange={solo => update({ solo })}
      />
      {error ? (
        <p role="status" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </section>
  );
}
