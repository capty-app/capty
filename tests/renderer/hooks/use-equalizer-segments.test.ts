import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EqualizerSegment } from '@/types/equalizer';
import { DEFAULT_EQUALIZER_SETTINGS } from '@/types/equalizer';

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  setWithoutHistory: vi.fn(),
  commit: vi.fn(),
  setSelectedId: vi.fn(),
  activateSidebarTab: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: vi.fn(),
  useMemo: (callback: () => unknown) => callback(),
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, mocks.setSelectedId],
}));

function createSegment(
  id: string,
  startTime: number,
  endTime: number
): EqualizerSegment {
  return {
    ...DEFAULT_EQUALIZER_SETTINGS,
    enabled: true,
    id,
    startTime,
    endTime,
  };
}

async function useControl(segments: EqualizerSegment[], duration = 10) {
  const { useEqualizerSegments } =
    await import('@/renderer/components/video-editor/hooks/use-equalizer-segments');
  return useEqualizerSegments({
    totalTimelineDuration: duration,
    activateSidebarTab: mocks.activateSidebarTab,
    slice: {
      value: segments,
      set: mocks.set,
      setWithoutHistory: mocks.setWithoutHistory,
      commit: mocks.commit,
    },
  });
}

describe('useEqualizerSegments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('crypto', { randomUUID: () => 'new-equalizer' });
  });

  it('creates and selects a full-duration clip when enabled', async () => {
    const control = await useControl([], 12);

    control.handleSetEnabled(true);

    expect(mocks.set).toHaveBeenCalledOnce();
    const updater = mocks.set.mock.calls[0][0] as (
      previous: EqualizerSegment[]
    ) => EqualizerSegment[];
    expect(updater([])).toEqual([
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        enabled: true,
        id: 'new-equalizer',
        startTime: 0,
        endTime: 12,
      },
    ]);
    expect(mocks.setSelectedId).toHaveBeenCalledWith('new-equalizer');
    expect(mocks.activateSidebarTab).toHaveBeenCalledWith('audio');
  });

  it('rejects added, moved, and resized clips that overlap another clip', async () => {
    const segments = [
      createSegment('first', 0, 3),
      createSegment('second', 5, 8),
    ];
    const control = await useControl(segments);

    control.handleAddEqualizer(2, 6);
    control.handleUpdateEqualizerTime('second', 2.5, 6);

    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.setWithoutHistory).not.toHaveBeenCalled();
  });

  it('updates only the requested clip settings without changing its timing', async () => {
    const segments = [
      createSegment('first', 0, 3),
      createSegment('second', 5, 8),
    ];
    const control = await useControl(segments);
    const settings = {
      ...segments[0],
      mode: 'circular' as const,
      colorStart: '#ff0000',
    };

    control.handleUpdateEqualizer('first', settings);

    const updater = mocks.set.mock.calls[0][0] as (
      previous: EqualizerSegment[]
    ) => EqualizerSegment[];
    const updated = updater(segments);
    expect(updated[0]).toMatchObject({
      id: 'first',
      startTime: 0,
      endTime: 3,
      mode: 'circular',
      colorStart: '#ff0000',
    });
    expect(updated[1]).toBe(segments[1]);
  });

  it('commits one history entry after a valid timeline gesture', async () => {
    const segments = [createSegment('first', 0, 3)];
    const control = await useControl(segments);

    control.handleUpdateEqualizerTime('first', 1, 4);
    control.handleCommitEqualizerGesture();
    control.handleCommitEqualizerGesture();

    expect(mocks.setWithoutHistory).toHaveBeenCalledOnce();
    expect(mocks.commit).toHaveBeenCalledOnce();
  });
});
