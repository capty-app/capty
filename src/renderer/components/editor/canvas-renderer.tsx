import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import type {
  GradientOption,
  ImageLayer,
  WindowFrameStyle,
} from '@/types/editor';
import type { BalanceCrop } from '@/renderer/utils/color-detection';
import { renderNoise } from '@/renderer/utils/noise';
import type { LayerRect } from '@/renderer/utils/layer-layout';

const WINDOW_FRAME_TITLE_BAR_HEIGHT = 28;
const WINDOW_FRAME_CORNER_RADIUS = 10;
const TRAFFIC_LIGHT_SIZE = 12;
const TRAFFIC_LIGHT_SPACING = 8;
const TRAFFIC_LIGHT_OFFSET_X = 13;
const TRAFFIC_LIGHT_OFFSET_Y = WINDOW_FRAME_TITLE_BAR_HEIGHT / 2;

const TRAFFIC_LIGHT_COLORS = {
  close: '#FF5F57',
  minimize: '#FFBD2E',
  maximize: '#28C840',
};

const WINDOW_FRAME_THEMES = {
  'macos-light': {
    titleBar: '#E8E8E8',
    titleBarBorder: '#D1D1D1',
    content: '#FFFFFF',
    frameBorder: '#C0C0C0',
  },
  'macos-dark': {
    titleBar: '#3A3A3C',
    titleBarBorder: '#2A2A2C',
    content: '#1C1C1E',
    frameBorder: '#4A4A4C',
  },
};

export interface CanvasRendererProps {
  image: HTMLImageElement | null;
  padding: number;
  inset?: number;
  cornerRadius: number;
  shadow: number;
  gradient: GradientOption | null;
  backgroundImage: string | null;
  backgroundBlur?: number;
  noise?: number;
  windowFrame?: WindowFrameStyle;
  aspectRatioPaddingX?: number;
  aspectRatioPaddingY?: number;
  extraLayers?: ImageLayer[];
  extraLayerImages?: Record<string, HTMLImageElement>;
  layerRects: LayerRect[];
  primaryRect: LayerRect;
  nativeBalanceCrop: BalanceCrop;
  primaryInsetColor: string | null;
  layerInsetColors?: Record<string, string | null>;
}

export interface CanvasRendererHandle {
  getCanvas: () => HTMLCanvasElement | null;
  toDataURL: (type?: string, quality?: number) => string;
}

function drawTrafficLights(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number
) {
  const buttons = [
    TRAFFIC_LIGHT_COLORS.close,
    TRAFFIC_LIGHT_COLORS.minimize,
    TRAFFIC_LIGHT_COLORS.maximize,
  ];

  buttons.forEach((color, index) => {
    const buttonX = x + index * (TRAFFIC_LIGHT_SIZE + TRAFFIC_LIGHT_SPACING);
    ctx.beginPath();
    ctx.arc(buttonX, y, TRAFFIC_LIGHT_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

interface DrawLayerArgs {
  ctx: CanvasRenderingContext2D;
  image: HTMLImageElement;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  inset: number;
  cornerRadius: number;
  shadow: number;
  hasWindowFrame: boolean;
  frameTheme:
    (typeof WINDOW_FRAME_THEMES)[keyof typeof WINDOW_FRAME_THEMES] | null;
  titleBarHeight: number;
  balanceCrop: BalanceCrop;
  insetColor: string | null;
}

function drawLayer({
  ctx,
  image,
  frameX,
  frameY,
  frameWidth,
  frameHeight,
  inset,
  cornerRadius,
  shadow,
  hasWindowFrame,
  frameTheme,
  titleBarHeight,
  balanceCrop,
  insetColor,
}: DrawLayerArgs) {
  ctx.save();

  const shadowBlur = (shadow / 100) * 50;
  const shadowOpacity = shadow > 0 ? 0.2 + (shadow / 100) * 0.3 : 0;
  const shadowOffsetY = (shadow / 100) * 15;

  if (shadow > 0) {
    ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = shadowOffsetY;
  }

  if (hasWindowFrame && frameTheme) {
    const frameCornerRadius = WINDOW_FRAME_CORNER_RADIUS;

    ctx.beginPath();
    ctx.roundRect(frameX, frameY, frameWidth, frameHeight, frameCornerRadius);

    if (shadow > 0) {
      ctx.fillStyle = frameTheme.content;
      ctx.fill();
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.clip();

    ctx.fillStyle = frameTheme.titleBar;
    ctx.fillRect(frameX, frameY, frameWidth, titleBarHeight);

    ctx.strokeStyle = frameTheme.titleBarBorder;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(frameX, frameY + titleBarHeight);
    ctx.lineTo(frameX + frameWidth, frameY + titleBarHeight);
    ctx.stroke();

    drawTrafficLights(
      ctx,
      frameX + TRAFFIC_LIGHT_OFFSET_X,
      frameY + TRAFFIC_LIGHT_OFFSET_Y
    );

    if (inset > 0 && insetColor) {
      ctx.fillStyle = insetColor;
      ctx.fillRect(
        frameX,
        frameY + titleBarHeight,
        frameWidth,
        frameHeight - titleBarHeight
      );
    }

    const contentX = frameX + inset;
    const contentY = frameY + titleBarHeight + inset;
    const contentW = frameWidth - inset * 2;
    const contentH = frameHeight - titleBarHeight - inset * 2;

    const srcX = balanceCrop.left;
    const srcY = balanceCrop.top;
    const srcW = image.naturalWidth - balanceCrop.left - balanceCrop.right;
    const srcH = image.naturalHeight - balanceCrop.top - balanceCrop.bottom;

    ctx.drawImage(
      image,
      srcX,
      srcY,
      srcW,
      srcH,
      contentX,
      contentY,
      contentW,
      contentH
    );

    ctx.restore();
    ctx.save();

    ctx.strokeStyle = frameTheme.frameBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(frameX, frameY, frameWidth, frameHeight, frameCornerRadius);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  if (cornerRadius > 0) {
    ctx.roundRect(frameX, frameY, frameWidth, frameHeight, cornerRadius);
  } else {
    ctx.rect(frameX, frameY, frameWidth, frameHeight);
  }

  if (shadow > 0 || (inset > 0 && insetColor)) {
    ctx.fillStyle = inset > 0 && insetColor ? insetColor : 'white';
    ctx.fill();
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.clip();

  const contentX = frameX + inset;
  const contentY = frameY + inset;
  const contentW = frameWidth - inset * 2;
  const contentH = frameHeight - inset * 2;

  const srcX = balanceCrop.left;
  const srcY = balanceCrop.top;
  const srcW = image.naturalWidth - balanceCrop.left - balanceCrop.right;
  const srcH = image.naturalHeight - balanceCrop.top - balanceCrop.bottom;

  ctx.drawImage(
    image,
    srcX,
    srcY,
    srcW,
    srcH,
    contentX,
    contentY,
    contentW,
    contentH
  );

  ctx.restore();
}

const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  (
    {
      image,
      padding,
      inset = 0,
      cornerRadius,
      shadow,
      gradient,
      backgroundImage,
      backgroundBlur = 0,
      noise = 0,
      windowFrame = 'none',
      aspectRatioPaddingX = 0,
      aspectRatioPaddingY = 0,
      extraLayers = [],
      extraLayerImages = {},
      layerRects,
      primaryRect,
      nativeBalanceCrop,
      primaryInsetColor,
      layerInsetColors = {},
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pixelRatio = window.devicePixelRatio || 2;
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
      if (!backgroundImage) {
        setBgImage(null);
        return;
      }

      const img = new Image();
      img.onload = () => setBgImage(img);
      img.onerror = () => {
        console.error('Failed to load background image');
        setBgImage(null);
      };
      img.src = backgroundImage;
    }, [backgroundImage]);

    const hasWindowFrame = windowFrame !== 'none';
    const frameTheme = hasWindowFrame
      ? WINDOW_FRAME_THEMES[windowFrame as 'macos-light' | 'macos-dark']
      : null;
    const titleBarHeight = hasWindowFrame ? WINDOW_FRAME_TITLE_BAR_HEIGHT : 0;

    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
      toDataURL: (type = 'image/png', quality = 1) => {
        return canvasRef.current?.toDataURL(type, quality) || '';
      },
    }));

    const frameTotalWidth = layerRects.reduce(
      (max, r) => Math.max(max, r.x + r.width),
      0
    );
    const frameTotalHeight = layerRects.reduce(
      (max, r) => Math.max(max, r.y + r.height),
      0
    );

    const canvasWidth = frameTotalWidth + padding * 2 + aspectRatioPaddingX * 2;
    const canvasHeight =
      frameTotalHeight + padding * 2 + aspectRatioPaddingY * 2;

    const frameOffsetX = padding + aspectRatioPaddingX;
    const frameOffsetY = padding + aspectRatioPaddingY;

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d', {
        alpha: true,
        desynchronized: false,
      });
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(pixelRatio, pixelRatio);

      const blurRadius = (backgroundBlur / 100) * 50;
      if (blurRadius > 0) {
        ctx.filter = `blur(${blurRadius}px)`;
      }

      if (bgImage) {
        const blurExpand = blurRadius * 2;
        const imgAspect = bgImage.width / bgImage.height;
        const expandedWidth = canvasWidth + blurExpand * 2;
        const expandedHeight = canvasHeight + blurExpand * 2;
        const canvasAspect = expandedWidth / expandedHeight;

        let drawWidth: number;
        let drawHeight: number;
        let drawX: number;
        let drawY: number;

        if (imgAspect > canvasAspect) {
          drawHeight = expandedHeight;
          drawWidth = expandedHeight * imgAspect;
          drawX = (canvasWidth - drawWidth) / 2;
          drawY = -blurExpand;
        } else {
          drawWidth = expandedWidth;
          drawHeight = expandedWidth / imgAspect;
          drawX = -blurExpand;
          drawY = (canvasHeight - drawHeight) / 2;
        }

        ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
      } else if (
        gradient &&
        Array.isArray(gradient.colors) &&
        gradient.colors.length >= 2 &&
        Number.isFinite(canvasWidth) &&
        Number.isFinite(canvasHeight) &&
        canvasWidth > 0 &&
        canvasHeight > 0
      ) {
        const blurExpand = blurRadius * 2;
        const expandedWidth = canvasWidth + blurExpand * 2;
        const expandedHeight = canvasHeight + blurExpand * 2;

        const angle =
          typeof gradient.angle === 'number' && Number.isFinite(gradient.angle)
            ? gradient.angle
            : 0;
        const angleRad = ((angle - 90) * Math.PI) / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        const halfWidth = canvasWidth / 2;
        const halfHeight = canvasHeight / 2;
        const length =
          Math.sqrt(
            expandedWidth * expandedWidth + expandedHeight * expandedHeight
          ) / 2;

        const startX = halfWidth - cos * length;
        const startY = halfHeight - sin * length;
        const endX = halfWidth + cos * length;
        const endY = halfHeight + sin * length;

        const grad = ctx.createLinearGradient(startX, startY, endX, endY);
        const colorCount = gradient.colors.length;
        gradient.colors.forEach((color, index) => {
          grad.addColorStop(index / (colorCount - 1), color);
        });

        ctx.fillStyle = grad;
        ctx.fillRect(-blurExpand, -blurExpand, expandedWidth, expandedHeight);
      }

      ctx.filter = 'none';

      if (noise > 0 && (bgImage || gradient)) {
        renderNoise(ctx, canvasWidth, canvasHeight, noise);
      }

      if (image) {
        drawLayer({
          ctx,
          image,
          frameX: frameOffsetX + primaryRect.x,
          frameY: frameOffsetY + primaryRect.y,
          frameWidth: primaryRect.width,
          frameHeight: primaryRect.height,
          inset,
          cornerRadius,
          shadow,
          hasWindowFrame,
          frameTheme,
          titleBarHeight,
          balanceCrop: nativeBalanceCrop,
          insetColor: primaryInsetColor,
        });
      }

      for (const layer of extraLayers) {
        const layerImg = extraLayerImages[layer.id];
        if (!layerImg) continue;
        const rect = layerRects.find(r => r.id === layer.id);
        if (!rect) continue;

        drawLayer({
          ctx,
          image: layerImg,
          frameX: frameOffsetX + rect.x,
          frameY: frameOffsetY + rect.y,
          frameWidth: rect.width,
          frameHeight: rect.height,
          inset,
          cornerRadius,
          shadow,
          hasWindowFrame,
          frameTheme,
          titleBarHeight,
          balanceCrop: { left: 0, top: 0, right: 0, bottom: 0 },
          insetColor: layerInsetColors[layer.id] ?? null,
        });
      }

      ctx.restore();
    }, [
      image,
      padding,
      inset,
      primaryInsetColor,
      cornerRadius,
      shadow,
      gradient,
      bgImage,
      backgroundBlur,
      noise,
      pixelRatio,
      canvasWidth,
      canvasHeight,
      hasWindowFrame,
      frameTheme,
      titleBarHeight,
      nativeBalanceCrop,
      frameOffsetX,
      frameOffsetY,
      extraLayers,
      extraLayerImages,
      primaryRect,
      layerRects,
      layerInsetColors,
    ]);

    return (
      <canvas
        ref={canvasRef}
        width={canvasWidth * pixelRatio}
        height={canvasHeight * pixelRatio}
        style={{
          width: canvasWidth,
          height: canvasHeight,
          display: 'block',
        }}
      />
    );
  }
);

CanvasRenderer.displayName = 'CanvasRenderer';

export default CanvasRenderer;
