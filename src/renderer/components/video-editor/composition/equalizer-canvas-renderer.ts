import type { Context2D } from './types';
import { getEqualizerLayoutSettings } from '../equalizer-layout';
import type { EqualizerFrameData, EqualizerSettings } from '@/types/equalizer';

interface EqualizerRenderOptions {
  settings: EqualizerSettings;
  frame: EqualizerFrameData;
  videoWidth: number;
  videoHeight: number;
}

function createGradient(
  ctx: Context2D,
  settings: EqualizerSettings,
  x: number,
  y: number,
  width: number,
  height: number
): CanvasGradient {
  const gradient =
    settings.mode === 'circular'
      ? ctx.createRadialGradient(
          x + width / 2,
          y + height / 2,
          0,
          x + width / 2,
          y + height / 2,
          Math.max(width, height) / 2
        )
      : ctx.createLinearGradient(x, y + height, x + width, y);
  gradient.addColorStop(0, settings.colorStart);
  gradient.addColorStop(1, settings.colorEnd);
  return gradient;
}

function renderBackdrop(
  ctx: Context2D,
  settings: EqualizerSettings,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  if (settings.backgroundOpacity <= 0) return;

  ctx.save();
  ctx.globalAlpha *= settings.backgroundOpacity;
  ctx.fillStyle = settings.backgroundColor;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(width, height) * 0.12);
  ctx.fill();
  ctx.restore();
}

function renderSpectrum(
  ctx: Context2D,
  values: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  gradient: CanvasGradient
): void {
  const count = values.length;
  const gap = Math.max(2, width * 0.006);
  const barWidth = Math.max(1, (width - gap * (count - 1)) / count);
  const usableHeight = height * 0.76;
  const bottom = y + height * 0.88;

  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(96, 165, 250, 0.45)';
  ctx.shadowBlur = Math.max(4, height * 0.06);

  for (let index = 0; index < count; index++) {
    const value = Math.max(0.025, values[index]);
    const barHeight = value * usableHeight;
    const barX = x + index * (barWidth + gap);
    const barY = bottom - barHeight;
    const radius = Math.min(barWidth / 2, barHeight / 2);
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, radius);
    ctx.fill();
  }
}

function renderWave(
  ctx: Context2D,
  values: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  gradient: CanvasGradient
): void {
  if (values.length < 2) return;

  const centerY = y + height / 2;
  const amplitude = height * 0.34;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(3, height * 0.04);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
  ctx.shadowBlur = Math.max(5, height * 0.08);
  ctx.beginPath();
  ctx.moveTo(x, centerY + values[0] * amplitude);

  for (let index = 1; index < values.length - 1; index++) {
    const pointX = x + (index / (values.length - 1)) * width;
    const pointY = centerY + values[index] * amplitude;
    const nextX = x + ((index + 1) / (values.length - 1)) * width;
    const nextY = centerY + values[index + 1] * amplitude;
    ctx.quadraticCurveTo(
      pointX,
      pointY,
      (pointX + nextX) / 2,
      (pointY + nextY) / 2
    );
  }

  ctx.lineTo(x + width, centerY + values[values.length - 1] * amplitude);
  ctx.stroke();
}

function renderMirroredWave(
  ctx: Context2D,
  values: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  gradient: CanvasGradient
): void {
  if (values.length < 2) return;

  const centerY = y + height / 2;
  const amplitude = height * 0.42;
  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(139, 92, 246, 0.45)';
  ctx.shadowBlur = Math.max(5, height * 0.08);
  ctx.beginPath();

  for (let index = 0; index < values.length; index++) {
    const pointX = x + (index / (values.length - 1)) * width;
    const pointY = centerY - Math.abs(values[index]) * amplitude;
    if (index === 0) {
      ctx.moveTo(pointX, pointY);
      continue;
    }
    ctx.lineTo(pointX, pointY);
  }

  for (let index = values.length - 1; index >= 0; index--) {
    const pointX = x + (index / (values.length - 1)) * width;
    const pointY = centerY + Math.abs(values[index]) * amplitude;
    ctx.lineTo(pointX, pointY);
  }

  ctx.closePath();
  ctx.fill();
}

function renderCircular(
  ctx: Context2D,
  values: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  gradient: CanvasGradient
): void {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const minDimension = Math.min(width, height);
  const innerRadius = minDimension * 0.36;
  const maxBarLength = minDimension * 0.1;
  const lineWidth = Math.max(2, minDimension * 0.018);

  ctx.strokeStyle = gradient;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
  ctx.shadowBlur = Math.max(5, minDimension * 0.04);

  for (let index = 0; index < values.length; index++) {
    const angle = (index / values.length) * Math.PI * 2 - Math.PI / 2;
    const length = maxBarLength * Math.max(0.06, values[index]);
    const startX = centerX + Math.cos(angle) * innerRadius;
    const startY = centerY + Math.sin(angle) * innerRadius;
    const endX = centerX + Math.cos(angle) * (innerRadius + length);
    const endY = centerY + Math.sin(angle) * (innerRadius + length);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha *= 0.32;
  ctx.lineWidth = Math.max(1, lineWidth * 0.65);
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius * 0.76, 0, Math.PI * 2);
  ctx.stroke();
}

export function renderEqualizer(
  ctx: Context2D,
  options: EqualizerRenderOptions
): void {
  const { settings, frame, videoWidth, videoHeight } = options;
  if (!settings.enabled) return;

  const layoutSettings = getEqualizerLayoutSettings(
    settings,
    videoWidth,
    videoHeight
  );
  const x = layoutSettings.x * videoWidth;
  const y = layoutSettings.y * videoHeight;
  const width = layoutSettings.width * videoWidth;
  const height = layoutSettings.height * videoHeight;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.globalAlpha = settings.opacity;
  renderBackdrop(ctx, settings, x, y, width, height);

  const gradient = createGradient(ctx, settings, x, y, width, height);

  switch (settings.mode) {
    case 'spectrum':
      renderSpectrum(ctx, frame.spectrum, x, y, width, height, gradient);
      break;
    case 'wave':
      renderWave(ctx, frame.waveform, x, y, width, height, gradient);
      break;
    case 'mirrored-wave':
      renderMirroredWave(ctx, frame.waveform, x, y, width, height, gradient);
      break;
    case 'circular':
      renderCircular(ctx, frame.spectrum, x, y, width, height, gradient);
  }

  ctx.restore();
}
