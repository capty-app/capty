import React, { useEffect, useState } from 'react';

import { Button } from '@/renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog';
import type { EditorExportSettings } from '@/types/editor-v2';

interface ExportDialogProps {
  open: boolean;
  initialSettings: EditorExportSettings;
  onOpenChange: (open: boolean) => void;
  onStart: (settings: EditorExportSettings) => Promise<void>;
}

const FRAME_RATES = [
  { label: '60 fps', numerator: 60, denominator: 1 },
  { label: '30 fps', numerator: 30, denominator: 1 },
  { label: '25 fps', numerator: 25, denominator: 1 },
  { label: '24 fps', numerator: 24, denominator: 1 },
];

export default function ExportDialog({
  open,
  initialSettings,
  onOpenChange,
  onStart,
}: ExportDialogProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (open) setSettings(initialSettings);
  }, [initialSettings, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
          <DialogDescription>
            Export uses the same visual and audio timeline plans as preview.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <label className="grid gap-1 text-sm">
            Format
            <select
              aria-label="Export format"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={settings.format}
              onChange={event =>
                setSettings(current => ({
                  ...current,
                  format: event.currentTarget.value as EditorExportSettings['format'],
                }))
              }
            >
              <option value="mp4">MP4</option>
              <option value="gif">GIF</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Resolution
            <select
              aria-label="Export resolution"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={settings.resolution}
              onChange={event =>
                setSettings(current => ({
                  ...current,
                  resolution:
                    event.currentTarget.value as EditorExportSettings['resolution'],
                }))
              }
            >
              <option value="original">Original</option>
              <option value="4k">4K</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Frame rate
            <select
              aria-label="Export frame rate"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={`${settings.frameRate.numerator}/${settings.frameRate.denominator}`}
              onChange={event => {
                const [numerator, denominator] = event.currentTarget.value
                  .split('/')
                  .map(Number);
                setSettings(current => ({
                  ...current,
                  frameRate: { numerator, denominator },
                }));
              }}
            >
              {FRAME_RATES.map(frameRate => (
                <option
                  key={frameRate.label}
                  value={`${frameRate.numerator}/${frameRate.denominator}`}
                >
                  {frameRate.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Quality
            <select
              aria-label="Export quality"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={settings.quality}
              onChange={event =>
                setSettings(current => ({
                  ...current,
                  quality: event.currentTarget.value as EditorExportSettings['quality'],
                }))
              }
            >
              <option value="studio">Studio</option>
              <option value="social">Social</option>
              <option value="web">Web</option>
              <option value="web-low">Web Low</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.revealWhenComplete}
              onChange={event =>
                setSettings(current => ({
                  ...current,
                  revealWhenComplete: event.currentTarget.checked,
                }))
              }
            />
            Reveal in Finder when complete
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.uploadWhenComplete}
              onChange={event =>
                setSettings(current => ({
                  ...current,
                  uploadWhenComplete: event.currentTarget.checked,
                }))
              }
            />
            Upload when complete
          </label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={starting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={starting}
            onClick={() => {
              setStarting(true);
              void onStart(settings).finally(() => setStarting(false));
            }}
          >
            {starting ? 'Preparing…' : 'Start Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
