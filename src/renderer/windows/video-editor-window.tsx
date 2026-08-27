import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  VideoTitleBar,
  NativeVideoPlayer,
  TimelinePanel,
  EditorSidebar,
  EditorSidebarTabs,
  useVideoHistory,
  useEditorHistory,
  useEditorStatePersistence,
  useVideoWallpaper,
  useEditorData,
  useZoomSegments,
  useDrawingSegments,
  useSegmentOperations,
  useVideoExport,
  useEditorShortcuts,
  usePlaybackControl,
  useTimelineZoom,
  useKeyboardSound,
  useSidebarShortcuts,
  useFirstFrame,
  useMusicTracks,
  buildBuiltInMusicTracks,
  useMusicPlayback,
  DEFAULT_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  MAX_PIXELS_PER_SECOND,
} from '@/renderer/components/video-editor';
import type { VideoEditorSidebarShortcuts } from '@/types/settings';
import type { MusicTrack as MusicTrackType } from '@/types/music';
import {
  DEFAULT_DRAWING_TOOL_SETTINGS,
  MIN_DRAWING_SEGMENT_DURATION,
} from '@/types/drawing';
import type { DrawingToolSettings, VideoDrawingTool } from '@/types/drawing';
import type {
  NativeVideoPlayerHandle,
  Segment,
  SidebarTab,
} from '@/renderer/components/video-editor';
import {
  PROJECT_EXTENSION,
  type VideoExportOptions,
  type ProjectRenameResult,
} from '@/types/video';
import {
  hasWallpaperEffect,
  DEFAULT_VIDEO_WALLPAPER,
  IOS_DEVICE_DEFAULT_WALLPAPER,
} from '@/types/video-wallpaper';
import { SVG_WALLPAPER_PRESETS } from '@/renderer/hooks/useWallpaperState';
import { adjustTimelineRangeSlices } from '@/renderer/components/video-editor/utils';

interface VideoEditorWindowProps {
  params: {
    filePath: string;
  };
}

const getFileNameFromPath = (filePath: string | null | undefined) => {
  if (!filePath) return '';
  const parts = filePath.split('/');

  const dirName = parts[parts.length - 2] || '';
  if (dirName.endsWith(PROJECT_EXTENSION)) {
    return dirName.slice(0, -PROJECT_EXTENSION.length);
  }

  const fullName = parts[parts.length - 1] || '';
  const lastDot = fullName.lastIndexOf('.');
  return lastDot > 0 ? fullName.substring(0, lastDot) : fullName;
};

const getProjectPath = (filePath: string | null | undefined) => {
  if (!filePath) return '';
  const parts = filePath.split('/');

  const dirName = parts[parts.length - 2] || '';
  if (dirName.endsWith(PROJECT_EXTENSION)) {
    return parts.slice(0, -1).join('/');
  }

  parts.pop();
  return parts.join('/');
};

export default function VideoEditorWindow({ params }: VideoEditorWindowProps) {
  const [filePath, setFilePath] = useState(params.filePath);
  const nativePlayerRef = useRef<NativeVideoPlayerHandle>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const isConfirming = useRef(false);

  const [originalDuration, setOriginalDuration] = useState(0);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('cursor');
  const [isScrubAudioEnabled, setIsScrubAudioEnabled] = useState(false);
  const [initialTimelineZoom, setInitialTimelineZoom] = useState(
    DEFAULT_PIXELS_PER_SECOND
  );
  const [sidebarShortcuts, setSidebarShortcuts] =
    useState<VideoEditorSidebarShortcuts | null>(null);
  const [drawingToolSettings, setDrawingToolSettings] =
    useState<DrawingToolSettings>(DEFAULT_DRAWING_TOOL_SETTINGS);
  const [textFocusNonce, setTextFocusNonce] = useState(0);

  const timelineZoomState = useTimelineZoom({
    initialPixelsPerSecond: initialTimelineZoom,
  });

  const activateSidebarTab = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    setIsSidebarOpen(true);
  }, []);

  const history = useEditorHistory();
  const { undo, redo, canUndo, canRedo } = history;

  const editorData = useEditorData({
    cursorStyleSlice: history.cursorStyle,
    cameraStyleSlice: history.cameraStyle,
    keyboardStyleSlice: history.keyboardStyle,
    subtitleStyleSlice: history.subtitleStyle,
    audioStyleSlice: history.audioStyle,
  });

  const {
    segments,
    setSegments,
    setSegmentsWithoutHistory,
    commitSegmentsToHistory,
  } = useVideoHistory(history.segments);

  const firstFrameControl = useFirstFrame(history.firstFrame);

  const {
    wallpaper,
    setEnabled: setWallpaperEnabled,
    setGradient: setWallpaperGradient,
    setBackgroundImage: setWallpaperBackgroundImage,
    setPadding: setWallpaperPadding,
    setCorners: setWallpaperCorners,
    setShadow: setWallpaperShadow,
    setAspectRatio: setWallpaperAspectRatio,
    setDeviceFrame: setWallpaperDeviceFrame,
  } = useVideoWallpaper(history.wallpaper);

  const videoExport = useVideoExport();
  const [uploadToCloud, setUploadToCloud] = useState(false);
  const [cloudConfigured, setCloudConfigured] = useState(false);

  useEffect(() => {
    const refreshCloudConfigured = () => {
      window.ipcRenderer
        .invoke('cloud:isConfigured')
        .then((configured: boolean) => setCloudConfigured(configured))
        .catch(() => setCloudConfigured(false));
    };

    refreshCloudConfigured();
    window.addEventListener('focus', refreshCloudConfigured);
    return () => window.removeEventListener('focus', refreshCloudConfigured);
  }, []);

  const previewFrameRate = useMemo(() => {
    const parsed = parseInt(videoExport.exportSettings.frameRate, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }, [videoExport.exportSettings.frameRate]);

  const activeFirstFrameDuration =
    firstFrameControl.firstFrame.enabled &&
    firstFrameControl.firstFrame.imageData
      ? 1 / previewFrameRate
      : 0;

  const playback = usePlaybackControl({
    nativePlayerRef,
    segments,
    firstFrameDuration: activeFirstFrameDuration,
  });

  const keyboardSound = useKeyboardSound({
    keyboardData: editorData.keyboardData,
    segments,
    enabled: editorData.audioStyle.keyboardSoundEnabled,
    volume: editorData.audioStyle.keyboardSoundVolume,
    soundType: editorData.audioStyle.keyboardSoundType,
    isPlaying: playback.isPlaying,
    timelinePosition: playback.effectiveTimelinePosition,
  });

  const zoomControl = useZoomSegments({
    totalTimelineDuration: playback.totalTimelineDuration,
    activateSidebarTab,
    segmentsSlice: history.zoomSegments,
    settingsSlice: history.zoomSettings,
  });

  const drawingControl = useDrawingSegments({
    totalTimelineDuration: playback.totalTimelineDuration,
    slice: history.drawingSegments,
  });

  const musicControl = useMusicTracks({
    totalTimelineDuration: playback.totalTimelineDuration,
    slice: history.musicTracks,
  });

  useMusicPlayback({
    musicTracks: musicControl.musicTracks,
    timelinePosition: playback.effectiveTimelinePosition,
    isPlaying: playback.isPlaying,
    systemAudioPath: editorData.systemAudioPath,
    micAudioPath: editorData.micAudioPath,
  });

  const handleTimelineRangesAdjust = useCallback(
    (
      _segmentIndex: number,
      oldSegmentDuration: number,
      newSegmentDuration: number,
      segmentStartOnTimeline: number,
      segmentEndOnTimeline: number,
      newTotalDuration: number,
      nextSegments: Segment[]
    ) => {
      const adjustment = {
        oldSegmentDuration,
        newSegmentDuration,
        segmentStartOnTimeline,
        segmentEndOnTimeline,
        newTotalDuration,
      };

      history.replaceDocument(
        adjustTimelineRangeSlices({
          nextSegments,
          zoomSegments: zoomControl.zoomSegments,
          drawingSegments: drawingControl.drawingSegments,
          adjustment,
          drawingMinDuration: MIN_DRAWING_SEGMENT_DURATION,
        })
      );
    },
    [drawingControl.drawingSegments, history, zoomControl.zoomSegments]
  );

  const segmentOps = useSegmentOperations({
    segments,
    setSegments,
    setSegmentsWithoutHistory,
    commitSegmentsToHistory,
    totalTimelineDuration: playback.totalTimelineDuration,
    nativePlayerRef,
    setTimelinePosition: playback.setTimelinePosition,
    onTimelineRangesAdjust: handleTimelineRangesAdjust,
  });

  const [displayTimelineDuration, setDisplayTimelineDuration] = useState(0);

  useEffect(() => {
    setDisplayTimelineDuration(0);
  }, [filePath]);

  useEffect(() => {
    setDisplayTimelineDuration(prev =>
      Math.max(prev, playback.totalTimelineDuration)
    );
  }, [playback.totalTimelineDuration]);

  const fileName = useMemo(() => getFileNameFromPath(filePath), [filePath]);
  const projectPath = useMemo(() => getProjectPath(filePath), [filePath]);

  const handleExport = useCallback(
    (options: VideoExportOptions) => {
      return videoExport.handleExport(options, {
        filePath,
        fileName,
        videoMetadata: editorData.videoMetadata,
        segments,
        wallpaper,
        zoomSegments: zoomControl.zoomSegments,
        zoomSettings: zoomControl.zoomSettings,
        drawingSegments: drawingControl.drawingSegments,
        cursorData: editorData.cursorData,
        cursorStyle: editorData.cursorStyle,
        cameraStyle: editorData.cameraStyle,
        cameraVideoPath: editorData.cameraVideoPath,
        systemAudioPath: editorData.systemAudioPath,
        micAudioPath: editorData.micAudioPath,
        audioStyle: editorData.audioStyle,
        hasEmbeddedAudio: editorData.hasEmbeddedAudio,
        keyboardData: editorData.keyboardData,
        keyboardStyle: editorData.keyboardStyle,
        subtitleData: editorData.subtitleData,
        subtitleStyle: editorData.subtitleStyle,
        firstFrame: firstFrameControl.firstFrame,
        musicTracks: musicControl.musicTracks,
        uploadToCloud,
      });
    },
    [
      videoExport,
      filePath,
      fileName,
      editorData,
      segments,
      wallpaper,
      zoomControl.zoomSegments,
      zoomControl.zoomSettings,
      drawingControl.drawingSegments,
      firstFrameControl.firstFrame,
      musicControl.musicTracks,
      uploadToCloud,
    ]
  );

  const handleDeleteVideo = useCallback(async () => {
    if (isConfirming.current) return;
    isConfirming.current = true;

    try {
      const confirmed = await window.ipcRenderer.invoke(
        'video-editor:confirmDelete'
      );

      if (confirmed) {
        window.ipcRenderer.send('video-editor:delete');
      }
    } finally {
      isConfirming.current = false;
    }
  }, []);

  const handleRename = useCallback(
    async (newName: string): Promise<string | null> => {
      const result = (await window.ipcRenderer.invoke(
        'project:rename',
        newName
      )) as ProjectRenameResult;

      if (!result.success) {
        return result.error ?? 'Failed to rename project';
      }

      setFilePath(result.newVideoPath);
      setVideoSrc(`file://${result.newVideoPath}`);
      return null;
    },
    []
  );

  const { loadedState, isStateLoaded, recordingType, resetState } =
    useEditorStatePersistence({
      isReady: originalDuration > 0,
      values: {
        segments,
        cursorStyle: editorData.cursorStyle,
        cameraStyle: editorData.cameraStyle,
        keyboardStyle: editorData.keyboardStyle,
        subtitleStyle: editorData.subtitleStyle,
        audioStyle: editorData.audioStyle,
        zoomSegments: zoomControl.zoomSegments,
        zoomSettings: zoomControl.zoomSettings,
        drawingSegments: drawingControl.drawingSegments,
        wallpaper,
        firstFrame: firstFrameControl.firstFrame,
        musicTracks: musicControl.musicTracks,
        exportSettings: videoExport.exportSettings,
        timelineZoom: timelineZoomState.pixelsPerSecond,
        sidebarOpen: isSidebarOpen,
        sidebarTab,
        scrubAudioEnabled: isScrubAudioEnabled,
      },
    });

  const handleReset = useCallback(async () => {
    if (isConfirming.current) return;
    isConfirming.current = true;

    try {
      const confirmed = await window.ipcRenderer.invoke(
        'video-editor:confirmReset'
      );

      if (confirmed) {
        const success = await resetState();
        if (success) {
          window.location.reload();
        }
      }
    } finally {
      isConfirming.current = false;
    }
  }, [resetState]);

  const handleEscape = useCallback(() => {
    segmentOps.clearSegmentSelection();
    zoomControl.clearZoomSelection();
    drawingControl.clearDrawingSelection();
    musicControl.clearMusicSelection();
  }, [segmentOps, zoomControl, drawingControl, musicControl]);

  const handleSegmentSelect = useCallback(
    (segmentId: string | null) => {
      segmentOps.handleSegmentSelect(segmentId);
      if (segmentId !== null) {
        zoomControl.clearZoomSelection();
        drawingControl.clearDrawingSelection();
        musicControl.clearMusicSelection();
      }
    },
    [segmentOps, zoomControl, drawingControl, musicControl]
  );

  const handleZoomSelect = useCallback(
    (id: string | null) => {
      zoomControl.handleZoomSelect(id);
      if (id !== null) {
        segmentOps.setSelectedSegmentId(null);
        drawingControl.clearDrawingSelection();
        musicControl.clearMusicSelection();
      }
    },
    [zoomControl, segmentOps, drawingControl, musicControl]
  );

  const handleDrawingSelect = useCallback(
    (id: string | null, addToSelection = false) => {
      drawingControl.handleSelectDrawingSegment(id, addToSelection);
      if (id !== null) {
        segmentOps.setSelectedSegmentId(null);
        zoomControl.clearZoomSelection();
        musicControl.clearMusicSelection();
        activateSidebarTab('drawing');
      }
    },
    [drawingControl, segmentOps, zoomControl, musicControl, activateSidebarTab]
  );

  const handleAnnotationAdded = useCallback((tool: VideoDrawingTool) => {
    setDrawingToolSettings(prev => ({ ...prev, activeTool: 'select' }));
    if (tool === 'text') {
      setTextFocusNonce(nonce => nonce + 1);
    }
  }, []);

  const handleMusicSelect = useCallback(
    (id: string | null) => {
      musicControl.handleSelectMusicTrack(id);
      if (id !== null) {
        segmentOps.setSelectedSegmentId(null);
        zoomControl.clearZoomSelection();
        drawingControl.clearDrawingSelection();
      }
    },
    [musicControl, segmentOps, zoomControl, drawingControl]
  );

  const getSegmentIndex = useCallback(
    (id: string) => segments.findIndex(s => s.id === id),
    [segments]
  );

  const handleFitToView = useCallback(() => {
    const container = timelineRef.current;
    const duration = playback.totalTimelineDuration;
    if (!container || duration <= 0) return;

    const target = container.clientWidth / duration;
    const clamped = Math.max(
      MIN_PIXELS_PER_SECOND,
      Math.min(MAX_PIXELS_PER_SECOND, target)
    );
    timelineZoomState.setZoomLevel(clamped);
    container.scrollLeft = 0;
  }, [playback.totalTimelineDuration, timelineZoomState]);

  const getTimelinePosition = useCallback(
    () => playback.timelinePosition,
    [playback.timelinePosition]
  );

  const getTotalTimelineDuration = useCallback(
    () => playback.totalTimelineDuration,
    [playback.totalTimelineDuration]
  );

  useEditorShortcuts({
    selectedSegmentId: segmentOps.selectedSegmentId,
    selectedZoomId: zoomControl.selectedZoomId,
    selectedDrawingId: drawingControl.selectedDrawingId,
    segmentsLength: segments.length,
    onDeleteSegment: segmentOps.handleDeleteSegment,
    onDeleteZoom: zoomControl.handleDeleteZoom,
    onDeleteDrawing: drawingControl.handleDeleteSelectedDrawings,
    onDeleteVideo: handleDeleteVideo,
    onTogglePlayPause: playback.togglePlayPause,
    onToggleCutTool: segmentOps.toggleCutTool,
    onUndo: undo,
    onRedo: redo,
    onEscape: handleEscape,
    onReorderSegment: segmentOps.handleReorderSegment,
    getSegmentIndex,
    activateSidebarTab,
    onTimelineZoomIn: timelineZoomState.zoomIn,
    onTimelineZoomOut: timelineZoomState.zoomOut,
    onTimelineZoomReset: timelineZoomState.resetZoom,
    onTimelineFitToView: handleFitToView,
    getTimelinePosition,
    getTotalTimelineDuration,
    onSeekTimeline: playback.seekToTimelinePosition,
  });

  useSidebarShortcuts({
    shortcuts: sidebarShortcuts ?? undefined,
    onTabChange: activateSidebarTab,
    isZoomDisabled: zoomControl.selectedZoomId === null,
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.ipcRenderer.invoke('settings:get');
        if (settings?.shortcuts?.videoEditorSidebar) {
          setSidebarShortcuts(settings.shortcuts.videoEditorSidebar);
        }
      } catch {
        // Ignore settings load errors, use defaults
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (fileName) {
      document.title = `${fileName} - Capty`;
    }
    return () => {
      document.title = 'Capty';
    };
  }, [fileName]);

  useEffect(() => {
    if (filePath) {
      if (/^(https?|blob|data|file):/.test(filePath)) {
        setVideoSrc(filePath);
      } else {
        setVideoSrc(`file://${filePath}`);
      }
    }
  }, [filePath]);

  useEffect(() => {
    if (
      editorData.videoMetadata?.duration &&
      editorData.videoMetadata.duration > 0
    ) {
      setOriginalDuration(editorData.videoMetadata.duration);
    }
  }, [editorData.videoMetadata]);

  useEffect(() => {
    if (
      originalDuration <= 0 ||
      !isStateLoaded ||
      !editorData.audioPathsLoaded ||
      segments.length > 0
    ) {
      return;
    }

    const defaultSegments = [
      {
        id: crypto.randomUUID(),
        originalStart: 0,
        originalEnd: originalDuration,
        trimMinStart: 0,
        trimMaxEnd: originalDuration,
      },
    ];

    const iosWallpaper = () => {
      const randomPreset =
        SVG_WALLPAPER_PRESETS[
          Math.floor(Math.random() * SVG_WALLPAPER_PRESETS.length)
        ];
      return {
        ...DEFAULT_VIDEO_WALLPAPER,
        ...IOS_DEVICE_DEFAULT_WALLPAPER,
        backgroundImage: randomPreset.imageUrl,
      };
    };

    const builtInTracks = buildBuiltInMusicTracks({
      systemAudioPath: editorData.systemAudioPath,
      micAudioPath: editorData.micAudioPath,
      hasEmbeddedAudio: editorData.hasEmbeddedAudio,
      originalDuration,
    });

    const mergeBuiltIns = (existing: MusicTrackType[]): MusicTrackType[] => {
      const missing = builtInTracks.filter(
        b => !existing.some(t => t.source === b.source)
      );
      return missing.length === 0 ? existing : [...missing, ...existing];
    };

    if (!loadedState) {
      history.initializeDocument({
        segments: defaultSegments,
        musicTracks: builtInTracks.length > 0 ? builtInTracks : undefined,
        wallpaper:
          recordingType === 'ios-device'
            ? iosWallpaper()
            : DEFAULT_VIDEO_WALLPAPER,
      });
      return;
    }

    const validSegments = loadedState.segments.filter(
      seg =>
        seg.originalStart >= 0 &&
        seg.originalEnd <= originalDuration &&
        seg.originalStart < seg.originalEnd
    );

    const mergedMusicTracks = mergeBuiltIns(loadedState.musicTracks ?? []);

    history.initializeDocument({
      segments: validSegments.length > 0 ? validSegments : defaultSegments,
      zoomSegments: loadedState.zoomSegments,
      zoomSettings: loadedState.zoomSettings,
      drawingSegments: loadedState.drawingSegments ?? [],
      musicTracks: mergedMusicTracks.length > 0 ? mergedMusicTracks : undefined,
      wallpaper: loadedState.wallpaper
        ? loadedState.wallpaper
        : recordingType === 'ios-device'
          ? iosWallpaper()
          : DEFAULT_VIDEO_WALLPAPER,
      firstFrame: loadedState.firstFrame ?? undefined,
      cursorStyle: loadedState.cursorStyle,
      cameraStyle: loadedState.cameraStyle,
      keyboardStyle: loadedState.keyboardStyle,
      subtitleStyle: loadedState.subtitleStyle,
      audioStyle: loadedState.audioStyle,
    });

    if (loadedState.exportSettings) {
      videoExport.restoreExportSettings(loadedState.exportSettings);
    }
    if (loadedState.timelineZoom) {
      setInitialTimelineZoom(loadedState.timelineZoom);
    }
    setIsSidebarOpen(loadedState.ui.sidebarOpen);
    setSidebarTab(loadedState.ui.sidebarTab);
    setIsScrubAudioEnabled(loadedState.ui.scrubAudioEnabled ?? false);
  }, [
    originalDuration,
    segments.length,
    isStateLoaded,
    loadedState,
    recordingType,
    history,
    videoExport,
    editorData.audioPathsLoaded,
    editorData.systemAudioPath,
    editorData.micAudioPath,
    editorData.hasEmbeddedAudio,
  ]);

  const handleLoadedMetadata = useCallback(() => {}, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const handlePreviewSeek = useCallback(
    (pos: number | null) => {
      if (pos === null) {
        playback.setPreviewTimelinePosition(prev => {
          if (prev === null) return null;

          playback.setTimelinePosition(prev);
          nativePlayerRef.current?.seekTo(prev);

          return null;
        });
        nativePlayerRef.current?.setPreviewTime(null);
        return;
      }

      playback.setPreviewTimelinePosition(pos);
      nativePlayerRef.current?.setPreviewTime(pos);
    },
    [playback, nativePlayerRef]
  );

  const hasScrubAudioSource =
    editorData.hasEmbeddedAudio ||
    !!editorData.systemAudioPath ||
    !!editorData.micAudioPath;

  useEffect(() => {
    if (hasScrubAudioSource) return;
    setIsScrubAudioEnabled(false);
  }, [hasScrubAudioSource]);

  const isEditorReady = isStateLoaded && segments.length > 0;

  if (!isEditorReady) {
    return null;
  }

  return (
    <div className="bg-background flex h-screen w-full flex-col pt-10 select-none">
      <VideoTitleBar
        fileName={fileName}
        projectPath={projectPath}
        onDelete={handleDeleteVideo}
        onUndo={undo}
        onRedo={redo}
        onReset={handleReset}
        canUndo={canUndo}
        canRedo={canRedo}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggleSidebar}
        isExporting={videoExport.isExporting}
        exportProgress={videoExport.exportProgress}
        onCancelExport={videoExport.handleCancelExport}
        onRename={handleRename}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <NativeVideoPlayer
              ref={nativePlayerRef}
              videoSrc={videoSrc}
              systemAudioEnabled={false}
              micAudioEnabled={false}
              hasEmbeddedAudio={false}
              segments={segments}
              width={editorData.videoMetadata?.width ?? 1920}
              height={editorData.videoMetadata?.height ?? 1080}
              fps={previewFrameRate}
              durationInSeconds={originalDuration}
              cursorData={editorData.cursorData}
              cursorStyle={editorData.cursorStyle}
              zoomSegments={zoomControl.zoomSegments}
              zoomSettings={zoomControl.zoomSettings}
              drawingSegments={drawingControl.drawingSegments}
              drawingToolSettings={
                sidebarTab === 'drawing' ? drawingToolSettings : null
              }
              drawingTimelinePosition={playback.effectiveTimelinePosition}
              selectedDrawingIds={drawingControl.selectedDrawingIds}
              onAddDrawingSegment={drawingControl.handleAddDrawingSegment}
              onSelectDrawing={handleDrawingSelect}
              onSelectMultipleDrawings={
                drawingControl.handleSelectMultipleDrawings
              }
              onSelectAllDrawings={drawingControl.handleSelectMultipleDrawings}
              onUpdateDrawingAnnotation={
                drawingControl.handleUpdateDrawingAnnotationLive
              }
              onUpdateDrawingAnnotationsMultiple={
                drawingControl.handleUpdateDrawingAnnotationsMultiple
              }
              onCommitDrawingGesture={drawingControl.handleCommitDrawingGesture}
              onAnnotationAdded={handleAnnotationAdded}
              cameraSrc={editorData.cameraSrc}
              cameraStyle={editorData.cameraStyle}
              cameraDurationInFrames={
                editorData.cameraData
                  ? Math.ceil(editorData.cameraData.meta.duration * 30)
                  : 0
              }
              keyboardData={editorData.keyboardData}
              keyboardStyle={editorData.keyboardStyle}
              subtitleData={editorData.subtitleData}
              subtitleStyle={editorData.subtitleStyle}
              wallpaper={wallpaper}
              firstFrame={firstFrameControl.firstFrame}
              scrubAudioEnabled={isScrubAudioEnabled}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={playback.handleTimeUpdate}
              onPlayingChange={playback.handlePlayingChange}
            />
          </div>

          <TimelinePanel
            zoom={timelineZoomState}
            playback={playback}
            segments={segments}
            originalDuration={originalDuration}
            systemAudioPath={editorData.systemAudioPath}
            micAudioPath={editorData.micAudioPath}
            segmentOps={segmentOps}
            zoomControl={zoomControl}
            drawingControl={drawingControl}
            musicControl={musicControl}
            displayTimelineDuration={displayTimelineDuration}
            timelineRef={timelineRef}
            onSegmentSelect={handleSegmentSelect}
            onZoomSelect={handleZoomSelect}
            onDrawingSelect={handleDrawingSelect}
            onMusicSelect={handleMusicSelect}
            onPreviewSeek={handlePreviewSeek}
            onFitToView={handleFitToView}
            scrubAudioEnabled={isScrubAudioEnabled}
            onScrubAudioChange={setIsScrubAudioEnabled}
            isScrubAudioAvailable={hasScrubAudioSource}
          />
        </div>

        <EditorSidebar
          isOpen={isSidebarOpen}
          activeTab={sidebarTab}
          cursorStyle={editorData.cursorStyle}
          onCursorStyleChange={editorData.setCursorStyle}
          hasCursorData={editorData.cursorData !== null}
          cursorData={editorData.cursorData}
          videoDuration={playback.totalTimelineDuration}
          videoWidth={editorData.videoMetadata?.width ?? 1920}
          videoHeight={editorData.videoMetadata?.height ?? 1080}
          onCursorDataSave={editorData.handleCursorDataSave}
          onCursorDataImport={editorData.handleCursorDataImport}
          selectedZoomId={zoomControl.selectedZoomId}
          zoomSegments={zoomControl.zoomSegments}
          zoomSettings={zoomControl.zoomSettings}
          onUpdateZoomSegment={zoomControl.handleUpdateZoomSegment}
          onUpdateZoomSettings={zoomControl.setZoomSettings}
          drawingSegments={drawingControl.drawingSegments}
          selectedDrawingId={drawingControl.selectedDrawingId}
          drawingToolSettings={drawingToolSettings}
          textFocusNonce={textFocusNonce}
          onDrawingToolSettingsChange={setDrawingToolSettings}
          onUpdateDrawingAnnotation={
            drawingControl.handleUpdateDrawingAnnotation
          }
          onDeleteDrawingSegment={drawingControl.handleDeleteDrawingSegment}
          videoSrc={videoSrc}
          timelinePosition={playback.effectiveTimelinePosition}
          cameraStyle={editorData.cameraStyle}
          onCameraStyleChange={editorData.setCameraStyle}
          hasCameraData={editorData.cameraData !== null}
          audioStyle={editorData.audioStyle}
          onAudioStyleChange={editorData.setAudioStyle}
          hasMicAudio={!!editorData.micAudioPath}
          hasKeyboardData={editorData.keyboardData !== null}
          musicTracks={musicControl.musicTracks}
          onAddMusicTrack={musicControl.handleAddMusicTrack}
          onRemoveMusicTrack={musicControl.handleRemoveMusicTrack}
          onUpdateMusicTrack={musicControl.handleUpdateMusicTrack}
          onPlayDemo={keyboardSound.playDemo}
          onStopDemo={keyboardSound.stopDemo}
          isDemoPlaying={keyboardSound.isDemoPlaying}
          keyboardStyle={editorData.keyboardStyle}
          onKeyboardStyleChange={editorData.setKeyboardStyle}
          subtitleStyle={editorData.subtitleStyle}
          onSubtitleStyleChange={editorData.setSubtitleStyle}
          subtitleData={editorData.subtitleData}
          onSubtitleGenerate={editorData.handleSubtitleGenerate}
          onSubtitleDelete={editorData.handleSubtitleDelete}
          onSubtitleDataSave={editorData.handleSubtitleDataSave}
          onSubtitleDataImport={editorData.handleSubtitleDataImport}
          wallpaper={wallpaper}
          onWallpaperEnabledChange={setWallpaperEnabled}
          onWallpaperGradientChange={setWallpaperGradient}
          onWallpaperBackgroundImageChange={setWallpaperBackgroundImage}
          onWallpaperPaddingChange={setWallpaperPadding}
          onWallpaperCornersChange={setWallpaperCorners}
          onWallpaperShadowChange={setWallpaperShadow}
          onWallpaperAspectRatioChange={setWallpaperAspectRatio}
          onWallpaperDeviceFrameChange={setWallpaperDeviceFrame}
          recordingType={recordingType}
          firstFrame={firstFrameControl.firstFrame}
          onFirstFrameImageChange={firstFrameControl.setImageData}
          onFirstFrameFitChange={firstFrameControl.setFit}
          exportSettings={videoExport.exportSettings}
          onExportSettingsChange={videoExport.setExportSettings}
          onExport={handleExport}
          isExporting={videoExport.isExporting}
          videoDurationSeconds={playback.totalTimelineDuration}
          hasWallpaper={hasWallpaperEffect(wallpaper)}
          uploadToCloud={uploadToCloud}
          onUploadToCloudChange={setUploadToCloud}
          cloudConfigured={cloudConfigured}
          cloudUploadState={videoExport.cloudUploadState}
          uploadedUrl={videoExport.uploadedUrl}
          onCopyUploadedUrl={videoExport.copyUploadedUrl}
          onCancelCloudUpload={videoExport.cancelCloudUpload}
        />

        <EditorSidebarTabs
          activeTab={sidebarTab}
          onTabChange={activateSidebarTab}
          isZoomDisabled={zoomControl.selectedZoomId === null}
          shortcuts={sidebarShortcuts ?? undefined}
        />
      </div>
    </div>
  );
}
