import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { Loader2 } from 'lucide-react';
import type { CursorData, CursorStyle } from '@/types/cursor';
import type { ZoomSegment, ZoomSettings } from '@/types/zoom';
import type { CameraStyle } from '@/types/camera';
import type { KeyboardData, KeyboardStyle } from '@/types/keyboard';
import type { SubtitleData, SubtitleStyle } from '@/types/subtitle';
import type { VideoWallpaperSettings } from '@/types/video-wallpaper';
import type { FirstFrameSettings } from '@/types/first-frame';
import type { Annotation } from '@/types/editor';
import type {
  EqualizerSegment,
  EqualizerSettings,
  EqualizerTrackData,
} from '@/types/equalizer';
import type {
  DrawingSegment,
  DrawingToolSettings,
  VideoDrawingTool,
} from '@/types/drawing';
import { calculateWallpaperDimensions } from '@/types/video-wallpaper';
import { calculateDeviceFrameLayout } from './composition/device-frame-canvas-renderer';
import type { Segment, NativeVideoPlayerHandle } from './types';
import {
  getSegmentBoundaryTransition,
  getTotalTimelineDuration,
  timelineToVideo,
} from './utils';
import { VideoCompositionEngine } from './composition';
import VideoDrawingOverlay from './video-drawing-overlay';
import VideoEqualizerOverlay from './video-equalizer-overlay';

interface NativeVideoPlayerProps {
  videoSrc: string;
  systemAudioSrc?: string | null;
  micAudioSrc?: string | null;
  systemAudioEnabled?: boolean;
  micAudioEnabled?: boolean;
  systemAudioVolume?: number;
  micAudioVolume?: number;
  hasEmbeddedAudio?: boolean;
  segments: Segment[];
  width: number;
  height: number;
  fps: number;
  durationInSeconds: number;
  cursorData?: CursorData | null;
  cursorStyle?: CursorStyle | null;
  zoomSegments?: ZoomSegment[] | null;
  zoomSettings?: ZoomSettings | null;
  cameraSrc?: string | null;
  cameraStyle?: CameraStyle | null;
  cameraDurationInFrames?: number;
  keyboardData?: KeyboardData | null;
  keyboardStyle?: KeyboardStyle | null;
  subtitleData?: SubtitleData | null;
  subtitleStyle?: SubtitleStyle | null;
  wallpaper?: VideoWallpaperSettings | null;
  firstFrame?: FirstFrameSettings | null;
  equalizerSegments?: EqualizerSegment[] | null;
  activeEqualizer?: EqualizerSegment | null;
  selectedEqualizerId?: string | null;
  equalizerTracks?: EqualizerTrackData[] | null;
  onEqualizerSelect?: (id: string) => void;
  onEqualizerChange?: (settings: EqualizerSettings) => void;
  onEqualizerCommit?: () => void;
  drawingSegments?: DrawingSegment[] | null;
  drawingToolSettings?: DrawingToolSettings | null;
  drawingTimelinePosition?: number;
  selectedDrawingIds?: string[];
  onAddDrawingSegment?: (params: {
    annotation: Annotation;
    timelinePosition: number;
    canvasWidth: number;
    canvasHeight: number;
  }) => void;
  onSelectDrawing?: (id: string | null, addToSelection?: boolean) => void;
  onSelectMultipleDrawings?: (ids: string[]) => void;
  onSelectAllDrawings?: (ids: string[]) => void;
  onUpdateDrawingAnnotation?: (
    id: string,
    updates: Partial<Annotation>
  ) => void;
  onUpdateDrawingAnnotationsMultiple?: (
    updates: Array<{ id: string; updates: Partial<Annotation> }>
  ) => void;
  onCommitDrawingGesture?: () => void;
  onAnnotationAdded?: (tool: VideoDrawingTool) => void;
  scrubAudioEnabled?: boolean;
  onLoadedMetadata?: () => void;
  onTimeUpdate?: (timelinePosition: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

const NativeVideoPlayer = forwardRef<
  NativeVideoPlayerHandle,
  NativeVideoPlayerProps
>(
  (
    {
      videoSrc,
      systemAudioSrc = null,
      micAudioSrc = null,
      systemAudioEnabled = true,
      micAudioEnabled = true,
      systemAudioVolume = 1,
      micAudioVolume = 1,
      hasEmbeddedAudio = false,
      segments,
      width,
      height,
      fps,
      durationInSeconds: _durationInSeconds,
      cursorData = null,
      cursorStyle = null,
      zoomSegments = null,
      zoomSettings = null,
      cameraSrc = null,
      cameraStyle = null,
      keyboardData = null,
      keyboardStyle = null,
      subtitleData = null,
      subtitleStyle = null,
      wallpaper = null,
      firstFrame = null,
      equalizerSegments = null,
      activeEqualizer = null,
      selectedEqualizerId = null,
      equalizerTracks = null,
      onEqualizerSelect,
      onEqualizerChange,
      onEqualizerCommit,
      drawingSegments = null,
      drawingToolSettings = null,
      drawingTimelinePosition,
      selectedDrawingIds = [],
      onAddDrawingSegment,
      onSelectDrawing,
      onSelectMultipleDrawings,
      onSelectAllDrawings,
      onUpdateDrawingAnnotation,
      onUpdateDrawingAnnotationsMultiple,
      onCommitDrawingGesture,
      onAnnotationAdded,
      scrubAudioEnabled = false,
      onLoadedMetadata,
      onTimeUpdate,
      onPlayingChange,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const systemAudioRef = useRef<HTMLAudioElement>(null);
    const micAudioRef = useRef<HTMLAudioElement>(null);
    const cameraVideoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<VideoCompositionEngine | null>(null);
    const backgroundImageRef = useRef<HTMLImageElement | null>(null);
    const firstFrameImageRef = useRef<HTMLImageElement | null>(null);
    const drawingSegmentsRef = useRef<DrawingSegment[] | null>(null);
    const equalizerSegmentsRef = useRef<EqualizerSegment[] | null>(
      equalizerSegments
    );
    const equalizerTracksRef = useRef<EqualizerTrackData[] | null>(
      equalizerTracks
    );
    const isDrawingSelectModeRef = useRef(false);
    const lastCameraFrameRef = useRef<HTMLCanvasElement | null>(null);
    const lastVideoFrameRef = useRef<HTMLCanvasElement | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const systemGainRef = useRef<GainNode | null>(null);
    const micGainRef = useRef<GainNode | null>(null);
    const systemSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const micSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

    const [timelinePosition, setTimelinePosition] = useState(0);
    const [isEqualizerOverlaySelected, setIsEqualizerOverlaySelected] =
      useState(selectedEqualizerId !== null);
    const timelinePositionRef = useRef(0);
    const previewTimelinePositionRef = useRef<number | null>(null);
    const lastPreviewVideoTimeRef = useRef<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const scrubAudioEnabledRef = useRef(scrubAudioEnabled);
    const scrubAudioActiveRef = useRef(false);
    const scrubAudioRafRef = useRef<number | null>(null);
    const lastScrubUpdateRef = useRef<number | null>(null);

    const currentSegmentIndexRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);
    const pendingSeekRef = useRef<number | null>(null);
    const isSeekingRef = useRef(false);
    const firstFramePlaybackRef = useRef<{
      startWallTime: number;
      startTlPos: number;
    } | null>(null);

    const firstFrameDuration = useMemo(() => {
      if (!firstFrame?.enabled || !firstFrame.imageData) return 0;
      return fps > 0 ? 1 / fps : 0;
    }, [firstFrame?.enabled, firstFrame?.imageData, fps]);

    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [containerSize, setContainerSize] = useState<{
      width: number;
      height: number;
    } | null>(null);

    const compositionDimensions = useMemo(() => {
      const isEnabled = wallpaper?.enabled ?? false;
      const padding =
        isEnabled && (wallpaper?.padding ?? 0) > 0
          ? (wallpaper?.padding ?? 0)
          : 0;
      const aspectRatio = isEnabled ? (wallpaper?.aspectRatio ?? null) : null;
      const isDeviceFrame = isEnabled && (wallpaper?.deviceFrame ?? false);

      let videoW = width;
      let videoH = height;

      if (isDeviceFrame) {
        const frameLayout = calculateDeviceFrameLayout(videoW, videoH);
        videoW = frameLayout.frameWidth;
        videoH = frameLayout.frameHeight;
      }

      return calculateWallpaperDimensions(videoW, videoH, padding, aspectRatio);
    }, [
      width,
      height,
      wallpaper?.enabled,
      wallpaper?.padding,
      wallpaper?.aspectRatio,
      wallpaper?.deviceFrame,
    ]);

    const compositionWidth = compositionDimensions.width;
    const compositionHeight = compositionDimensions.height;

    const isDrawingSelectMode = drawingToolSettings?.activeTool === 'select';

    const displayScale = useMemo(() => {
      if (!containerSize || compositionWidth === 0 || compositionHeight === 0) {
        return 1;
      }

      const scaleX = containerSize.width / compositionWidth;
      const scaleY = containerSize.height / compositionHeight;

      return Math.min(scaleX, scaleY, 1);
    }, [containerSize, compositionWidth, compositionHeight]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (entry) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });

      observer.observe(container);

      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      engineRef.current?.dispose();
      engineRef.current = new VideoCompositionEngine({
        videoWidth: width,
        videoHeight: height,
        segments,
        wallpaper,
        zoomSegments,
        zoomSettings,
        drawingSegments: drawingSegmentsRef.current,
        redactOnlyDrawings: isDrawingSelectModeRef.current,
        cursorData,
        cursorStyle,
        cameraStyle,
        keyboardData,
        keyboardStyle,
        subtitleData,
        subtitleStyle,
        firstFrame,
        equalizerSegments: equalizerSegmentsRef.current,
        equalizerTracks: equalizerTracksRef.current,
        fps,
      });

      if (backgroundImageRef.current) {
        engineRef.current.setBackgroundImage(backgroundImageRef.current);
      }
      if (firstFrameImageRef.current) {
        engineRef.current.setFirstFrameImage(firstFrameImageRef.current);
      }

      return () => {
        engineRef.current?.dispose();
        engineRef.current = null;
      };
    }, [
      width,
      height,
      segments,
      wallpaper,
      zoomSegments,
      zoomSettings,
      cursorData,
      cursorStyle,
      cameraStyle,
      keyboardData,
      keyboardStyle,
      subtitleData,
      subtitleStyle,
      firstFrame,
      fps,
    ]);

    useEffect(() => {
      drawingSegmentsRef.current = drawingSegments;
      isDrawingSelectModeRef.current = isDrawingSelectMode;
      engineRef.current?.updateConfig({
        drawingSegments,
        redactOnlyDrawings: isDrawingSelectMode,
      });
    }, [drawingSegments, isDrawingSelectMode]);

    useEffect(() => {
      equalizerSegmentsRef.current = equalizerSegments;
      equalizerTracksRef.current = equalizerTracks;
      engineRef.current?.updateConfig({ equalizerSegments, equalizerTracks });
    }, [equalizerSegments, equalizerTracks]);

    useEffect(() => {
      setIsEqualizerOverlaySelected(selectedEqualizerId !== null);
    }, [selectedEqualizerId]);

    useEffect(() => {
      if (!wallpaper?.backgroundImage) {
        backgroundImageRef.current = null;
        engineRef.current?.setBackgroundImage(null);
        return;
      }

      let cancelled = false;
      const img = new Image();

      img.onload = () => {
        if (!cancelled) {
          backgroundImageRef.current = img;
          engineRef.current?.setBackgroundImage(img);
        }
      };

      img.onerror = () => {
        if (!cancelled) {
          console.error('Failed to load background image');
          backgroundImageRef.current = null;
        }
      };

      img.src = wallpaper.backgroundImage;

      return () => {
        cancelled = true;
        img.onload = null;
        img.onerror = null;
      };
    }, [wallpaper?.backgroundImage]);

    useEffect(() => {
      if (!firstFrame?.imageData) {
        firstFrameImageRef.current = null;
        engineRef.current?.setFirstFrameImage(null);
        return;
      }

      let cancelled = false;
      const img = new Image();

      img.onload = () => {
        if (!cancelled) {
          firstFrameImageRef.current = img;
          engineRef.current?.setFirstFrameImage(img);
        }
      };

      img.onerror = () => {
        if (!cancelled) {
          firstFrameImageRef.current = null;
        }
      };

      img.src = firstFrame.imageData;

      return () => {
        cancelled = true;
        img.onload = null;
        img.onerror = null;
      };
    }, [firstFrame?.imageData]);

    useEffect(() => {
      lastCameraFrameRef.current = null;
    }, [cameraSrc, cameraStyle?.visible]);

    useEffect(() => {
      lastVideoFrameRef.current = null;
    }, [videoSrc]);

    const getVideoSource = useCallback((video: HTMLVideoElement | null) => {
      if (!video) {
        return null;
      }

      if (video.readyState >= 2) {
        const { videoWidth, videoHeight } = video;
        if (videoWidth > 0 && videoHeight > 0) {
          let frameCanvas = lastVideoFrameRef.current;
          if (!frameCanvas) {
            frameCanvas = document.createElement('canvas');
            lastVideoFrameRef.current = frameCanvas;
          }

          if (
            frameCanvas.width !== videoWidth ||
            frameCanvas.height !== videoHeight
          ) {
            frameCanvas.width = videoWidth;
            frameCanvas.height = videoHeight;
          }

          const frameCtx = frameCanvas.getContext('2d');
          if (frameCtx) {
            frameCtx.drawImage(video, 0, 0, videoWidth, videoHeight);
          }
        }

        return video;
      }

      return lastVideoFrameRef.current;
    }, []);

    const getCameraSource = useCallback(
      (cameraVideo: HTMLVideoElement | null) => {
        if (!cameraVideo) {
          return null;
        }

        if (cameraVideo.readyState >= 2) {
          const { videoWidth, videoHeight } = cameraVideo;
          if (videoWidth > 0 && videoHeight > 0) {
            let frameCanvas = lastCameraFrameRef.current;
            if (!frameCanvas) {
              frameCanvas = document.createElement('canvas');
              lastCameraFrameRef.current = frameCanvas;
            }

            if (
              frameCanvas.width !== videoWidth ||
              frameCanvas.height !== videoHeight
            ) {
              frameCanvas.width = videoWidth;
              frameCanvas.height = videoHeight;
            }

            const frameCtx = frameCanvas.getContext('2d');
            if (frameCtx) {
              frameCtx.drawImage(cameraVideo, 0, 0, videoWidth, videoHeight);
            }
          }

          return cameraVideo;
        }

        return lastCameraFrameRef.current;
      },
      []
    );

    const renderCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const cameraVideo = cameraVideoRef.current;
      const engine = engineRef.current;

      const videoSource = getVideoSource(video);
      if (!canvas || !videoSource || !engine) {
        return;
      }

      if (!ctxRef.current) {
        ctxRef.current = canvas.getContext('2d');
      }

      const ctx = ctxRef.current;
      if (!ctx) return;

      const cameraSource = getCameraSource(cameraVideo);
      const previewPos = previewTimelinePositionRef.current;
      const pos = previewPos ?? timelinePositionRef.current;

      engine.renderFrame(
        ctx,
        pos,

        {
          video: videoSource,
          camera: cameraSource,
        },
        {
          fps: 60,
        }
      );
    }, [getCameraSource, getVideoSource]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      let animationId: number | null = null;
      let videoFrameCallbackId: number | null = null;

      const renderOnVideoFrame = () => {
        renderCanvas();
        if ('requestVideoFrameCallback' in video) {
          videoFrameCallbackId = (
            video as HTMLVideoElement & {
              requestVideoFrameCallback: (cb: () => void) => number;
            }
          ).requestVideoFrameCallback(renderOnVideoFrame);
        }
      };

      const renderLoop = () => {
        renderCanvas();
        animationId = requestAnimationFrame(renderLoop);
      };

      if ('requestVideoFrameCallback' in video) {
        videoFrameCallbackId = (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: () => void) => number;
          }
        ).requestVideoFrameCallback(renderOnVideoFrame);
      }

      animationId = requestAnimationFrame(renderLoop);

      return () => {
        if (animationId !== null) {
          cancelAnimationFrame(animationId);
        }
        if (
          videoFrameCallbackId !== null &&
          'cancelVideoFrameCallback' in video
        ) {
          (
            video as HTMLVideoElement & {
              cancelVideoFrameCallback: (id: number) => void;
            }
          ).cancelVideoFrameCallback(videoFrameCallbackId);
        }
      };
    }, [renderCanvas]);

    const getTimelinePositionFromVideo = useCallback(
      (videoTime: number, segIdx: number): number => {
        let accumulated = 0;
        for (let i = 0; i < segIdx && i < segments.length; i++) {
          const seg = segments[i];
          const speed = seg.speed ?? 1;
          accumulated += (seg.originalEnd - seg.originalStart) / speed;
        }
        const seg = segments[segIdx];
        if (seg) {
          const speed = seg.speed ?? 1;
          const offsetInSegment = videoTime - seg.originalStart;
          return accumulated + Math.max(0, offsetInSegment) / speed;
        }
        return accumulated;
      },
      [segments]
    );

    const moveToNextSegment = useCallback((): boolean => {
      const video = videoRef.current;
      const systemAudio = systemAudioRef.current;
      const micAudio = micAudioRef.current;

      if (!video) {
        return false;
      }

      const transition = getSegmentBoundaryTransition(
        segments,
        currentSegmentIndexRef.current
      );

      if (transition.isFinalSegment || transition.nextSegmentIndex === null) {
        return false;
      }

      const nextSeg = segments[transition.nextSegmentIndex];
      if (!nextSeg) {
        return false;
      }

      currentSegmentIndexRef.current = transition.nextSegmentIndex;

      const nextSpeed = nextSeg.speed ?? 1;
      video.playbackRate = nextSpeed;
      if (systemAudio) {
        systemAudio.playbackRate = nextSpeed;
      }
      if (micAudio) {
        micAudio.playbackRate = nextSpeed;
      }

      video.currentTime = nextSeg.originalStart;

      return true;
    }, [segments]);

    const updatePlayback = useCallback(() => {
      const video = videoRef.current;
      const systemAudio = systemAudioRef.current;
      const micAudio = micAudioRef.current;
      if (!video || !isPlaying || segments.length === 0) {
        return;
      }

      const videoTimelineDuration = getTotalTimelineDuration(segments);
      const fullDuration = firstFrameDuration + videoTimelineDuration;

      if (firstFramePlaybackRef.current !== null) {
        const { startWallTime, startTlPos } = firstFramePlaybackRef.current;
        const elapsed = (performance.now() - startWallTime) / 1000;
        const tlPos = Math.min(startTlPos + elapsed, firstFrameDuration);

        if (tlPos >= firstFrameDuration) {
          firstFramePlaybackRef.current = null;
          timelinePositionRef.current = firstFrameDuration;
          setTimelinePosition(firstFrameDuration);
          onTimeUpdate?.(firstFrameDuration);

          currentSegmentIndexRef.current = 0;
          video.currentTime = segments[0].originalStart;
          const speed = segments[0].speed ?? 1;
          video.playbackRate = speed;
          if (systemAudio) systemAudio.playbackRate = speed;
          if (micAudio) micAudio.playbackRate = speed;
          video.play().catch(() => {});
          systemAudio?.play().catch(() => {});
          micAudio?.play().catch(() => {});
          animationFrameRef.current = requestAnimationFrame(updatePlayback);
          return;
        }

        timelinePositionRef.current = tlPos;
        setTimelinePosition(tlPos);
        onTimeUpdate?.(tlPos);
        animationFrameRef.current = requestAnimationFrame(updatePlayback);
        return;
      }

      const segIdx = currentSegmentIndexRef.current;
      const seg = segments[segIdx];

      if (!seg) {
        video.pause();
        setIsPlaying(false);
        onPlayingChange?.(false);
        return;
      }

      const speed = seg.speed ?? 1;
      if (video.playbackRate !== speed) {
        video.playbackRate = speed;
        if (systemAudio) systemAudio.playbackRate = speed;
        if (micAudio) micAudio.playbackRate = speed;
      }

      const currentVideoTime = video.currentTime;

      if (currentVideoTime >= seg.originalEnd - 0.01) {
        if (!moveToNextSegment()) {
          video.pause();
          video.playbackRate = 1;
          if (systemAudio) systemAudio.playbackRate = 1;
          if (micAudio) micAudio.playbackRate = 1;
          setIsPlaying(false);
          onPlayingChange?.(false);
          timelinePositionRef.current = fullDuration;
          setTimelinePosition(fullDuration);
          onTimeUpdate?.(fullDuration);
          return;
        }
      }

      const videoTlPos = getTimelinePositionFromVideo(
        video.currentTime,
        currentSegmentIndexRef.current
      );
      const tlPos = firstFrameDuration + videoTlPos;
      timelinePositionRef.current = tlPos;
      setTimelinePosition(tlPos);
      onTimeUpdate?.(tlPos);

      animationFrameRef.current = requestAnimationFrame(updatePlayback);
    }, [
      isPlaying,
      segments,
      firstFrameDuration,
      getTimelinePositionFromVideo,
      moveToNextSegment,
      onTimeUpdate,
      onPlayingChange,
    ]);

    useEffect(() => {
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(updatePlayback);
      } else {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      }
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }, [isPlaying, updatePlayback]);

    const seekToTimelinePosition = useCallback(
      (tlPos: number, opts?: { isPreview?: boolean }) => {
        const video = videoRef.current;
        if (!video || segments.length === 0) return;

        const videoTimelineDuration = getTotalTimelineDuration(segments);
        const totalDuration = firstFrameDuration + videoTimelineDuration;
        const clampedPos = Math.max(0, Math.min(tlPos, totalDuration - 0.01));

        if (!opts?.isPreview) {
          timelinePositionRef.current = clampedPos;
          setTimelinePosition(clampedPos);
        }

        if (clampedPos < firstFrameDuration) {
          renderCanvas();
          return;
        }

        const videoTlPos = clampedPos - firstFrameDuration;
        const result = timelineToVideo(segments, videoTlPos);

        if (!opts?.isPreview) {
          currentSegmentIndexRef.current = result.segmentIndex;
        }

        if (isSeekingRef.current) {
          pendingSeekRef.current = result.videoTime;
          return;
        }

        isSeekingRef.current = true;
        video.currentTime = result.videoTime;
      },
      [segments, firstFrameDuration, renderCanvas]
    );

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleSeeked = () => {
        isSeekingRef.current = false;
        renderCanvas();

        if (pendingSeekRef.current !== null) {
          const nextSeekTime = pendingSeekRef.current;
          pendingSeekRef.current = null;
          isSeekingRef.current = true;
          video.currentTime = nextSeekTime;
        }
      };

      video.addEventListener('seeked', handleSeeked);
      return () => video.removeEventListener('seeked', handleSeeked);
    }, [renderCanvas]);

    useImperativeHandle(ref, () => ({
      getCurrentTime: () => timelinePosition,

      setPreviewTime: (timeInSeconds: number | null) => {
        previewTimelinePositionRef.current = timeInSeconds;

        if (timeInSeconds === null) {
          lastPreviewVideoTimeRef.current = null;
          stopScrubAudio();
          renderCanvas();
          return;
        }

        const videoTimelineDuration = getTotalTimelineDuration(segments);
        const totalDuration = firstFrameDuration + videoTimelineDuration;
        const clampedPos = Math.max(
          0,
          Math.min(timeInSeconds, totalDuration - 0.01)
        );

        if (clampedPos < firstFrameDuration) {
          renderCanvas();
          return;
        }

        const videoTlPos = clampedPos - firstFrameDuration;
        const { videoTime } = timelineToVideo(segments, videoTlPos);

        const lastPreviewVideoTime = lastPreviewVideoTimeRef.current;
        const minDelta = 1 / 60;
        if (
          lastPreviewVideoTime !== null &&
          Math.abs(videoTime - lastPreviewVideoTime) < minDelta
        ) {
          renderCanvas();
          return;
        }

        lastPreviewVideoTimeRef.current = videoTime;
        lastScrubUpdateRef.current = performance.now();
        startScrubAudio();
        seekToTimelinePosition(clampedPos, { isPreview: true });
        renderCanvas();
      },

      seekTo: (timeInSeconds: number) => {
        seekToTimelinePosition(timeInSeconds);
      },

      play: () => {
        const video = videoRef.current;
        const systemAudio = systemAudioRef.current;
        const micAudio = micAudioRef.current;
        if (!video || segments.length === 0) return;

        const videoTimelineDuration = getTotalTimelineDuration(segments);
        const fullDuration = firstFrameDuration + videoTimelineDuration;

        if (timelinePosition >= fullDuration - 0.01) {
          const firstSeg = segments[0];
          video.currentTime = firstSeg.originalStart;
          if (systemAudio) {
            systemAudio.currentTime = firstSeg.originalStart;
          }
          if (micAudio) {
            micAudio.currentTime = firstSeg.originalStart;
          }
          currentSegmentIndexRef.current = 0;
          timelinePositionRef.current = 0;
          setTimelinePosition(0);
        }

        if (timelinePositionRef.current < firstFrameDuration) {
          firstFramePlaybackRef.current = {
            startWallTime: performance.now(),
            startTlPos: timelinePositionRef.current,
          };
          setIsPlaying(true);
          return;
        }

        const systemVol = systemAudioEnabled ? systemAudioVolume : 0;
        const micVol = micAudioEnabled ? micAudioVolume : 0;

        if (systemGainRef.current) {
          systemGainRef.current.gain.value = systemVol;
        } else if (systemAudio) {
          systemAudio.volume = systemVol;
        }
        if (micGainRef.current) {
          micGainRef.current.gain.value = micVol;
        } else if (micAudio) {
          micAudio.volume = micVol;
        }

        video.play().catch(() => {});
        systemAudio?.play().catch(() => {});
        micAudio?.play().catch(() => {});
        setIsPlaying(true);
      },

      pause: () => {
        const video = videoRef.current;
        const systemAudio = systemAudioRef.current;
        const micAudio = micAudioRef.current;
        firstFramePlaybackRef.current = null;
        if (video) {
          video.pause();
        }
        if (systemAudio) {
          systemAudio.pause();
        }
        if (micAudio) {
          micAudio.pause();
        }
        setIsPlaying(false);
      },

      isPlaying: () => isPlaying,

      getVideoRef: () => videoRef.current,
    }));

    const handleLoadedMetadata = useCallback(() => {
      setIsVideoLoaded(true);
      onLoadedMetadata?.();
    }, [onLoadedMetadata]);

    const handleEnded = useCallback(() => {
      const video = videoRef.current;
      const systemAudio = systemAudioRef.current;
      const micAudio = micAudioRef.current;

      if (isPlaying && moveToNextSegment()) {
        video?.play().catch(() => {});
        systemAudio?.play().catch(() => {});
        micAudio?.play().catch(() => {});
        return;
      }

      setIsPlaying(false);
      onPlayingChange?.(false);
      const fullDuration =
        firstFrameDuration + getTotalTimelineDuration(segments);
      timelinePositionRef.current = fullDuration;
      setTimelinePosition(fullDuration);
      onTimeUpdate?.(fullDuration);
    }, [
      isPlaying,
      moveToNextSegment,
      segments,
      firstFrameDuration,
      onPlayingChange,
      onTimeUpdate,
    ]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || segments.length === 0) return;

      if (timelinePosition === 0) {
        video.currentTime = segments[0].originalStart;
      }
    }, [segments, timelinePosition]);

    const isCameraVisible = cameraStyle?.visible ?? true;

    useEffect(() => {
      if (!cameraSrc || !isCameraVisible) return;

      const cameraVideo = cameraVideoRef.current;
      const mainVideo = videoRef.current;
      if (!cameraVideo || !mainVideo) return;

      const syncTime = () => {
        if (Math.abs(cameraVideo.currentTime - mainVideo.currentTime) > 0.1) {
          cameraVideo.currentTime = mainVideo.currentTime;
        }
      };

      const syncPlayState = () => {
        cameraVideo.playbackRate = mainVideo.playbackRate;
        if (mainVideo.paused && !cameraVideo.paused) {
          cameraVideo.pause();
        } else if (!mainVideo.paused && cameraVideo.paused) {
          cameraVideo.play().catch(() => {});
        }
      };

      const syncRate = () => {
        cameraVideo.playbackRate = mainVideo.playbackRate;
      };

      syncTime();
      syncRate();

      mainVideo.addEventListener('play', syncPlayState);
      mainVideo.addEventListener('pause', syncPlayState);
      mainVideo.addEventListener('seeked', syncTime);
      mainVideo.addEventListener('ratechange', syncRate);

      return () => {
        mainVideo.removeEventListener('play', syncPlayState);
        mainVideo.removeEventListener('pause', syncPlayState);
        mainVideo.removeEventListener('seeked', syncTime);
        mainVideo.removeEventListener('ratechange', syncRate);
      };
    }, [cameraSrc, isCameraVisible]);

    useEffect(() => {
      if (!cameraSrc || !isCameraVisible) return;

      const cameraVideo = cameraVideoRef.current;
      const mainVideo = videoRef.current;
      if (!cameraVideo || !mainVideo) return;

      if (Math.abs(cameraVideo.currentTime - mainVideo.currentTime) > 0.1) {
        cameraVideo.currentTime = mainVideo.currentTime;
      }
    }, [timelinePosition, cameraSrc, isCameraVisible]);

    useEffect(() => {
      const mainVideo = videoRef.current;
      if (!mainVideo) return;

      const syncAudio = (
        audio: HTMLAudioElement | null,
        audioSrc: string | null | undefined
      ) => {
        if (!audioSrc || !audio) return;
        if (Math.abs(audio.currentTime - mainVideo.currentTime) > 0.1) {
          audio.currentTime = mainVideo.currentTime;
        }
      };

      const syncPlayState = () => {
        const systemAudio = systemAudioRef.current;
        const micAudio = micAudioRef.current;

        const systemVol = systemAudioEnabled ? systemAudioVolume : 0;
        const micVol = micAudioEnabled ? micAudioVolume : 0;

        if (systemGainRef.current) {
          systemGainRef.current.gain.value = systemVol;
        } else if (systemAudio) {
          systemAudio.volume = systemVol;
        }
        if (micGainRef.current) {
          micGainRef.current.gain.value = micVol;
        } else if (micAudio) {
          micAudio.volume = micVol;
        }

        if (mainVideo.paused) {
          systemAudio?.pause();
          micAudio?.pause();
        } else {
          if (systemAudioSrc) {
            systemAudio?.play().catch(() => {});
          }
          if (micAudioSrc) {
            micAudio?.play().catch(() => {});
          }
        }
      };

      const syncTime = () => {
        syncAudio(systemAudioRef.current, systemAudioSrc);
        syncAudio(micAudioRef.current, micAudioSrc);
      };

      syncTime();

      mainVideo.addEventListener('play', syncPlayState);
      mainVideo.addEventListener('pause', syncPlayState);
      mainVideo.addEventListener('seeked', syncTime);

      return () => {
        mainVideo.removeEventListener('play', syncPlayState);
        mainVideo.removeEventListener('pause', syncPlayState);
        mainVideo.removeEventListener('seeked', syncTime);
      };
    }, [
      systemAudioSrc,
      micAudioSrc,
      systemAudioEnabled,
      micAudioEnabled,
      systemAudioVolume,
      micAudioVolume,
    ]);

    const stopScrubAudio = useCallback(() => {
      if (!scrubAudioActiveRef.current) return;
      if (isPlaying) return;

      const systemAudio = systemAudioRef.current;
      const micAudio = micAudioRef.current;
      const video = videoRef.current;

      systemAudio?.pause();
      micAudio?.pause();

      if (
        video &&
        hasEmbeddedAudio &&
        !systemAudioSrc &&
        !micAudioSrc &&
        !video.paused
      ) {
        video.pause();
      }

      scrubAudioActiveRef.current = false;
      lastScrubUpdateRef.current = null;

      if (scrubAudioRafRef.current !== null) {
        cancelAnimationFrame(scrubAudioRafRef.current);
        scrubAudioRafRef.current = null;
      }
    }, [hasEmbeddedAudio, isPlaying, micAudioSrc, systemAudioSrc]);

    const startScrubAudio = useCallback(() => {
      if (isPlaying) return;
      if (!scrubAudioEnabledRef.current) return;

      const systemAudio = systemAudioRef.current;
      const micAudio = micAudioRef.current;
      const video = videoRef.current;

      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      if (systemAudio) {
        systemAudio.play().catch(() => {});
      }

      if (micAudio) {
        micAudio.play().catch(() => {});
      }

      if (
        video &&
        hasEmbeddedAudio &&
        !systemAudioSrc &&
        !micAudioSrc &&
        video.paused
      ) {
        video.play().catch(() => {});
      }

      scrubAudioActiveRef.current = true;

      if (scrubAudioRafRef.current !== null) return;

      const loop = () => {
        if (!scrubAudioActiveRef.current) {
          scrubAudioRafRef.current = null;
          return;
        }
        if (isPlaying || !scrubAudioEnabledRef.current) {
          stopScrubAudio();
          scrubAudioRafRef.current = null;
          return;
        }
        const lastUpdate = lastScrubUpdateRef.current;
        if (!lastUpdate || performance.now() - lastUpdate > 120) {
          stopScrubAudio();
          scrubAudioRafRef.current = null;
          return;
        }
        scrubAudioRafRef.current = requestAnimationFrame(loop);
      };

      scrubAudioRafRef.current = requestAnimationFrame(loop);
    }, [
      hasEmbeddedAudio,
      isPlaying,
      micAudioSrc,
      stopScrubAudio,
      systemAudioSrc,
    ]);

    useEffect(() => {
      scrubAudioEnabledRef.current = scrubAudioEnabled;
      if (!scrubAudioEnabled) {
        stopScrubAudio();
      }
    }, [scrubAudioEnabled, stopScrubAudio]);

    useEffect(() => {
      const mainVideo = videoRef.current;
      if (!mainVideo) return;

      if (systemAudioSrc) {
        const systemAudio = systemAudioRef.current;
        if (
          systemAudio &&
          Math.abs(systemAudio.currentTime - mainVideo.currentTime) > 0.1
        ) {
          systemAudio.currentTime = mainVideo.currentTime;
        }
      }

      if (micAudioSrc) {
        const micAudio = micAudioRef.current;
        if (
          micAudio &&
          Math.abs(micAudio.currentTime - mainVideo.currentTime) > 0.1
        ) {
          micAudio.currentTime = mainVideo.currentTime;
        }
      }
    }, [timelinePosition, systemAudioSrc, micAudioSrc]);

    useEffect(() => {
      const systemAudio = systemAudioRef.current;
      const micAudio = micAudioRef.current;

      const systemVol = systemAudioEnabled ? systemAudioVolume : 0;
      const micVol = micAudioEnabled ? micAudioVolume : 0;

      if (systemGainRef.current) {
        systemGainRef.current.gain.value = systemVol;
      } else if (systemAudio) {
        systemAudio.volume = systemVol;
      }
      if (micGainRef.current) {
        micGainRef.current.gain.value = micVol;
      } else if (micAudio) {
        micAudio.volume = micVol;
      }

      const video = videoRef.current;
      if (video && hasEmbeddedAudio && !systemAudioSrc && !micAudioSrc) {
        video.volume = systemAudioEnabled ? systemAudioVolume : 0;
        video.muted = !systemAudioEnabled;
      }
    }, [
      systemAudioEnabled,
      micAudioEnabled,
      systemAudioVolume,
      micAudioVolume,
      hasEmbeddedAudio,
      systemAudioSrc,
      micAudioSrc,
    ]);

    useEffect(() => {
      const systemAudio = systemAudioRef.current;
      const micAudio = micAudioRef.current;

      if (!systemAudio && !micAudio) return;
      if (audioContextRef.current) return;

      const initAudioContext = () => {
        if (audioContextRef.current) return;

        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        if (systemAudio && !systemSourceRef.current) {
          const source = ctx.createMediaElementSource(systemAudio);
          const gain = ctx.createGain();
          gain.gain.value = systemAudioEnabled ? systemAudioVolume : 0;
          source.connect(gain);
          gain.connect(ctx.destination);
          systemSourceRef.current = source;
          systemGainRef.current = gain;
        }

        if (micAudio && !micSourceRef.current) {
          const source = ctx.createMediaElementSource(micAudio);
          const gain = ctx.createGain();
          gain.gain.value = micAudioEnabled ? micAudioVolume : 0;
          source.connect(gain);
          gain.connect(ctx.destination);
          micSourceRef.current = source;
          micGainRef.current = gain;
        }
      };

      const handleCanPlay = () => {
        initAudioContext();
      };

      systemAudio?.addEventListener('canplay', handleCanPlay);
      micAudio?.addEventListener('canplay', handleCanPlay);

      if (
        (systemAudio?.readyState ?? 0) >= 3 ||
        (micAudio?.readyState ?? 0) >= 3
      ) {
        initAudioContext();
      }

      return () => {
        systemAudio?.removeEventListener('canplay', handleCanPlay);
        micAudio?.removeEventListener('canplay', handleCanPlay);
      };
    }, [
      systemAudioSrc,
      micAudioSrc,
      systemAudioEnabled,
      micAudioEnabled,
      systemAudioVolume,
      micAudioVolume,
    ]);

    const isReady = containerSize && isVideoLoaded;

    return (
      <div
        ref={containerRef}
        id="video-player"
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
      >
        {!isReady && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="text-muted-foreground size-8 animate-spin" />
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        )}
        <div
          className="relative"
          style={{
            width: compositionWidth * displayScale,
            height: compositionHeight * displayScale,
            opacity: isReady ? 1 : 0,
            position: isReady ? 'relative' : 'absolute',
            pointerEvents: isReady ? 'auto' : 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            width={compositionWidth}
            height={compositionHeight}
            style={{
              width: compositionWidth * displayScale,
              height: compositionHeight * displayScale,
            }}
          />

          {drawingToolSettings && onAddDrawingSegment && (
            <VideoDrawingOverlay
              activeTool={drawingToolSettings.activeTool}
              selectedColor={drawingToolSettings.selectedColor}
              strokeWidth={drawingToolSettings.strokeWidth}
              arrowStyle={drawingToolSettings.arrowStyle}
              highlightColor={drawingToolSettings.highlightColor}
              highlightOpacity={drawingToolSettings.highlightOpacity}
              numberStyle={drawingToolSettings.numberStyle}
              numberSize={drawingToolSettings.numberSize}
              numberStartValue={drawingToolSettings.numberStartValue}
              textBackground={drawingToolSettings.textBackground}
              textFontSize={drawingToolSettings.textFontSize}
              textFontFamily={drawingToolSettings.textFontFamily}
              redactStyle={drawingToolSettings.redactStyle}
              redactIntensity={drawingToolSettings.redactIntensity}
              shapeFillMode={drawingToolSettings.shapeFillMode}
              drawingSegments={drawingSegments ?? []}
              selectedDrawingIds={selectedDrawingIds}
              timelinePosition={drawingTimelinePosition ?? timelinePosition}
              canvasWidth={compositionWidth}
              canvasHeight={compositionHeight}
              displayScale={displayScale}
              onAddDrawingSegment={onAddDrawingSegment}
              onSelectDrawing={onSelectDrawing ?? (() => {})}
              onSelectMultipleDrawings={onSelectMultipleDrawings ?? (() => {})}
              onSelectAllDrawings={onSelectAllDrawings ?? (() => {})}
              onUpdateDrawingAnnotation={
                onUpdateDrawingAnnotation ?? (() => {})
              }
              onUpdateDrawingAnnotationsMultiple={
                onUpdateDrawingAnnotationsMultiple ?? (() => {})
              }
              onCommitDrawingGesture={onCommitDrawingGesture ?? (() => {})}
              onAnnotationAdded={onAnnotationAdded}
            />
          )}

          {activeEqualizer?.enabled &&
          onEqualizerSelect &&
          onEqualizerChange &&
          onEqualizerCommit ? (
            <VideoEqualizerOverlay
              settings={activeEqualizer}
              compositionWidth={compositionWidth}
              compositionHeight={compositionHeight}
              isSelected={
                isEqualizerOverlaySelected &&
                selectedEqualizerId === activeEqualizer.id
              }
              onSelect={() => {
                setIsEqualizerOverlaySelected(true);
                onEqualizerSelect(activeEqualizer.id);
              }}
              onDeselect={() => setIsEqualizerOverlaySelected(false)}
              onChange={onEqualizerChange}
              onCommit={onEqualizerCommit}
            />
          ) : null}

          <video
            ref={videoRef}
            src={videoSrc}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            playsInline
            muted={!!(systemAudioSrc || micAudioSrc) || !hasEmbeddedAudio}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
            }}
          />

          {systemAudioSrc && (
            <audio
              ref={systemAudioRef}
              src={systemAudioSrc}
              preload="auto"
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: 'none',
              }}
            />
          )}

          {micAudioSrc && (
            <audio
              ref={micAudioRef}
              src={micAudioSrc}
              preload="auto"
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: 'none',
              }}
            />
          )}

          {cameraSrc && isCameraVisible && (
            <video
              ref={cameraVideoRef}
              src={cameraSrc}
              playsInline
              muted
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                opacity: 0,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
    );
  }
);

NativeVideoPlayer.displayName = 'NativeVideoPlayer';

export default NativeVideoPlayer;
