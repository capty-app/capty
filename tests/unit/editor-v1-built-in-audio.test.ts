import { describe, expect, it } from 'vitest';
import {
  buildBuiltInMusicTracks,
  MIC_TRACK_ID,
  SYSTEM_TRACK_ID,
} from '@/editor-v1/built-in-audio';

describe('V1 built-in audio normalization', () => {
  it.each([
    {
      name: 'no audio',
      systemAudioPath: null,
      micAudioPath: null,
      hasEmbeddedAudio: false,
      expected: [],
    },
    {
      name: 'embedded only',
      systemAudioPath: null,
      micAudioPath: null,
      hasEmbeddedAudio: true,
      expected: [SYSTEM_TRACK_ID],
    },
    {
      name: 'external system only',
      systemAudioPath: '/system.wav',
      micAudioPath: null,
      hasEmbeddedAudio: false,
      expected: [SYSTEM_TRACK_ID],
    },
    {
      name: 'microphone only',
      systemAudioPath: null,
      micAudioPath: '/mic.wav',
      hasEmbeddedAudio: false,
      expected: [MIC_TRACK_ID],
    },
    {
      name: 'system and microphone',
      systemAudioPath: '/system.wav',
      micAudioPath: '/mic.wav',
      hasEmbeddedAudio: false,
      expected: [SYSTEM_TRACK_ID, MIC_TRACK_ID],
    },
    {
      name: 'embedded and microphone',
      systemAudioPath: null,
      micAudioPath: '/mic.wav',
      hasEmbeddedAudio: true,
      expected: [SYSTEM_TRACK_ID, MIC_TRACK_ID],
    },
  ])('preserves current $name precedence', input => {
    const tracks = buildBuiltInMusicTracks({
      ...input,
      originalDuration: 12,
    });

    expect(tracks.map(track => track.id)).toEqual(input.expected);
    expect(tracks.every(track => track.endTime === 12)).toBe(true);
  });

  it('uses the current embedded and external labels', () => {
    const embedded = buildBuiltInMusicTracks({
      systemAudioPath: null,
      micAudioPath: null,
      hasEmbeddedAudio: true,
      originalDuration: 10,
    });
    const external = buildBuiltInMusicTracks({
      systemAudioPath: '/system.wav',
      micAudioPath: null,
      hasEmbeddedAudio: true,
      originalDuration: 10,
    });

    expect(embedded[0].name).toBe('Audio');
    expect(external[0].name).toBe('System Audio');
  });

  it('returns no tracks for non-positive duration', () => {
    expect(
      buildBuiltInMusicTracks({
        systemAudioPath: '/system.wav',
        micAudioPath: '/mic.wav',
        hasEmbeddedAudio: true,
        originalDuration: 0,
      })
    ).toEqual([]);
  });
});
