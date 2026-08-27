import { useMemo } from 'react';
import { Film, PenLine, ZoomIn } from 'lucide-react';
import { SOURCE_ICONS } from '@/types/music';
import type { Segment } from '../types';
import type { usePlaybackControl } from '../hooks/use-playback-control';
import type { useSegmentOperations } from '../hooks/use-segment-operations';
import type { useZoomSegments } from '../hooks/use-zoom-segments';
import type { useDrawingSegments } from '../hooks/use-drawing-segments';
import type { useMusicTracks } from '../hooks/use-music-tracks';
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
import TimelineTrackHeaders, {
  type TrackHeaderItem,
} from './timeline-track-headers';
import TimelineResizeGrip from './timeline-resize-grip';
import TrackRow, { TRACK_HEIGHT } from './track-row';

const TIMELINE_SCROLLBAR_HEIGHT = 12;
const MIN_TIMELINE_TRACKS = 3;
const MAX_TIMELINE_TRACKS = 12;
const DEFAULT_TIMELINE_TRACKS = 5;

const minTimelineHeight =
  MIN_TIMELINE_TRACKS * TRACK_HEIGHT + TIMELINE_SCROLLBAR_HEIGHT;
const maxTimelineHeight =
  MAX_TIMELINE_TRACKS * TRACK_HEIGHT + TIMELINE_SCROLLBAR_HEIGHT;
const defaultTimelineHeight =
  DEFAULT_TIMELINE_TRACKS * TRACK_HEIGHT + TIMELINE_SCROLLBAR_HEIGHT;

interface TimelinePanelProps {
  zoom: UseTimelineZoomReturn;
  playback: ReturnType<typeof usePlaybackControl>;
  segments: Segment[];
  segmentOps: ReturnType<typeof useSegmentOperations>;
  zoomControl: ReturnType<typeof useZoomSegments>;
  drawingControl: ReturnType<typeof useDrawingSegments>;
  musicControl: ReturnType<typeof useMusicTracks>;
  displayTimelineDuration: number;
  timelineRef: React.RefObject<HTMLDivElement>;
  onSegmentSelect: (id: string | null) => void;
  onZoomSelect: (id: string | null) => void;
  onDrawingSelect: (id: string | null) => void;
  onMusicSelect: (id: string | null) => void;
  onPreviewSeek: (tlPos: number | null) => void;
  onFitToView: () => void;
  scrubAudioEnabled: boolean;
  onScrubAudioChange: (enabled: boolean) => void;
  isScrubAudioAvailable: boolean;
}

interface TimelineRow extends TrackHeaderItem {
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
  displayTimelineDuration,
  timelineRef,
  onSegmentSelect,
  onZoomSelect,
  onDrawingSelect,
  onMusicSelect,
  onPreviewSeek,
  onFitToView,
  scrubAudioEnabled,
  onScrubAudioChange,
  isScrubAudioAvailable,
}: TimelinePanelProps) {
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

  const rows = useMemo<TimelineRow[]>(() => {
    const videoRow: TimelineRow = {
      key: 'video',
      icon: Film,
      tooltip: 'Video',
      node: (
        <TimelineTrack
          key="video"
          segments={segments}
          selectedSegmentId={segmentOps.selectedSegmentId}
          isCutToolActive={segmentOps.isCutToolActive}
          trimState={segmentOps.trimState}
          onSegmentSelect={onSegmentSelect}
          onTrimStart={segmentOps.handleTrimStart}
          onCut={segmentOps.handleCut}
          onReorder={segmentOps.handleReorderSegment}
          onSeek={playback.seekToTimelinePosition}
        />
      ),
    };

    const zoomRow: TimelineRow = {
      key: 'zoom',
      icon: ZoomIn,
      tooltip: 'Zoom',
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

    const drawingRows: TimelineRow[] =
      drawingControl.drawingSegments.length === 0
        ? [
            {
              key: 'drawings',
              icon: PenLine,
              tooltip: 'Drawings',
              node: <TrackRow key="drawings" />,
            },
          ]
        : drawingControl.drawingSegments.map(drawing => ({
            key: drawing.id,
            icon: PenLine,
            tooltip: 'Drawing',
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
        icon: SOURCE_ICONS[track.source],
        tooltip: track.name,
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
          />
        ),
      }));

    return [videoRow, zoomRow, ...drawingRows, ...musicRows];
  }, [
    segments,
    segmentOps,
    zoomControl,
    drawingControl,
    musicControl,
    playback.totalTimelineDuration,
    playback.seekToTimelinePosition,
    onSegmentSelect,
    onZoomSelect,
    onDrawingSelect,
    onMusicSelect,
  ]);

  return (
    <div className="bg-card border-border flex shrink-0 flex-col border-t">
      <TimelineResizeGrip
        isResizing={isResizingTimeline}
        onStartResize={startTimelineResize}
      />

      <TimelineProvider zoom={zoom}>
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
          id="timeline-container"
          className="scrollbar-overlay-vertical flex items-start overflow-y-auto"
          style={{ height: timelineHeight }}
        >
          <TimelineTrackHeaders headers={rows} />
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
