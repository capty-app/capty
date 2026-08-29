import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: vi.fn(),
  setMusicTracks: vi.fn(),
  setWithoutHistory: vi.fn(),
  commit: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: vi.fn(),
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
}));

vi.mock('@/renderer/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

describe('useMusicTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      ipcRenderer: { invoke: mocks.invoke },
    });
  });

  it('shows an error toast when adding music rejects', async () => {
    mocks.invoke.mockRejectedValue(new Error('IPC disconnected'));
    const { useMusicTracks } =
      await import('@/renderer/components/video-editor/hooks/use-music-tracks');
    const musicTracks = useMusicTracks({
      totalTimelineDuration: 30,
      slice: {
        value: [],
        set: mocks.setMusicTracks,
        setWithoutHistory: mocks.setWithoutHistory,
        commit: mocks.commit,
      },
    });

    await musicTracks.handleAddMusicTrack();

    expect(mocks.toast).toHaveBeenCalledWith({
      variant: 'error',
      title: "Couldn't add audio file",
      description: 'IPC disconnected',
    });
    expect(mocks.setMusicTracks).not.toHaveBeenCalled();
  });
});
