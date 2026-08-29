import type { Context2D } from './types';
import { getEqualizerLayoutSettings } from '../equalizer-layout';
import type { EqualizerFrameData, EqualizerSettings } from '@/types/equalizer';

interface EqualizerRenderOptions {
  settings: EqualizerSettings;
  frame: EqualizerFrameData;
  videoWidth: number;
  videoHeight: number;
}

interface BarLayout {
  gap: number;
  barWidth: number;
  step: number;
}

function createGradient(
  ctx: Context2D,
  settings: EqualizerSettings,
  x: number,
  y: number,
  width: number,
  height: number
): CanvasGradient {
  const isRadial =
    settings.mode === 'circular' ||
    settings.mode === 'ring' ||
    settings.mode === 'pulse';
  const gradient = isRadial
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

function layoutBars(width: number, count: number): BarLayout {
  const gap = Math.max(2, width * 0.006);
  const barWidth = Math.max(1, (width - gap * (count - 1)) / count);
  return { gap, barWidth, step: barWidth + gap };
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
  const { barWidth, step } = layoutBars(width, values.length);
  const usableHeight = height * 0.76;
  const bottom = y + height * 0.88;

  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(96, 165, 250, 0.45)';
  ctx.shadowBlur = Math.max(4, height * 0.06);

  for (let index = 0; index < values.length; index++) {
    const value = Math.max(0.025, values[index]);
    const barHeight = value * usableHeight;
    const barX = x + index * step;
    const barY = bottom - barHeight;
    const radius = Math.min(barWidth / 2, barHeight / 2);
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, radius);
    ctx.fill();
  }
}

function renderMirror(
  ctx: Context2D,
  values: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  gradient: CanvasGradient
): void {
  const { barWidth, step } = layoutBars(width, values.length);
  const centerY = y + height / 2;
  const amplitude = height * 0.42;

  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(139, 92, 246, 0.45)';
  ctx.shadowBlur = Math.max(4, height * 0.06);

  for (let index = 0; index < values.length; index++) {
    const value = Math.max(0.02, values[index]);
    const barHeight = value * amplitude;
    const barX = x + index * step;
    const barY = centerY - barHeight;
    const radius = Math.min(barWidth / 2, barHeight / 2);
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight * 2, radius);
    ctx.fill();
  }
}

function renderDots(
  ctx: Context2D,
  values: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  gradient: CanvasGradient
): void {
  const cell = width / values.length;
  const centerY = y + height / 2;
  const maxRadius = Math.min(cell * 0.42, height * 0.4);

  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
  ctx.shadowBlur = Math.max(4, height * 0.05);

  for (let index = 0; index < values.length; index++) {
    const value = Math.max(0.06, values[index]);
    const radius = Math.max(1.5, maxRadius * value);
    ctx.beginPath();
    ctx.arc(x + cell * (index + 0.5), centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }
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

function traceSmoothRing(
  ctx: Context2D,
  points: Array<{ x: number; y: number }>
): void {
  const midPoint = (from: number, to: number) => ({
    x: (points[from].x + points[to].x) / 2,
    y: (points[from].y + points[to].y) / 2,
  });

  const firstMid = midPoint(0, points.length - 1);
  ctx.moveTo(firstMid.x, firstMid.y);

  for (let index = 0; index < points.length; index++) {
    const next = (index + 1) % points.length;
    const mid = midPoint(index, next);
    ctx.quadraticCurveTo(points[index].x, points[index].y, mid.x, mid.y);
  }

  ctx.closePath();
}

function renderRing(
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
  const innerRadius = minDimension * 0.28;
  const maxExtension = minDimension * 0.18;
  const lineWidth = Math.max(2, minDimension * 0.02);
  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < values.length; index++) {
    const angle = (index / values.length) * Math.PI * 2 - Math.PI / 2;
    const radius = innerRadius + maxExtension * Math.max(0.04, values[index]);
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  }

  ctx.strokeStyle = gradient;
  ctx.fillStyle = gradient;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(139, 92, 246, 0.45)';
  ctx.shadowBlur = Math.max(5, minDimension * 0.05);

  ctx.beginPath();
  traceSmoothRing(ctx, points);
  const baseAlpha = ctx.globalAlpha;
  ctx.globalAlpha = baseAlpha * 0.16;
  ctx.fill();
  ctx.globalAlpha = baseAlpha;
  ctx.stroke();
}

function renderPulse(
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
  let level = 0;
  for (let index = 0; index < values.length; index++) {
    level += values[index];
  }
  level /= values.length;

  const radius = minDimension * (0.16 + 0.18 * Math.max(0.03, level));

  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';
  ctx.shadowBlur = Math.max(6, minDimension * 0.08);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.globalAlpha *= 0.35;
  ctx.lineWidth = Math.max(1, minDimension * 0.012);
  ctx.strokeStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 1.28, 0, Math.PI * 2);
  ctx.stroke();
}

export function renderEqualizer(
  ctx: Context2D,
  options: EqualizerRenderOptions
): void {
  const { settings, frame, videoWidth, videoHeight } = options;

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
    case 'mirror':
      renderMirror(ctx, frame.spectrum, x, y, width, height, gradient);
      break;
    case 'dots':
      renderDots(ctx, frame.spectrum, x, y, width, height, gradient);
      break;
    case 'circular':
      renderCircular(ctx, frame.spectrum, x, y, width, height, gradient);
      break;
    case 'ring':
      renderRing(ctx, frame.spectrum, x, y, width, height, gradient);
      break;
    case 'pulse':
      renderPulse(ctx, frame.spectrum, x, y, width, height, gradient);
  }

  ctx.restore();
}
