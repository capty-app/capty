import { Keyboard, Play, Plus, Square, Trash2 } from 'lucide-react';
import { Label } from '@/renderer/components/ui/label';
import { Slider } from '@/renderer/components/ui/slider';
import { Switch } from '@/renderer/components/ui/switch';
import { Button } from '@/renderer/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { SettingsPanelHeader } from './components';
import EqualizerSettingsSection from './equalizer-settings-section';
import { useStyleUpdater } from './hooks/use-style-updater';
import type { AudioStyle, KeyboardSoundType } from '@/types/audio';
import { KEYBOARD_SOUND_OPTIONS } from '@/types/audio';
import type { MusicTrack } from '@/types/music';
import type { EqualizerSettings } from '@/types/equalizer';
import { SOURCE_ICONS } from '@/types/music';
import {
  PLAYBACK_SPEED_PRESETS,
  formatPlaybackSpeed,
} from '@/types/playback-speed';

interface AudioSettingsPanelProps {
  audioStyle: AudioStyle;
  onStyleChange: (style: AudioStyle) => void;
  hasKeyboardData: boolean;
  onPlayDemo: () => void;
  onStopDemo: () => void;
  isDemoPlaying: boolean;
  musicTracks: MusicTrack[];
  equalizer: EqualizerSettings | null;
  isEqualizerLoading: boolean;
  hasEqualizerError: boolean;
  onEqualizerChange: (settings: EqualizerSettings) => void;
  onAddMusicTrack: () => void;
  onRemoveMusicTrack: (id: string) => void;
  onUpdateMusicTrack: (id: string, updates: Partial<MusicTrack>) => void;
}

export default function AudioSettingsPanel({
  audioStyle,
  onStyleChange,
  hasKeyboardData,
  onPlayDemo,
  onStopDemo,
  isDemoPlaying,
  musicTracks,
  equalizer,
  isEqualizerLoading,
  hasEqualizerError,
  onEqualizerChange,
  onAddMusicTrack,
  onRemoveMusicTrack,
  onUpdateMusicTrack,
}: AudioSettingsPanelProps) {
  const updateStyle = useStyleUpdater(audioStyle, onStyleChange);

  return (
    <div className="space-y-4 p-4">
      <SettingsPanelHeader
        title="Audio Tracks"
        description="Manage audio tracks in your project"
        action={
          <Button variant="ghost" size="icon-sm" onClick={onAddMusicTrack}>
            <Plus className="size-4" />
          </Button>
        }
      />

      {musicTracks.length === 0 && (
        <p className="text-muted-foreground text-xs">No audio tracks.</p>
      )}

      {musicTracks.map(track => {
        const Icon = SOURCE_ICONS[track.source];
        const isRemovable = track.source === 'music';

        return (
          <div key={track.id} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Icon className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate text-sm font-medium">
                  {track.name}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={track.enabled}
                  onCheckedChange={checked =>
                    onUpdateMusicTrack(track.id, { enabled: checked })
                  }
                />
                {isRemovable && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemoveMusicTrack(track.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {track.enabled && (
              <>
                <div className="flex items-center gap-3">
                  <Label className="text-muted-foreground w-12 shrink-0 text-xs">
                    Volume
                  </Label>
                  <Slider
                    value={[track.volume * 100]}
                    onValueChange={([value]) =>
                      onUpdateMusicTrack(track.id, { volume: value / 100 })
                    }
                    min={0}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground w-8 text-right text-xs">
                    {Math.round(track.volume * 100)}%
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Label className="text-muted-foreground w-12 shrink-0 text-xs">
                    Speed
                  </Label>
                  <Select
                    value={track.speed.toString()}
                    onValueChange={value =>
                      onUpdateMusicTrack(track.id, {
                        speed: parseFloat(value),
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAYBACK_SPEED_PRESETS.map(speed => (
                        <SelectItem key={speed} value={speed.toString()}>
                          {formatPlaybackSpeed(speed)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        );
      })}

      <EqualizerSettingsSection
        settings={equalizer}
        tracks={musicTracks}
        isLoading={isEqualizerLoading}
        hasError={hasEqualizerError}
        onChange={onEqualizerChange}
      />

      {hasKeyboardData && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Keyboard className="text-muted-foreground size-4" />
              <Label className="text-sm">Keyboard Sound</Label>
            </div>
            <Switch
              checked={audioStyle.keyboardSoundEnabled}
              onCheckedChange={checked =>
                updateStyle({ keyboardSoundEnabled: checked })
              }
            />
          </div>
          {audioStyle.keyboardSoundEnabled && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Select
                  value={audioStyle.keyboardSoundType}
                  onValueChange={(value: KeyboardSoundType) =>
                    updateStyle({ keyboardSoundType: value })
                  }
                >
                  <SelectTrigger size="sm" className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KEYBOARD_SOUND_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={isDemoPlaying ? onStopDemo : onPlayDemo}
                >
                  {isDemoPlaying ? (
                    <Square className="size-3.5" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  value={[audioStyle.keyboardSoundVolume * 100]}
                  onValueChange={([value]) =>
                    updateStyle({ keyboardSoundVolume: value / 100 })
                  }
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-muted-foreground w-8 text-right text-xs">
                  {Math.round(audioStyle.keyboardSoundVolume * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
