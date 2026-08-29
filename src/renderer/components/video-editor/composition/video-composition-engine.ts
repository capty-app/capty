import type { CompositionConfig, FrameSource, Context2D } from './types';
import {
  renderWallpaper,
  type WallpaperRenderResult,
} from './wallpaper-canvas-renderer';
import { renderCursor } from './cursor-canvas-renderer';
import { renderCamera, type ZoomInfo } from './camera-canvas-renderer';
import { renderKeyboard } from './keyboard-canvas-renderer';
import {
  renderSubtitle,
  getSubtitleBounds,
  type SubtitleBounds,
} from './subtitle-canvas-renderer';
import {
  calculateZoomTransform,
  clearOptimalCenterCache,
  type ZoomTransform,
  type ZoomTransformOptions,
  type ViewportTransform,
} from './zoom-canvas-renderer';
import {
  renderDeviceFrame,
  calculateDeviceFrameLayout,
} from './device-frame-canvas-renderer';
import { renderDrawings } from './drawing-canvas-renderer';
import { convertSegmentsToVideoSegments } from './types';
import { DEFAULT_CURSOR_STYLE } from '@/types/cursor';
import { DEFAULT_CAMERA_STYLE } from '@/types/camera';
import { DEFAULT_KEYBOARD_STYLE } from '@/types/keyboard';
import { DEFAULT_SUBTITLE_STYLE } from '@/types/subtitle';
import { calculateWallpaperDimensions } from '@/types/video-wallpaper';

export interface RenderOptions {
  fps?: number;
}

export class VideoCompositionEngine {
  private config: CompositionConfig;
  private backgroundImage: HTMLImageElement | ImageBitmap | null = null;
  private firstFrameImage: HTMLImageElement | ImageBitmap | null = null;
  private shadowOffscreen: OffscreenCanvas | null = null;
  private shadowOffscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

  constructor(config: CompositionConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<CompositionConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.zoomSegments !== undefined) {
      clearOptimalCenterCache();
    }
  }

  setBackgroundImage(image: HTMLImageElement | ImageBitmap | null): void {
    this.backgroundImage = image;
  }

  setFirstFrameImage(image: HTMLImageElement | ImageBitmap | null): void {
    this.firstFrameImage = image;
  }

  getFirstFrameDuration(): number {
    const { firstFrame, fps = 30 } = this.config;
    if (!firstFrame?.enabled || !firstFrame.imageData) return 0;
    return 1 / fps;
  }

  getCompositionDimensions(): { width: number; height: number } {
    const isEnabled = this.config.wallpaper?.enabled ?? false;
    const padding = isEnabled ? (this.config.wallpaper?.padding ?? 0) : 0;
    const aspectRatio = isEnabled
      ? (this.config.wallpaper?.aspectRatio ?? null)
      : null;
    const isDeviceFrame =
      isEnabled && (this.config.wallpaper?.deviceFrame ?? false);

    let videoWidth = this.config.videoWidth;
    let videoHeight = this.config.videoHeight;

    if (isDeviceFrame) {
      const frameLayout = calculateDeviceFrameLayout(videoWidth, videoHeight);
      videoWidth = frameLayout.frameWidth;
      videoHeight = frameLayout.frameHeight;
    }

    const dims = calculateWallpaperDimensions(
      videoWidth,
      videoHeight,
      padding,
      aspectRatio
    );
    return { width: dims.width, height: dims.height };
  }

  dispose(): void {
    this.backgroundImage = null;
    this.firstFrameImage = null;
    this.shadowOffscreen = null;
    this.shadowOffscreenCtx = null;
    clearOptimalCenterCache();
  }

  renderFrame(
    ctx: Context2D,
    timelineTime: number,
    source: FrameSource,
    options?: RenderOptions
  ): void {
    const firstFrameDuration = this.getFirstFrameDuration();
    if (firstFrameDuration > 0 && timelineTime < firstFrameDuration) {
      this.renderFirstFrame(ctx);
      this.renderDrawingOverlay(ctx, timelineTime);
      return;
    }

    const adjustedTime = timelineTime - firstFrameDuration;
    const { videoWidth, videoHeight, wallpaper } = this.config;
    const isDeviceFrame =
      (wallpaper?.enabled ?? false) && (wallpaper?.deviceFrame ?? false);

    let effectiveVideoWidth = videoWidth;
    let effectiveVideoHeight = videoHeight;
    let deviceFrameLayout: ReturnType<
      typeof calculateDeviceFrameLayout
    > | null = null;

    if (isDeviceFrame) {
      deviceFrameLayout = calculateDeviceFrameLayout(videoWidth, videoHeight);
      effectiveVideoWidth = deviceFrameLayout.frameWidth;
      effectiveVideoHeight = deviceFrameLayout.frameHeight;
    }

    const wallpaperResult = renderWallpaper(
      ctx,
      wallpaper,
      effectiveVideoWidth,
      effectiveVideoHeight,
      this.backgroundImage
    );

    const videoSegments = convertSegmentsToVideoSegments(this.config.segments);

    const zoomOptions: ZoomTransformOptions = {
      fps: options?.fps ?? 60,
    };

    const zoomTransform = calculateZoomTransform(
      this.config.zoomSegments,
      this.config.zoomSettings,
      this.config.cursorData,
      videoSegments,
      adjustedTime,
      videoWidth,
      videoHeight,
      zoomOptions
    );

    const cursorZoomTransform: ZoomTransform =
      isDeviceFrame && deviceFrameLayout && zoomTransform.scale !== 1
        ? {
            ...zoomTransform,
            translateX:
              zoomTransform.translateX +
              (zoomTransform.scale - 1) * deviceFrameLayout.screenX,
            translateY:
              zoomTransform.translateY +
              (zoomTransform.scale - 1) * deviceFrameLayout.screenY,
          }
        : zoomTransform;

    if (isDeviceFrame && deviceFrameLayout) {
      this.renderVideoWithDeviceFrame(
        ctx,
        source.video,
        wallpaperResult,
        zoomTransform,
        deviceFrameLayout
      );
    } else {
      this.renderVideoWithZoom(
        ctx,
        source.video,
        wallpaperResult,
        zoomTransform
      );
    }

    const cursorLayout: WallpaperRenderResult =
      isDeviceFrame && deviceFrameLayout
        ? {
            ...wallpaperResult,
            videoX: wallpaperResult.videoX + deviceFrameLayout.screenX,
            videoY: wallpaperResult.videoY + deviceFrameLayout.screenY,
            videoClipRadius: 0,
          }
        : wallpaperResult;

    this.renderCursorOverlay(
      ctx,
      adjustedTime,
      cursorLayout,
      cursorZoomTransform
    );

    this.renderCameraOverlay(
      ctx,
      adjustedTime,
      source,
      wallpaperResult,
      zoomTransform
    );

    const subtitleBounds = this.getActiveSubtitleBounds();

    this.renderSubtitleOverlay(ctx, adjustedTime);

    this.renderKeyboardOverlay(ctx, adjustedTime, subtitleBounds);

    this.renderDrawingOverlay(ctx, timelineTime);
  }

  private renderDrawingOverlay(ctx: Context2D, timelineTime: number): void {
    const { drawingSegments, redactOnlyDrawings } = this.config;
    if (!drawingSegments || drawingSegments.length === 0) return;

    const { width, height } = this.getCompositionDimensions();
    renderDrawings(ctx, {
      drawingSegments,
      timelineTime,
      width,
      height,
      onlyRedact: redactOnlyDrawings,
    });
  }

  private renderFirstFrame(ctx: Context2D): void {
    const { width, height } = this.getCompositionDimensions();
    ctx.clearRect(0, 0, width, height);

    if (!this.firstFrameImage) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const img = this.firstFrameImage;
    const fit = this.config.firstFrame?.fit ?? 'cover';

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    if (fit === 'stretch') {
      ctx.drawImage(img, 0, 0, width, height);
      return;
    }

    const imgAspect = img.width / img.height;
    const canvasAspect = width / height;

    let drawWidth: number;
    let drawHeight: number;

    if (imgAspect > canvasAspect) {
      drawHeight = height;
      drawWidth = height * imgAspect;
    } else {
      drawWidth = width;
      drawHeight = width / imgAspect;
    }

    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;

    ctx.drawImage(img, x, y, drawWidth, drawHeight);
  }

  private renderCameraOverlay(
    ctx: Context2D,
    timelineTime: number,
    source: FrameSource,
    _layout: WallpaperRenderResult,
    zoomTransform: ZoomTransform
  ): void {
    const { cameraStyle, cursorData, segments } = this.config;

    if (!source.camera) return;

    const effectiveStyle = cameraStyle ?? DEFAULT_CAMERA_STYLE;
    if (!effectiveStyle.visible) return;

    const videoSegments = convertSegmentsToVideoSegments(segments);

    const { width: compositionWidth, height: compositionHeight } =
      this.getCompositionDimensions();

    const zoomInfo: ZoomInfo = {
      scale: zoomTransform.scale,
      viewport: zoomTransform.viewport,
    };

    renderCamera(ctx, timelineTime, source.camera, {
      cameraStyle: effectiveStyle,
      cursorData,
      segments: videoSegments,
      videoWidth: compositionWidth,
      videoHeight: compositionHeight,
      offsetX: 0,
      offsetY: 0,
      zoomInfo,
    });
  }

  private renderKeyboardOverlay(
    ctx: Context2D,
    timelineTime: number,
    subtitleBounds: SubtitleBounds | null
  ): void {
    const { keyboardData, keyboardStyle, segments } = this.config;

    if (!keyboardData || keyboardData.events.length === 0) return;

    const effectiveStyle = keyboardStyle ?? DEFAULT_KEYBOARD_STYLE;
    if (!effectiveStyle.visible) return;

    const videoSegments = convertSegmentsToVideoSegments(segments);
    const { width: compositionWidth, height: compositionHeight } =
      this.getCompositionDimensions();

    renderKeyboard(ctx, timelineTime, {
      keyboardData,
      keyboardStyle: effectiveStyle,
      segments: videoSegments,
      videoWidth: compositionWidth,
      videoHeight: compositionHeight,
      subtitleBounds,
    });
  }

  private getActiveSubtitleBounds(): SubtitleBounds | null {
    const { subtitleData, subtitleStyle } = this.config;

    if (!subtitleData || subtitleData.segments.length === 0) return null;

    const effectiveStyle = subtitleStyle ?? DEFAULT_SUBTITLE_STYLE;
    if (!effectiveStyle.visible) return null;
    if (effectiveStyle.position !== 'bottom') return null;

    const { height: compositionHeight } = this.getCompositionDimensions();
    return getSubtitleBounds(effectiveStyle, compositionHeight);
  }

  private renderSubtitleOverlay(ctx: Context2D, timelineTime: number): void {
    const { subtitleData, subtitleStyle, segments } = this.config;

    if (!subtitleData || subtitleData.segments.length === 0) return;

    const effectiveStyle = subtitleStyle ?? DEFAULT_SUBTITLE_STYLE;
    if (!effectiveStyle.visible) return;

    const videoSegments = convertSegmentsToVideoSegments(segments);
    const { width: compositionWidth, height: compositionHeight } =
      this.getCompositionDimensions();

    renderSubtitle(ctx, timelineTime, {
      subtitleData,
      subtitleStyle: effectiveStyle,
      segments: videoSegments,
      videoWidth: compositionWidth,
      videoHeight: compositionHeight,
    });
  }

  private renderCursorOverlay(
    ctx: Context2D,
    timelineTime: number,
    layout: WallpaperRenderResult,
    zoomTransform: ZoomTransform
  ): void {
    const { cursorData, cursorStyle, segments, videoWidth, videoHeight } =
      this.config;

    if (!cursorData || cursorData.events.length === 0) return;
    if (cursorStyle && !cursorStyle.enabled) return;

    const videoSegments = convertSegmentsToVideoSegments(segments);
    const effectiveStyle = cursorStyle ?? DEFAULT_CURSOR_STYLE;

    ctx.save();

    if (zoomTransform.scale !== 1) {
      ctx.translate(layout.videoX, layout.videoY);
      ctx.scale(zoomTransform.scale, zoomTransform.scale);
      ctx.translate(
        zoomTransform.translateX / zoomTransform.scale,
        zoomTransform.translateY / zoomTransform.scale
      );

      if (layout.videoClipRadius > 0) {
        ctx.beginPath();
        ctx.roundRect(0, 0, videoWidth, videoHeight, layout.videoClipRadius);
        ctx.clip();
      }

      renderCursor(ctx, timelineTime, {
        cursorData,
        cursorStyle: effectiveStyle,
        segments: videoSegments,
        videoWidth,
        videoHeight,
        offsetX: 0,
        offsetY: 0,
      });
    } else {
      if (layout.videoClipRadius > 0) {
        ctx.beginPath();
        ctx.roundRect(
          layout.videoX,
          layout.videoY,
          videoWidth,
          videoHeight,
          layout.videoClipRadius
        );
        ctx.clip();
      }

      renderCursor(ctx, timelineTime, {
        cursorData,
        cursorStyle: effectiveStyle,
        segments: videoSegments,
        videoWidth,
        videoHeight,
        offsetX: layout.videoX,
        offsetY: layout.videoY,
      });
    }

    ctx.restore();
  }

  private renderVideoWithDeviceFrame(
    ctx: Context2D,
    video:
      | HTMLVideoElement
      | VideoFrame
      | ImageBitmap
      | HTMLCanvasElement
      | OffscreenCanvas,
    layout: WallpaperRenderResult,
    zoomTransform: ZoomTransform,
    frameLayout: ReturnType<typeof calculateDeviceFrameLayout>
  ): void {
    const { videoX, videoY } = layout;
    const { videoWidth, videoHeight } = this.config;

    const { screenX, screenY } = frameLayout;

    ctx.save();
    const { screenCornerRadius } = frameLayout;

    if (zoomTransform.scale !== 1) {
      ctx.translate(videoX, videoY);
      ctx.scale(zoomTransform.scale, zoomTransform.scale);
      ctx.translate(
        zoomTransform.translateX / zoomTransform.scale,
        zoomTransform.translateY / zoomTransform.scale
      );

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(
        screenX,
        screenY,
        videoWidth,
        videoHeight,
        screenCornerRadius
      );
      ctx.clip();
      ctx.drawImage(video, screenX, screenY, videoWidth, videoHeight);
      ctx.restore();

      renderDeviceFrame(ctx, frameLayout, 0, 0, layout.shadowConfig);
      ctx.restore();
      return;
    }

    const screenOffsetX = videoX + screenX;
    const screenOffsetY = videoY + screenY;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(
      screenOffsetX,
      screenOffsetY,
      videoWidth,
      videoHeight,
      screenCornerRadius
    );
    ctx.clip();

    ctx.drawImage(video, screenOffsetX, screenOffsetY, videoWidth, videoHeight);
    ctx.restore();

    renderDeviceFrame(ctx, frameLayout, videoX, videoY, layout.shadowConfig);
    ctx.restore();
  }

  private renderVideoWithZoom(
    ctx: Context2D,
    video:
      | HTMLVideoElement
      | VideoFrame
      | ImageBitmap
      | HTMLCanvasElement
      | OffscreenCanvas,
    layout: WallpaperRenderResult,
    zoomTransform: ZoomTransform
  ): void {
    const { videoX, videoY, videoClipRadius, shadowConfig } = layout;
    const { videoWidth, videoHeight } = this.config;

    ctx.save();

    if (zoomTransform.scale !== 1) {
      this.renderTransformedVideo(ctx, video, layout, zoomTransform);
    } else {
      if (shadowConfig) {
        const offscreen = this.createClippedVideoFrame(
          video,
          videoWidth,
          videoHeight,
          videoClipRadius
        );
        if (offscreen) {
          ctx.shadowColor = `rgba(0, 0, 0, ${shadowConfig.opacity})`;
          ctx.shadowBlur = shadowConfig.blur;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = shadowConfig.offsetY;
          ctx.drawImage(offscreen, videoX, videoY);
        }
      } else {
        if (videoClipRadius > 0) {
          ctx.beginPath();
          ctx.roundRect(
            videoX,
            videoY,
            videoWidth,
            videoHeight,
            videoClipRadius
          );
          ctx.clip();
        }
        ctx.drawImage(video, videoX, videoY, videoWidth, videoHeight);
      }
    }

    ctx.restore();
  }

  private renderTransformedVideo(
    ctx: Context2D,
    video:
      | HTMLVideoElement
      | VideoFrame
      | ImageBitmap
      | HTMLCanvasElement
      | OffscreenCanvas,
    layout: WallpaperRenderResult,
    transform: ViewportTransform
  ): void {
    const { videoX, videoY, videoClipRadius, shadowConfig } = layout;
    const { videoWidth, videoHeight } = this.config;

    ctx.save();
    ctx.translate(videoX, videoY);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(
      transform.translateX / transform.scale,
      transform.translateY / transform.scale
    );

    if (shadowConfig) {
      const offscreen = this.createClippedVideoFrame(
        video,
        videoWidth,
        videoHeight,
        videoClipRadius
      );
      if (offscreen) {
        ctx.shadowColor = `rgba(0, 0, 0, ${shadowConfig.opacity})`;
        ctx.shadowBlur = shadowConfig.blur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = shadowConfig.offsetY;
        ctx.drawImage(offscreen, 0, 0);
      }
      ctx.restore();
      return;
    }

    if (videoClipRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(0, 0, videoWidth, videoHeight, videoClipRadius);
      ctx.clip();
    }
    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
    ctx.restore();
  }

  private createClippedVideoFrame(
    video:
      | HTMLVideoElement
      | VideoFrame
      | ImageBitmap
      | HTMLCanvasElement
      | OffscreenCanvas,
    width: number,
    height: number,
    cornerRadius: number
  ): OffscreenCanvas | null {
    if (
      !this.shadowOffscreen ||
      this.shadowOffscreen.width !== width ||
      this.shadowOffscreen.height !== height
    ) {
      this.shadowOffscreen = new OffscreenCanvas(width, height);
      this.shadowOffscreenCtx = this.shadowOffscreen.getContext('2d');
    }

    const ctx = this.shadowOffscreenCtx;
    if (!ctx) return null;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    if (cornerRadius > 0) {
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, cornerRadius);
      ctx.clip();
    }

    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    return this.shadowOffscreen;
  }
}
