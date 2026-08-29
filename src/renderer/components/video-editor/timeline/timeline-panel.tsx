import { useMemo, useRef } from 'react';
import type { Segment } from '../types';
import type { usePlaybackControl } from '../hooks/use-playback-control';
import type { useSegmentOperations } from '../hooks/use-segment-operations';
import type { useZoomSegments } from '../hooks/use-zoom-segments';
import type { useDrawingSegments } from '../hooks/use-drawing-segments';
import type { useMusicTracks } from '../hooks/use-music-tracks';
import type { useEqualizerSegments } from '../hooks/use-equalizer-segments';
import { useResizableHeight } from '../hooks/use-resizable-height';
import type { UseTimelineZoomReturn } from './use-timeline-zoom';
import { TimelineProvider } from './timeline-context';
import TimelineControls from './timeline-controls';
import TimelineRuler from './timeline-ruler';
import TimelineTracks from './timeline-tracks';
import TimelineTrack from './timeline-track';
import ZoomTrack from './zoom-track';
import DrawingTrack from './drawing-track';
import MusicTrack from './music-track';
import EqualizerTrack from './equalizer-track';
import TimelineResizeGrip from './timeline-resize-grip';
import TrackRow, { TRACK_HEIGHT, VIDEO_TRACK_HEIGHT } from './track-row';

const TIMELINE_SCROLLBAR_HEIGHT = 12;
const ROW_GAP = 8;
const TRACKS_TOP_PADDING = 16;
const TRACKS_BOTTOM_PADDING = 8;

function tracksHeightForRows(rowCount: number): number {
  return (
    TRACKS_TOP_PADDING +
    VIDEO_TRACK_HEIGHT +
    (rowCount - 1) * (TRACK_HEIGHT + ROW_GAP) +
    TRACKS_BOTTOM_PADDING +
    TIMELINE_SCROLLBAR_HEIGHT
  );
}

const minTimelineHeight = tracksHeightForRows(3);
const defaultTimelineHeight = tracksHeightForRows(5);
const maxTimelineHeight = tracksHeightForRows(11);

interface TimelinePanelProps {
  zoom: UseTimelineZoomReturn;
  playback: ReturnType<typeof usePlaybackControl>;
  segments: Segment[];
  segmentOps: ReturnType<typeof useSegmentOperations>;
  zoomControl: ReturnType<typeof useZoomSegments>;
  drawingControl: ReturnType<typeof useDrawingSegments>;
  musicControl: ReturnType<typeof useMusicTracks>;
  equalizerControl: ReturnType<typeof useEqualizerSegments>;
  displayTimelineDuration: number;
  originalDuration: number;
  systemAudioPath?: string | null;
  micAudioPath?: string | null;
  timelineRef: React.RefObject<HTMLDivElement>;
  onSegmentSelect: (id: string | null) => void;
  onZoomSelect: (id: string | null) => void;
  onDrawingSelect: (id: string | null) => void;
  onMusicSelect: (id: string | null) => void;
  onEqualizerSelect: (id: string | null) => void;
  onPreviewSeek: (tlPos: number | null) => void;
  onFitToView: () => void;
  scrubAudioEnabled: boolean;
  onScrubAudioChange: (enabled: boolean) => void;
  isScrubAudioAvailable: boolean;
}

interface TimelineRow {
  key: string;
  node: React.ReactNode;
}

export default function TimelinePanel({
  zoom,
  playback,
  segments,
  segmentOps,
  zoomControl,
  drawingControl,
  musicControl,
  equalizerControl,
  displayTimelineDuration,
  originalDuration,
  systemAudioPath,
  micAudioPath,
  timelineRef,
  onSegmentSelect,
  onZoomSelect,
  onDrawingSelect,
  onMusicSelect,
  onEqualizerSelect,
  onPreviewSeek,
  onFitToView,
  scrubAudioEnabled,
  onScrubAudioChange,
  isScrubAudioAvailable,
}: TimelinePanelProps) {
  const verticalScrollRef = useRef<HTMLDivElement>(null);

  const {
    height: timelineHeight,
    isResizing: isResizingTimeline,
    startResize: startTimelineResize,
  } = useResizableHeight({
    storageKey: 'video-editor:timeline-height',
    defaultHeight: defaultTimelineHeight,
    minHeight: minTimelineHeight,
    maxHeight: maxTimelineHeight,
  });

  const videoWaveformSrc = systemAudioPath ?? micAudioPath ?? null;

  const rows = useMemo<TimelineRow[]>(() => {
    const videoRow: TimelineRow = {
      key: 'video',
      node: (
        <TimelineTrack
          key="video"
          segments={segments}
          selectedSegmentId={segmentOps.selectedSegmentId}
          isCutToolActive={segmentOps.isCutToolActive}
          trimState={segmentOps.trimState}
          onSegmentSelect={onSegmentSelect}
          onTrimStart={segmentOps.handleTrimStart}
          onTrimResize={segmentOps.handleTrimResize}
          onTrimEnd={segmentOps.handleTrimEnd}
          onCut={segmentOps.handleCut}
          onReorder={segmentOps.handleReorderSegment}
          onSeek={playback.seekToTimelinePosition}
          waveformSrc={videoWaveformSrc}
          originalDuration={originalDuration}
        />
      ),
    };

    const zoomRow: TimelineRow = {
      key: 'zoom',
      node: (
        <ZoomTrack
          key="zoom"
          segments={zoomControl.zoomSegments}
          totalDuration={playback.totalTimelineDuration}
          selectedId={zoomControl.selectedZoomId}
          onSelect={onZoomSelect}
          onResize={zoomControl.handleUpdateZoom}
          onMove={zoomControl.handleUpdateZoom}
          onGestureEnd={zoomControl.handleCommitZoomGesture}
          onAdd={zoomControl.handleAddZoom}
          onUpdateZoomLevel={zoomControl.handleUpdateZoomLevel}
          onDelete={zoomControl.handleDeleteZoom}
          onApplyToAll={zoomControl.handleApplyZoomToAll}
          onDeleteOthers={zoomControl.handleDeleteOtherZooms}
        />
      ),
    };

    const equalizerRow: TimelineRow = {
      key: 'equalizer',
      node: (
        <EqualizerTrack
          key="equalizer"
          segments={equalizerControl.equalizerSegments}
          totalDuration={playback.totalTimelineDuration}
          selectedId={equalizerControl.selectedEqualizerId}
          onSelect={onEqualizerSelect}
          onResize={equalizerControl.handleUpdateEqualizerTime}
          onMove={equalizerControl.handleUpdateEqualizerTime}
          onGestureEnd={equalizerControl.handleCommitEqualizerGesture}
          onAdd={equalizerControl.handleAddEqualizer}
          onDuplicate={equalizerControl.handleDuplicateEqualizer}
          onDelete={equalizerControl.handleDeleteEqualizer}
        />
      ),
    };

    const drawingRows: TimelineRow[] =
      drawingControl.drawingSegments.length === 0
        ? [
            {
              key: 'drawings',
              node: (
                <TrackRow key="drawings" className="group relative">
                  <div className="border-border text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border border-dashed text-xs opacity-0 transition-opacity group-hover:opacity-100">
                    Draw on the video to add annotations
                  </div>
                </TrackRow>
              ),
            },
          ]
        : drawingControl.drawingSegments.map(drawing => ({
            key: drawing.id,
            node: (
              <DrawingTrack
                key={drawing.id}
                segment={drawing}
                totalDuration={playback.totalTimelineDuration}
                selectedId={
                  drawingControl.selectedDrawingIds.includes(drawing.id)
                    ? drawing.id
                    : null
                }
                onSelect={onDrawingSelect}
                onResize={drawingControl.handleResizeDrawingSegment}
                onMove={drawingControl.handleMoveDrawingSegment}
                onGestureEnd={drawingControl.handleCommitDrawingGesture}
                onDelete={drawingControl.handleDeleteDrawingSegment}
              />
            ),
          }));

    const musicRows: TimelineRow[] = musicControl.musicTracks
      .filter(track => track.enabled)
      .map(track => ({
        key: track.id,
        node: (
          <MusicTrack
            key={track.id}
            track={track}
            totalDuration={playback.totalTimelineDuration}
            selectedId={musicControl.selectedMusicTrackId}
            onSelect={onMusicSelect}
            onResize={musicControl.handleResizeMusicTrack}
            onMove={musicControl.handleMoveMusicTrack}
            onGestureEnd={musicControl.handleCommitMusicGesture}
            onSpeedChange={(id, speed) =>
              musicControl.handleUpdateMusicTrack(id, { speed })
            }
            onDelete={musicControl.handleRemoveMusicTrack}
            waveformSrc={
              track.source === 'system'
                ? systemAudioPath
                : track.source === 'mic'
                  ? micAudioPath
                  : null
            }
          />
        ),
      }));

    return [videoRow, zoomRow, equalizerRow, ...drawingRows, ...musicRows];
  }, [
    segments,
    segmentOps,
    zoomControl,
    equalizerControl,
    drawingControl,
    musicControl,
    playback.totalTimelineDuration,
    playback.seekToTimelinePosition,
    onSegmentSelect,
    onZoomSelect,
    onDrawingSelect,
    onMusicSelect,
    onEqualizerSelect,
    videoWaveformSrc,
    originalDuration,
    systemAudioPath,
    micAudioPath,
  ]);

  return (
    <div className="bg-card border-border flex shrink-0 flex-col border-t">
      <TimelineResizeGrip
        isResizing={isResizingTimeline}
        onStartResize={startTimelineResize}
      />

      <TimelineProvider zoom={zoom} verticalScrollRef={verticalScrollRef}>
        <TimelineControls
          isPlaying={playback.isPlaying}
          isCutToolActive={segmentOps.isCutToolActive}
          hasSelectedSegment={segmentOps.selectedSegmentId !== null}
          canDeleteSegment={segments.length > 1}
          timelinePosition={playback.timelinePosition}
          totalTimelineDuration={playback.totalTimelineDuration}
          segmentCount={segments.length}
          selectedSegmentSpeed={segmentOps.selectedSegmentSpeed}
          onTogglePlayPause={playback.togglePlayPause}
          onToggleCutTool={segmentOps.toggleCutTool}
          onDeleteSegment={segmentOps.handleDeleteSegment}
          onSpeedChange={segmentOps.handleSpeedChange}
          onSeekRelative={delta =>
            playback.seekToTimelinePosition(
              Math.max(
                0,
                Math.min(
                  playback.totalTimelineDuration,
                  playback.timelinePosition + delta
                )
              )
            )
          }
          onFitToView={onFitToView}
          scrubAudioEnabled={scrubAudioEnabled}
          onScrubAudioChange={onScrubAudioChange}
          isScrubAudioAvailable={isScrubAudioAvailable}
        />

        <TimelineRuler
          totalDuration={playback.totalTimelineDuration}
          minDisplayDuration={displayTimelineDuration}
        />

        <div
          ref={verticalScrollRef}
          className="scrollbar-overlay-vertical flex items-start overflow-y-auto"
          style={{ height: timelineHeight }}
        >
          <TimelineTracks
            ref={timelineRef}
            totalDuration={playback.totalTimelineDuration}
            minDisplayDuration={displayTimelineDuration}
            playheadPosition={playback.playheadPosition}
            isPlaying={playback.isPlaying}
            isTrimming={segmentOps.trimState !== null}
            onPreviewSeek={onPreviewSeek}
          >
            {rows.map(row => row.node)}
          </TimelineTracks>
        </div>
      </TimelineProvider>
    </div>
  );
}
