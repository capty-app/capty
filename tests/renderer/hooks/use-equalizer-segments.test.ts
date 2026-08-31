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

function getSetUpdaterResult(previous: EqualizerSegment[]) {
  const updater = mocks.set.mock.calls[0][0] as (
    previous: EqualizerSegment[]
  ) => EqualizerSegment[];
  return updater(previous);
}

describe('useEqualizerSegments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal('crypto', { randomUUID: () => 'new-equalizer' });
  });

  it('returns the created clip id on add for coordinated selection', async () => {
    const control = await useControl([], 12);

    const id = control.handleAddEqualizer(0, 12);

    expect(id).toBe('new-equalizer');
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(getSetUpdaterResult([])).toEqual([
      {
        ...DEFAULT_EQUALIZER_SETTINGS,
        id: 'new-equalizer',
        startTime: 0,
        endTime: 12,
      },
    ]);
    expect(mocks.setSelectedId).not.toHaveBeenCalled();
    expect(mocks.activateSidebarTab).not.toHaveBeenCalled();
  });

  it('rejects added, moved, and resized clips that overlap another clip', async () => {
    const segments = [
      createSegment('first', 0, 3),
      createSegment('second', 5, 8),
    ];
    const control = await useControl(segments);

    expect(control.handleAddEqualizer(2, 6)).toBeNull();
    control.handleUpdateEqualizerTime('second', 2.5, 6);

    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.setWithoutHistory).not.toHaveBeenCalled();
  });

  it('returns the duplicated clip id for coordinated selection', async () => {
    const segments = [createSegment('first', 0, 3)];
    const control = await useControl(segments);

    const id = control.handleDuplicateEqualizer('first');

    expect(id).toBe('new-equalizer');
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(getSetUpdaterResult(segments)).toEqual([
      segments[0],
      { ...segments[0], id: 'new-equalizer', startTime: 3, endTime: 6 },
    ]);
    expect(mocks.setSelectedId).not.toHaveBeenCalled();
    expect(mocks.activateSidebarTab).not.toHaveBeenCalled();
  });

  it('duplicates into the nearest free slot when the source end is taken', async () => {
    const segments = [
      createSegment('first', 0, 3),
      createSegment('second', 3, 6),
    ];
    const control = await useControl(segments);

    control.handleDuplicateEqualizer('first');

    expect(mocks.set).toHaveBeenCalledOnce();
    expect(getSetUpdaterResult(segments)).toEqual([
      segments[0],
      segments[1],
      {
        ...segments[0],
        id: 'new-equalizer',
        startTime: 6,
        endTime: 9,
      },
    ]);
  });

  it('does not duplicate a clip when no free slot fits it', async () => {
    const segments = [
      createSegment('first', 0, 5),
      createSegment('second', 5, 10),
    ];
    const control = await useControl(segments);

    expect(control.handleDuplicateEqualizer('first')).toBeNull();

    expect(mocks.set).not.toHaveBeenCalled();
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
