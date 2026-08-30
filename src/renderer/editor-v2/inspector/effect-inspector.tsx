import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { ASPECT_RATIOS } from '@/types/aspect-ratio';
import {
  createRemoveClipEffectCommand,
  createRemoveSequenceEffectCommand,
  createUpdateClipEffectCommand,
  createUpdateSequenceEffectCommand,
} from '@/editor-v2/commands/operations';
import { Button } from '@/renderer/components/ui/button';
import { useProjectDataMutation } from '../store/project-data-mutation-context';
import { useEditorStore } from '../store/use-editor-store';
import {
  NumberControl,
  SelectControl,
  ToggleControl,
} from './inspector-controls';
import type {
  ClipEffect,
  EditorV2DataKind,
  EditorV2DataValue,
  SequenceEffect,
} from '@/types/editor-v2';

interface EffectInspectorProps {
  projectToken: string;
  clipId?: string;
  effect: ClipEffect | SequenceEffect;
}

const effectName = (effect: ClipEffect | SequenceEffect): string => {
  switch (effect.kind) {
    case 'camera-layout':
      return 'Camera Layout';
    case 'canvas-settings':
      return 'Canvas Settings';
    case 'device-frame':
      return 'Device Frame';
    case 'audio-gain':
      return 'Audio Gain';
    case 'annotation':
      return 'Drawing & Redaction';
    default:
      return effect.kind.charAt(0).toUpperCase() + effect.kind.slice(1);
  }
};

export default function EffectInspector({
  projectToken,
  clipId,
  effect,
}: EffectInspectorProps) {
  const store = useEditorStore();
  const runProjectDataMutation = useProjectDataMutation();
  const [dataValue, setDataValue] = useState<EditorV2DataValue | null>(null);
  const [dataStatus, setDataStatus] = useState<string | null>(null);
  const update = (replacement: ClipEffect | SequenceEffect) => {
    const command = clipId
      ? createUpdateClipEffectCommand(
          clipId,
          effect.id,
          replacement as ClipEffect
        )
      : createUpdateSequenceEffectCommand(
          effect.id,
          replacement as SequenceEffect
        );
    store.execute(command);
  };
  const restoreSelection = (project: typeof store.document) => {
    if (!clipId) return;
    const nextEffect = project.sequence.clips[clipId]?.effects.find(
      current => current.id === effect.id
    );
    if (!nextEffect) return;
    store.setSelection({ kind: 'effect', clipId, effectId: nextEffect.id });
  };
  const remove = () => {
    const command = clipId
      ? createRemoveClipEffectCommand(clipId, effect.id)
      : createRemoveSequenceEffectCommand(effect.id);
    if (store.execute(command)) store.setSelection({ kind: 'none' });
  };
  const dataKind: EditorV2DataKind | null =
    effect.kind === 'cursor'
      ? 'cursor'
      : effect.kind === 'keyboard'
        ? 'keyboard'
        : effect.kind === 'subtitle'
          ? 'subtitles'
          : null;
  const dataLocator =
    effect.kind === 'cursor' ||
    effect.kind === 'keyboard' ||
    effect.kind === 'subtitle'
      ? effect.data
      : null;
  const loadData = async () => {
    if (!dataKind || !dataLocator) return;
    setDataStatus('Loading effect data…');
    const result = await window.editorV2.readData({
      projectToken,
      kind: dataKind,
      locator: dataLocator,
    });
    if (result.status === 'failed') {
      setDataStatus(result.error);
      return;
    }
    setDataValue(result.data);
    setDataStatus('Effect data loaded.');
  };
  const saveData = async () => {
    if (!dataKind || !dataLocator || !dataValue || !clipId) return;
    const clip = store.document.sequence.clips[clipId];
    if (!clip) return;
    setDataStatus('Saving an editable V2 copy…');
    const result = await runProjectDataMutation(expectedRevision =>
      window.editorV2.writeData({
        projectToken,
        expectedRevision,
        assetId: clip.assetId,
        kind: dataKind,
        locator: dataLocator,
        value: dataValue,
      })
    );
    if (result.status !== 'updated') {
      setDataStatus(
        result.status === 'stale'
          ? 'The project changed on disk. Reload before editing data.'
          : result.error
      );
      return;
    }
    restoreSelection(result.project);
    setDataStatus('Editable data saved without changing the V1 source.');
  };
  const importCursorData = async () => {
    if (effect.kind !== 'cursor' || !clipId) return;
    const clip = store.document.sequence.clips[clipId];
    if (!clip) return;
    setDataStatus('Waiting for cursor data…');
    const result = await runProjectDataMutation(expectedRevision =>
      window.editorV2.importCursor({
        projectToken,
        expectedRevision,
        assetId: clip.assetId,
        kind: 'cursor',
        locator: effect.data,
      })
    );
    if (result.status !== 'updated') {
      setDataStatus(
        result.status === 'stale'
          ? 'The project changed on disk. Reload before importing data.'
          : result.error
      );
      return;
    }
    restoreSelection(result.project);
  };
  const mutateData = async (action: 'delete' | 'reset') => {
    if (!dataKind || !dataLocator || !clipId) return;
    const clip = store.document.sequence.clips[clipId];
    if (!clip) return;
    setDataStatus(action === 'delete' ? 'Removing data…' : 'Resetting data…');
    const result = await runProjectDataMutation(expectedRevision => {
      const request = {
        projectToken,
        expectedRevision,
        assetId: clip.assetId,
        kind: dataKind,
        locator: dataLocator,
      };
      return action === 'delete'
        ? window.editorV2.deleteData(request)
        : window.editorV2.resetData(request);
    });
    if (result.status !== 'updated') {
      setDataStatus(
        result.status === 'stale'
          ? 'The project changed on disk. Reload before changing data.'
          : result.error
      );
      return;
    }
    restoreSelection(result.project);
    setDataStatus(
      action === 'delete' ? 'Effect data removed.' : 'V1 data restored.'
    );
  };

  return (
    <div className="space-y-4 p-3">
      <div>
        <h2 className="text-sm font-medium">{effectName(effect)}</h2>
        <p className="text-muted-foreground text-xs">
          {clipId ? 'Clip effect' : 'Canvas effect'}
        </p>
      </div>
      <ToggleControl
        label="Enabled"
        checked={effect.enabled}
        onChange={enabled => update({ ...effect, enabled })}
      />
      {effect.kind === 'canvas-settings' ? (
        <>
          <NumberControl
            label="Canvas Width"
            value={effect.width}
            minimum={1}
            maximum={8192}
            onChange={width => update({ ...effect, width })}
          />
          <NumberControl
            label="Canvas Height"
            value={effect.height}
            minimum={1}
            maximum={8192}
            onChange={height => update({ ...effect, height })}
          />
          <SelectControl
            label="Aspect Ratio"
            value={effect.aspectRatio?.name ?? 'Free'}
            options={ASPECT_RATIOS.map(ratio => ({
              value: ratio.name,
              label: ratio.name,
            }))}
            onChange={name => {
              const ratio = ASPECT_RATIOS.find(
                current => current.name === name
              );
              update({
                ...effect,
                aspectRatio:
                  !ratio || ratio.width === 0 || ratio.height === 0
                    ? null
                    : ratio,
              });
            }}
          />
          <label className="flex items-center justify-between gap-3 text-xs">
            <span>Canvas Color</span>
            <input
              aria-label="Canvas Color"
              type="color"
              value={effect.backgroundColor}
              className="border-input h-7 w-12 rounded border bg-transparent"
              onChange={event =>
                update({ ...effect, backgroundColor: event.target.value })
              }
            />
          </label>
        </>
      ) : null}
      {effect.kind === 'transform' ? (
        <>
          <NumberControl
            label="Position X"
            value={effect.value.positionX}
            minimum={-1920}
            maximum={1920}
            onChange={positionX =>
              update({ ...effect, value: { ...effect.value, positionX } })
            }
          />
          <NumberControl
            label="Position Y"
            value={effect.value.positionY}
            minimum={-1080}
            maximum={1080}
            onChange={positionY =>
              update({ ...effect, value: { ...effect.value, positionY } })
            }
          />
          <NumberControl
            label="Scale"
            value={effect.value.scaleX}
            minimum={0.1}
            maximum={4}
            step={0.05}
            onChange={scale =>
              update({
                ...effect,
                value: { ...effect.value, scaleX: scale, scaleY: scale },
              })
            }
          />
          <NumberControl
            label="Rotation"
            value={effect.value.rotationDegrees}
            minimum={-180}
            maximum={180}
            onChange={rotationDegrees =>
              update({ ...effect, value: { ...effect.value, rotationDegrees } })
            }
          />
          {(['cropTop', 'cropRight', 'cropBottom', 'cropLeft'] as const).map(
            key => (
              <NumberControl
                key={key}
                label={key.replace('crop', 'Crop ')}
                value={effect.value[key]}
                minimum={0}
                maximum={0.9}
                step={0.01}
                onChange={value =>
                  update({
                    ...effect,
                    value: { ...effect.value, [key]: value },
                  })
                }
              />
            )
          )}
        </>
      ) : null}
      {effect.kind === 'opacity' ? (
        <NumberControl
          label="Opacity"
          value={effect.opacity}
          minimum={0}
          maximum={1}
          step={0.01}
          onChange={opacity => update({ ...effect, opacity })}
        />
      ) : null}
      {effect.kind === 'zoom' ? (
        <>
          <NumberControl
            label="Zoom"
            value={effect.scale}
            minimum={1}
            maximum={5}
            step={0.1}
            onChange={scale => update({ ...effect, scale })}
          />
          <SelectControl
            label="Target"
            value={effect.target}
            options={[
              { value: 'cursor', label: 'Follow Cursor' },
              { value: 'manual', label: 'Manual Focus' },
            ]}
            onChange={target =>
              update({
                ...effect,
                target,
                focusX:
                  target === 'manual' ? (effect.focusX ?? 0.5) : undefined,
                focusY:
                  target === 'manual' ? (effect.focusY ?? 0.5) : undefined,
              })
            }
          />
          {effect.target === 'manual' ? (
            <>
              <NumberControl
                label="Focus X"
                value={effect.focusX ?? 0.5}
                minimum={0}
                maximum={1}
                step={0.01}
                onChange={focusX => update({ ...effect, focusX })}
              />
              <NumberControl
                label="Focus Y"
                value={effect.focusY ?? 0.5}
                minimum={0}
                maximum={1}
                step={0.01}
                onChange={focusY => update({ ...effect, focusY })}
              />
            </>
          ) : null}
        </>
      ) : null}
      {effect.kind === 'camera-layout' ? (
        <>
          <SelectControl
            label="Position"
            value={effect.style.position}
            options={[
              { value: 'top-left', label: 'Top Left' },
              { value: 'top-center', label: 'Top Center' },
              { value: 'top-right', label: 'Top Right' },
              { value: 'middle-left', label: 'Middle Left' },
              { value: 'middle-center', label: 'Center' },
              { value: 'middle-right', label: 'Middle Right' },
              { value: 'bottom-left', label: 'Bottom Left' },
              { value: 'bottom-center', label: 'Bottom Center' },
              { value: 'bottom-right', label: 'Bottom Right' },
            ]}
            onChange={position =>
              update({ ...effect, style: { ...effect.style, position } })
            }
          />
          <SelectControl
            label="Shape"
            value={effect.style.shape}
            options={[
              { value: 'rectangle', label: 'Landscape' },
              { value: 'square', label: 'Square' },
              { value: 'vertical', label: 'Portrait' },
            ]}
            onChange={shape =>
              update({ ...effect, style: { ...effect.style, shape } })
            }
          />
          <SelectControl
            label="Size"
            value={effect.style.size}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
            onChange={size =>
              update({ ...effect, style: { ...effect.style, size } })
            }
          />
          <ToggleControl
            label="Mirror"
            checked={effect.style.mirrored}
            onChange={mirrored =>
              update({ ...effect, style: { ...effect.style, mirrored } })
            }
          />
        </>
      ) : null}
      {effect.kind === 'cursor' ? (
        <>
          <NumberControl
            label="Cursor Size"
            value={effect.style.size}
            minimum={24}
            maximum={400}
            onChange={size =>
              update({ ...effect, style: { ...effect.style, size } })
            }
          />
          <NumberControl
            label="Smoothing"
            value={effect.style.smoothing}
            minimum={0}
            maximum={1}
            step={0.05}
            onChange={smoothing =>
              update({ ...effect, style: { ...effect.style, smoothing } })
            }
          />
          <ToggleControl
            label="Click Highlight"
            checked={effect.style.showClickHighlight}
            onChange={showClickHighlight =>
              update({
                ...effect,
                style: { ...effect.style, showClickHighlight },
              })
            }
          />
          <ToggleControl
            label="Hide When Idle"
            checked={effect.style.hideOnIdle}
            onChange={hideOnIdle =>
              update({ ...effect, style: { ...effect.style, hideOnIdle } })
            }
          />
        </>
      ) : null}
      {effect.kind === 'keyboard' ? (
        <>
          <SelectControl
            label="Font Size"
            value={effect.style.fontSize}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
            onChange={fontSize =>
              update({ ...effect, style: { ...effect.style, fontSize } })
            }
          />
          <NumberControl
            label="Display Duration"
            value={effect.style.displayDuration}
            minimum={0.25}
            maximum={5}
            step={0.25}
            onChange={displayDuration =>
              update({ ...effect, style: { ...effect.style, displayDuration } })
            }
          />
          <ToggleControl
            label="Keyboard Sound"
            checked={effect.sound.enabled}
            onChange={enabled =>
              update({ ...effect, sound: { ...effect.sound, enabled } })
            }
          />
        </>
      ) : null}
      {effect.kind === 'subtitle' ? (
        <>
          <SelectControl
            label="Position"
            value={effect.style.position}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'bottom', label: 'Bottom' },
            ]}
            onChange={position =>
              update({ ...effect, style: { ...effect.style, position } })
            }
          />
          <SelectControl
            label="Background"
            value={effect.style.backgroundColor}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'none', label: 'None' },
            ]}
            onChange={backgroundColor =>
              update({ ...effect, style: { ...effect.style, backgroundColor } })
            }
          />
          <NumberControl
            label="Opacity"
            value={effect.style.opacity}
            minimum={0}
            maximum={1}
            step={0.05}
            onChange={opacity =>
              update({ ...effect, style: { ...effect.style, opacity } })
            }
          />
        </>
      ) : null}
      {effect.kind === 'wallpaper' ? (
        <>
          <NumberControl
            label="Padding"
            value={effect.padding}
            minimum={0}
            maximum={40}
            onChange={padding => update({ ...effect, padding })}
          />
          <NumberControl
            label="Corners"
            value={effect.corners}
            minimum={0}
            maximum={100}
            onChange={corners => update({ ...effect, corners })}
          />
          <NumberControl
            label="Shadow"
            value={effect.shadow}
            minimum={0}
            maximum={100}
            onChange={shadow => update({ ...effect, shadow })}
          />
        </>
      ) : null}
      {effect.kind === 'annotation' ? (
        <p className="text-muted-foreground text-xs">
          {effect.annotations.length === 0
            ? 'Use direct manipulation in the viewer to add the first drawing.'
            : `${effect.annotations.length} annotations in this timed lane.`}
        </p>
      ) : null}
      {dataKind && dataLocator ? (
        <section className="border-border space-y-2 rounded-md border p-2">
          <h3 className="text-xs font-medium">Source Data</h3>
          {dataValue?.kind === 'subtitles' && dataValue.value.segments[0] ? (
            <label className="block space-y-1 text-xs">
              <span>First Subtitle</span>
              <textarea
                aria-label="First Subtitle"
                value={dataValue.value.segments[0].text}
                className="border-input bg-background min-h-16 w-full rounded-md border p-2"
                onChange={event => {
                  const value = structuredClone(dataValue);
                  value.value.segments[0].text = event.target.value;
                  setDataValue(value);
                }}
              />
            </label>
          ) : null}
          {dataValue?.kind === 'cursor' && dataValue.value.events[0] ? (
            <div className="space-y-2">
              <NumberControl
                label="First Event X"
                value={dataValue.value.events[0].x}
                minimum={0}
                maximum={1}
                step={0.01}
                onChange={x => {
                  const value = structuredClone(dataValue);
                  value.value.events[0].x = x;
                  setDataValue(value);
                }}
              />
              <NumberControl
                label="First Event Y"
                value={dataValue.value.events[0].y}
                minimum={0}
                maximum={1}
                step={0.01}
                onChange={y => {
                  const value = structuredClone(dataValue);
                  value.value.events[0].y = y;
                  setDataValue(value);
                }}
              />
            </div>
          ) : null}
          {dataValue ? (
            <p className="text-muted-foreground text-xs">
              {dataValue.kind === 'cursor'
                ? `${dataValue.value.events.length} cursor events`
                : dataValue.kind === 'keyboard'
                  ? `${dataValue.value.events.length} keyboard events`
                  : `${dataValue.value.segments.length} subtitle segments`}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-1">
            {effect.kind === 'cursor' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void importCursorData()}
              >
                Import Cursor
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => void loadData()}>
              Load
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!dataValue}
              onClick={() => void saveData()}
            >
              Save Copy
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                dataLocator.kind !== 'v2-data' || !dataLocator.provenance
              }
              onClick={() => void mutateData('reset')}
            >
              Reset to V1
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void mutateData('delete')}
            >
              Delete Data
            </Button>
          </div>
          {dataStatus ? (
            <p role="status" className="text-muted-foreground text-xs">
              {dataStatus}
            </p>
          ) : null}
        </section>
      ) : null}
      <Button
        variant="destructive"
        size="sm"
        className="w-full gap-2"
        onClick={remove}
      >
        <Trash2 className="size-3.5" />
        Remove effect
      </Button>
    </div>
  );
}
