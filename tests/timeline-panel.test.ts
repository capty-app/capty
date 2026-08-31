import * as React from 'react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
    useRef: (value: unknown) => ({ current: value }),
  };
});

vi.mock(
  '@/renderer/components/video-editor/hooks/use-resizable-height',
  () => ({
    useResizableHeight: () => ({
      height: 400,
      isResizing: false,
      startResize: vi.fn(),
    }),
  })
);

function getEqualizerTrackElement(root: ReactElement): ReactElement {
  const rootChildren = root.props.children as ReactElement[];
  const provider = rootChildren[1];
  const providerChildren = provider.props.children as ReactElement[];
  const scrollContainer = providerChildren[2];
  const timelineTracks = scrollContainer.props.children as ReactElement;
  const rows = timelineTracks.props.children as ReactElement[];
  return rows[2];
}

describe('TimelinePanel equalizer creation selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('React', React);
  });

  it('routes added and duplicated clips through coordinated selection', async () => {
    const handleAddEqualizer = vi.fn(() => 'added-equalizer');
    const handleDuplicateEqualizer = vi.fn(() => 'duplicated-equalizer');
    const onEqualizerSelect = vi.fn();
    const { default: TimelinePanel } =
      await import('@/renderer/components/video-editor/timeline/timeline-panel');

    const root = TimelinePanel({
      zoom: {},
      playback: {
        isPlaying: false,
        timelinePosition: 0,
        playheadPosition: 0,
        totalTimelineDuration: 10,
        seekToTimelinePosition: vi.fn(),
        togglePlayPause: vi.fn(),
      },
      segments: [],
      segmentOps: {
        selectedSegmentId: null,
        selectedSegmentSpeed: 1,
        isCutToolActive: false,
        trimState: null,
        handleTrimStart: vi.fn(),
        handleTrimResize: vi.fn(),
        handleTrimEnd: vi.fn(),
        handleCut: vi.fn(),
        handleReorderSegment: vi.fn(),
        toggleCutTool: vi.fn(),
        handleDeleteSegment: vi.fn(),
        handleSpeedChange: vi.fn(),
      },
      zoomControl: {
        zoomSegments: [],
        selectedZoomId: null,
        handleUpdateZoom: vi.fn(),
        handleCommitZoomGesture: vi.fn(),
        handleAddZoom: vi.fn(),
        handleUpdateZoomLevel: vi.fn(),
        handleDeleteZoom: vi.fn(),
        handleApplyZoomToAll: vi.fn(),
        handleDeleteOtherZooms: vi.fn(),
      },
      drawingControl: {
        drawingSegments: [],
        selectedDrawingIds: [],
      },
      musicControl: {
        musicTracks: [],
        selectedMusicTrackId: null,
      },
      equalizerControl: {
        equalizerSegments: [],
        selectedEqualizerId: null,
        handleUpdateEqualizerTime: vi.fn(),
        handleCommitEqualizerGesture: vi.fn(),
        handleAddEqualizer,
        handleDuplicateEqualizer,
        handleDeleteEqualizer: vi.fn(),
      },
      displayTimelineDuration: 10,
      originalDuration: 10,
      timelineRef: { current: null },
      onSegmentSelect: vi.fn(),
      onZoomSelect: vi.fn(),
      onDrawingSelect: vi.fn(),
      onMusicSelect: vi.fn(),
      onEqualizerSelect,
      onPreviewSeek: vi.fn(),
      onFitToView: vi.fn(),
      scrubAudioEnabled: false,
      onScrubAudioChange: vi.fn(),
      isScrubAudioAvailable: false,
    } as never) as ReactElement;
    const equalizerTrack = getEqualizerTrackElement(root);

    equalizerTrack.props.onAdd(1, 3);
    equalizerTrack.props.onDuplicate('source-equalizer');

    expect(handleAddEqualizer).toHaveBeenCalledWith(1, 3);
    expect(handleDuplicateEqualizer).toHaveBeenCalledWith('source-equalizer');
    expect(onEqualizerSelect).toHaveBeenNthCalledWith(1, 'added-equalizer');
    expect(onEqualizerSelect).toHaveBeenNthCalledWith(
      2,
      'duplicated-equalizer'
    );
  });
});
