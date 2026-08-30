import type { MusicTrack } from '@/types/music';

export const SYSTEM_TRACK_ID = 'system-audio';
export const MIC_TRACK_ID = 'mic-audio';

export interface BuildBuiltInMusicTracksParams {
  systemAudioPath: string | null;
  micAudioPath: string | null;
  hasEmbeddedAudio: boolean;
  originalDuration: number;
}

export const buildBuiltInMusicTracks = ({
  systemAudioPath,
  micAudioPath,
  hasEmbeddedAudio,
  originalDuration,
}: BuildBuiltInMusicTracksParams): MusicTrack[] => {
  if (originalDuration <= 0) return [];

  const builtIn: MusicTrack[] = [];

  if (systemAudioPath || hasEmbeddedAudio) {
    builtIn.push({
      id: SYSTEM_TRACK_ID,
      name: hasEmbeddedAudio && !systemAudioPath ? 'Audio' : 'System Audio',
      source: 'system',
      fileName: '',
      volume: 1,
      enabled: true,
      startTime: 0,
      endTime: originalDuration,
      originalDuration,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
    });
  }

  if (micAudioPath) {
    builtIn.push({
      id: MIC_TRACK_ID,
      name: 'Microphone',
      source: 'mic',
      fileName: '',
      volume: 1,
      enabled: true,
      startTime: 0,
      endTime: originalDuration,
      originalDuration,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
    });
  }

  return builtIn;
};
