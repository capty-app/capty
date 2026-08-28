import { useState, useCallback, useEffect, useRef } from 'react';
import type { MusicTrack } from '@/types/music';
import { DEFAULT_MUSIC_TRACK_VOLUME } from '@/types/music';
import type { SliceController } from './use-editor-history';
import { resolveImportResult } from '../utils/import-result';
import { useToast } from '@/renderer/hooks/useToast';

interface UseMusicTracksProps {
  totalTimelineDuration: number;
  slice: SliceController<MusicTrack[]>;
}

interface UseMusicTracksReturn {
  musicTracks: MusicTrack[];
  setMusicTracks: (
    updater: MusicTrack[] | ((prev: MusicTrack[]) => MusicTrack[])
  ) => void;
  selectedMusicTrackId: string | null;
  handleAddMusicTrack: () => Promise<void>;
  handleRemoveMusicTrack: (id: string) => void;
  handleUpdateMusicTrack: (id: string, updates: Partial<MusicTrack>) => void;
  handleResizeMusicTrack: (
    id: string,
    startTime: number,
    endTime: number
  ) => void;
  handleMoveMusicTrack: (
    id: string,
    startTime: number,
    endTime: number
  ) => void;
  handleCommitMusicGesture: () => void;
  handleSelectMusicTrack: (id: string | null) => void;
  clearMusicSelection: () => void;
  getMusicTrackPath: (fileName: string) => Promise<string | null>;
}

export const SYSTEM_TRACK_ID = 'system-audio';
export const MIC_TRACK_ID = 'mic-audio';

interface BuildBuiltInTracksParams {
  systemAudioPath: string | null;
  micAudioPath: string | null;
  hasEmbeddedAudio: boolean;
  originalDuration: number;
}

export function buildBuiltInMusicTracks({
  systemAudioPath,
  micAudioPath,
  hasEmbeddedAudio,
  originalDuration,
}: BuildBuiltInTracksParams): MusicTrack[] {
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
}

export function useMusicTracks({
  totalTimelineDuration,
  slice,
}: UseMusicTracksProps): UseMusicTracksReturn {
  const { toast } = useToast();
  const {
    value: musicTracks,
    set: setMusicTracks,
    setWithoutHistory,
    commit,
  } = slice;

  const [selectedMusicTrackId, setSelectedMusicTrackId] = useState<
    string | null
  >(null);
  const gestureActiveRef = useRef(false);

  const musicTracksRef = useRef(musicTracks);
  useEffect(() => {
    musicTracksRef.current = musicTracks;
  }, [musicTracks]);

  useEffect(() => {
    if (totalTimelineDuration === 0) return;

    const needsUpdate = musicTracksRef.current.some(
      track =>
        track.startTime >= totalTimelineDuration ||
        track.endTime > totalTimelineDuration
    );
    if (!needsUpdate) return;

    setWithoutHistory(prev =>
      prev
        .filter(
          track =>
            track.source !== 'music' || track.startTime < totalTimelineDuration
        )
        .map(track => ({
          ...track,
          endTime: Math.min(track.endTime, totalTimelineDuration),
        }))
    );
  }, [totalTimelineDuration, setWithoutHistory]);

  const handleAddMusicTrack = useCallback(async () => {
    const fallbackError = 'The audio file could not be added.';
    const { result, error } = await resolveImportResult(
      () =>
        window.ipcRenderer.invoke('video-editor:music:add') as Promise<{
          success: boolean;
          fileName?: string;
          name?: string;
          originalDuration?: number;
          error?: string;
        }>,
      fallbackError
    );

    if (error) {
      toast({
        variant: 'error',
        title: "Couldn't add audio file",
        description: error,
      });
      return;
    }

    if (!result?.success || !result.fileName || !result.originalDuration) {
      return;
    }

    const playableDuration = result.originalDuration;
    const endTime = Math.min(playableDuration, totalTimelineDuration);

    const newTrack: MusicTrack = {
      id: crypto.randomUUID(),
      name: result.name ?? result.fileName,
      source: 'music',
      fileName: result.fileName,
      volume: DEFAULT_MUSIC_TRACK_VOLUME,
      enabled: true,
      startTime: 0,
      endTime,
      originalDuration: result.originalDuration,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
    };

    setMusicTracks(prev => [...prev, newTrack]);
  }, [totalTimelineDuration, setMusicTracks, toast]);

  const handleRemoveMusicTrack = useCallback(
    (id: string) => {
      const track = musicTracksRef.current.find(t => t.id === id);
      if (!track || track.source !== 'music') return;

      window.ipcRenderer
        .invoke('video-editor:music:remove', {
          fileName: track.fileName,
        })
        .catch(() => {});
      setMusicTracks(prev => prev.filter(t => t.id !== id));
      setSelectedMusicTrackId(prev => (prev === id ? null : prev));
    },
    [setMusicTracks]
  );

  const handleUpdateMusicTrack = useCallback(
    (id: string, updates: Partial<MusicTrack>) => {
      setMusicTracks(prev =>
        prev.map(track => (track.id === id ? { ...track, ...updates } : track))
      );
    },
    [setMusicTracks]
  );

  const handleResizeMusicTrack = useCallback(
    (id: string, startTime: number, endTime: number) => {
      gestureActiveRef.current = true;
      setWithoutHistory(prev =>
        prev.map(track => {
          if (track.id !== id) return track;

          const effectiveDuration =
            (track.originalDuration - track.trimStart - track.trimEnd) /
            track.speed;
          const maxEndTime = track.startTime + effectiveDuration;
          const clampedStart = Math.max(0, startTime);
          const clampedEnd = Math.min(
            endTime,
            maxEndTime,
            totalTimelineDuration
          );

          const startDelta = clampedStart - track.startTime;
          const endDelta = track.endTime - clampedEnd;

          const newTrimStart = Math.max(
            0,
            track.trimStart + startDelta * track.speed
          );
          const newTrimEnd = Math.max(
            0,
            track.trimEnd + endDelta * track.speed
          );

          return {
            ...track,
            startTime: clampedStart,
            endTime: clampedEnd,
            trimStart: newTrimStart,
            trimEnd: newTrimEnd,
          };
        })
      );
    },
    [totalTimelineDuration, setWithoutHistory]
  );

  const handleMoveMusicTrack = useCallback(
    (id: string, startTime: number, endTime: number) => {
      gestureActiveRef.current = true;
      setWithoutHistory(prev =>
        prev.map(track => {
          if (track.id !== id) return track;
          const duration = endTime - startTime;
          const maxStart = Math.max(0, totalTimelineDuration - duration);
          const clampedStart = Math.max(0, Math.min(startTime, maxStart));
          return {
            ...track,
            startTime: clampedStart,
            endTime: Math.min(clampedStart + duration, totalTimelineDuration),
          };
        })
      );
    },
    [totalTimelineDuration, setWithoutHistory]
  );

  const handleCommitMusicGesture = useCallback(() => {
    if (!gestureActiveRef.current) return;
    gestureActiveRef.current = false;
    commit();
  }, [commit]);

  const handleSelectMusicTrack = useCallback((id: string | null) => {
    setSelectedMusicTrackId(id);
  }, []);

  const clearMusicSelection = useCallback(() => {
    setSelectedMusicTrackId(null);
  }, []);

  const getMusicTrackPath = useCallback(
    async (fileName: string): Promise<string | null> => {
      return (await window.ipcRenderer.invoke('video-editor:music:get-path', {
        fileName,
      })) as string | null;
    },
    []
  );

  return {
    musicTracks,
    setMusicTracks,
    selectedMusicTrackId,
    handleAddMusicTrack,
    handleRemoveMusicTrack,
    handleUpdateMusicTrack,
    handleResizeMusicTrack,
    handleMoveMusicTrack,
    handleCommitMusicGesture,
    handleSelectMusicTrack,
    clearMusicSelection,
    getMusicTrackPath,
  };
}
