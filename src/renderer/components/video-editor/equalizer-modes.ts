import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  Circle,
  Donut,
  FlipVertical,
  GripHorizontal,
} from 'lucide-react';
import type { EqualizerMode } from '@/types/equalizer';

interface EqualizerModeOption {
  value: EqualizerMode;
  label: string;
  icon: LucideIcon;
}

export const EQUALIZER_MODE_OPTIONS: EqualizerModeOption[] = [
  { value: 'spectrum', label: 'Bars', icon: BarChart3 },
  { value: 'circular', label: 'Circle', icon: Circle },
  { value: 'mirror', label: 'Mirror', icon: FlipVertical },
  { value: 'dots', label: 'Dots', icon: GripHorizontal },
  { value: 'ring', label: 'Ring', icon: Donut },
  { value: 'pulse', label: 'Pulse', icon: Activity },
];

export function getEqualizerModeLabel(mode: EqualizerMode): string {
  return (
    EQUALIZER_MODE_OPTIONS.find(option => option.value === mode)?.label ?? mode
  );
}
