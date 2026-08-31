import { RotateCcw } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { Label } from '@/renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Slider } from '@/renderer/components/ui/slider';
import { cn } from '@/renderer/lib/utils';
import type { EqualizerSettings } from '@/types/equalizer';
import { DEFAULT_EQUALIZER_SETTINGS } from '@/types/equalizer';
import type { MusicTrack } from '@/types/music';
import { EQUALIZER_MODE_OPTIONS } from './equalizer-modes';

interface EqualizerSettingsSectionProps {
  settings: EqualizerSettings | null;
  tracks: MusicTrack[];
  isLoading: boolean;
  hasError: boolean;
  onChange: (settings: EqualizerSettings) => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix = '%',
  onChange,
}: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-muted-foreground w-20 shrink-0 text-xs">
        {label}
      </Label>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        className="flex-1"
        onValueChange={([nextValue]) => onChange(nextValue)}
      />
      <span className="text-muted-foreground w-10 text-right text-xs">
        {Math.round(value)}
        {suffix}
      </span>
    </div>
  );
}

export default function EqualizerSettingsSection({
  settings,
  tracks,
  isLoading,
  hasError,
  onChange,
}: EqualizerSettingsSectionProps) {
  const activeTracks = tracks.filter(track => track.enabled);
  const update = (changes: Partial<EqualizerSettings>) => {
    if (!settings) return;
    onChange({ ...settings, ...changes });
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <Label className="text-sm font-medium">Screen Equalizer</Label>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Add an audio-reactive visualizer from the timeline
        </p>
      </div>

      {activeTracks.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Add or enable an audio track to use the equalizer.
        </p>
      ) : null}

      {!settings ? (
        <p className="text-muted-foreground text-xs">
          Select an equalizer clip on the timeline or in the preview to edit it.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {EQUALIZER_MODE_OPTIONS.map(option => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors',
                    settings.mode === option.value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                  onClick={() => update({ mode: option.value })}
                >
                  <Icon className="size-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Audio source</Label>
            <Select
              value={
                settings.source === 'mix' ||
                activeTracks.some(track => track.id === settings.source)
                  ? settings.source
                  : 'mix'
              }
              onValueChange={source => update({ source })}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mix">Mixed Audio</SelectItem>
                {activeTracks.map(track => (
                  <SelectItem key={track.id} value={track.id}>
                    {track.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-muted-foreground text-xs">Start color</span>
              <span className="bg-muted flex h-8 items-center gap-2 rounded-md border px-2">
                <input
                  type="color"
                  value={settings.colorStart}
                  className="size-5 cursor-pointer border-0 bg-transparent p-0"
                  onChange={event => update({ colorStart: event.target.value })}
                />
                <span className="truncate text-xs uppercase">
                  {settings.colorStart}
                </span>
              </span>
            </label>
            <label className="space-y-1.5">
              <span className="text-muted-foreground text-xs">End color</span>
              <span className="bg-muted flex h-8 items-center gap-2 rounded-md border px-2">
                <input
                  type="color"
                  value={settings.colorEnd}
                  className="size-5 cursor-pointer border-0 bg-transparent p-0"
                  onChange={event => update({ colorEnd: event.target.value })}
                />
                <span className="truncate text-xs uppercase">
                  {settings.colorEnd}
                </span>
              </span>
            </label>
          </div>

          <SliderRow
            label="Sensitivity"
            value={settings.sensitivity * 100}
            min={50}
            max={200}
            step={1}
            onChange={value => update({ sensitivity: value / 100 })}
          />
          <SliderRow
            label="Opacity"
            value={settings.opacity * 100}
            min={10}
            max={100}
            step={1}
            onChange={value => update({ opacity: value / 100 })}
          />
          <SliderRow
            label="Backdrop"
            value={settings.backgroundOpacity * 100}
            min={0}
            max={80}
            step={1}
            onChange={value => update({ backgroundOpacity: value / 100 })}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {isLoading
                ? 'Analyzing audio...'
                : hasError
                  ? 'Audio could not be analyzed.'
                  : 'Drag and resize it directly on the video.'}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                onChange({
                  ...settings,
                  x: DEFAULT_EQUALIZER_SETTINGS.x,
                  y: DEFAULT_EQUALIZER_SETTINGS.y,
                  width: DEFAULT_EQUALIZER_SETTINGS.width,
                  height: DEFAULT_EQUALIZER_SETTINGS.height,
                })
              }
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
