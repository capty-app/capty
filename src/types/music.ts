export type AudioTrackSource = 'system' | 'mic' | 'music';

export interface MusicTrack {
  id: string;
  name: string;
  source: AudioTrackSource;
  fileName: string;
  volume: number;
  enabled: boolean;
  startTime: number;
  endTime: number;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  speed: number;
}

export const DEFAULT_MUSIC_TRACK_VOLUME = 0.8;

export const SUPPORTED_MUSIC_EXTENSIONS = ['mp3', 'm4a', 'wav', 'aac', 'ogg'];
