import { Mic, Music, Volume2 } from 'lucide-react';

import type { AudioTrackSource } from '@/types/music';

export const SOURCE_ICONS: Record<AudioTrackSource, typeof Volume2> = {
  system: Volume2,
  mic: Mic,
  music: Music,
};
