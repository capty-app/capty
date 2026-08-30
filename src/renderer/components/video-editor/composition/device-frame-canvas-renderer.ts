import {
  calculateDeviceFrameLayout,
  getDeviceFrameConfig,
  type DeviceFrameConfig,
  type DeviceFrameLayout,
} from '@/editor-v2/timeline/device-frame-layout';
import type { Context2D } from './types';
import type { ShadowConfig } from './wallpaper-canvas-renderer';

export { calculateDeviceFrameLayout };
export type { DeviceFrameLayout };

const DEVICE_COLOR = '#1a1a1a';
const DEVICE_EDGE_COLOR = '#2a2a2a';
const DYNAMIC_ISLAND_COLOR = '#000000';

let frameOffscreen: OffscreenCanvas | null = null;
let frameOffscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

export function renderDeviceFrame(
  ctx: Context2D,
  layout: DeviceFrameLayout,
  offsetX: number,
  offsetY: number,
  shadowConfig?: ShadowConfig | null
): void {
  const {
    frameWidth,
    frameHeight,
    screenX,
    screenY,
    screenWidth,
    screenHeight,
    deviceType,
  } = layout;

  const config = getDeviceFrameConfig(deviceType);

  const paddedWidth = Math.ceil(
    frameWidth + frameWidth * config.sideButtonWidthRatio
  );
  const paddedHeight = frameHeight;

  if (
    !frameOffscreen ||
    frameOffscreen.width !== paddedWidth ||
    frameOffscreen.height !== paddedHeight
  ) {
    frameOffscreen = new OffscreenCanvas(paddedWidth, paddedHeight);
    frameOffscreenCtx = frameOffscreen.getContext('2d');
  }

  if (!frameOffscreenCtx) return;

  const offCtx = frameOffscreenCtx;
  offCtx.clearRect(0, 0, paddedWidth, paddedHeight);

  const deviceCornerRadius = Math.round(
    Math.max(frameWidth, frameHeight) * config.deviceCornerRatio
  );
  const screenCornerRadius = Math.round(
    Math.max(frameWidth, frameHeight) * config.screenCornerRatio
  );

  const btnPad = Math.round(frameWidth * config.sideButtonWidthRatio) / 2;

  offCtx.save();
  offCtx.translate(btnPad, 0);

  drawDeviceBody(offCtx, frameWidth, frameHeight, deviceCornerRadius);
  drawSideButtons(offCtx, frameWidth, frameHeight, deviceCornerRadius, config);
  drawScreenCutout(
    offCtx,
    screenX,
    screenY,
    screenWidth,
    screenHeight,
    screenCornerRadius
  );

  if (config.hasDynamicIsland) {
    drawDynamicIsland(offCtx, frameWidth, frameHeight, config);
  }

  offCtx.restore();

  ctx.save();
  if (shadowConfig) {
    ctx.shadowColor = `rgba(0, 0, 0, ${shadowConfig.opacity})`;
    ctx.shadowBlur = shadowConfig.blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = shadowConfig.offsetY;
  }
  ctx.drawImage(frameOffscreen, offsetX - btnPad, offsetY);
  ctx.restore();
}

function drawDeviceBody(
  ctx: Context2D,
  width: number,
  height: number,
  cornerRadius: number
): void {
  ctx.save();

  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, cornerRadius);
  ctx.fillStyle = DEVICE_COLOR;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = DEVICE_EDGE_COLOR;
  ctx.stroke();

  ctx.restore();
}

function drawSideButtons(
  ctx: Context2D,
  width: number,
  height: number,
  cornerRadius: number,
  config: DeviceFrameConfig
): void {
  const buttonWidth = Math.round(width * config.sideButtonWidthRatio);
  const buttonRadius = buttonWidth / 2;

  ctx.save();
  ctx.fillStyle = DEVICE_EDGE_COLOR;

  const powerY = cornerRadius + height * 0.15;
  const powerHeight = height * 0.1;
  ctx.beginPath();
  ctx.roundRect(
    width - buttonWidth / 2,
    powerY,
    buttonWidth,
    powerHeight,
    buttonRadius
  );
  ctx.fill();

  const muteY = cornerRadius + height * 0.1;
  const muteHeight = height * 0.03;
  ctx.beginPath();
  ctx.roundRect(-buttonWidth / 2, muteY, buttonWidth, muteHeight, buttonRadius);
  ctx.fill();

  const volUpY = muteY + muteHeight + height * 0.02;
  const volButtonHeight = height * 0.06;
  ctx.beginPath();
  ctx.roundRect(
    -buttonWidth / 2,
    volUpY,
    buttonWidth,
    volButtonHeight,
    buttonRadius
  );
  ctx.fill();

  const volDownY = volUpY + volButtonHeight + height * 0.01;
  ctx.beginPath();
  ctx.roundRect(
    -buttonWidth / 2,
    volDownY,
    buttonWidth,
    volButtonHeight,
    buttonRadius
  );
  ctx.fill();

  ctx.restore();
}

function drawScreenCutout(
  ctx: Context2D,
  screenX: number,
  screenY: number,
  screenWidth: number,
  screenHeight: number,
  cornerRadius: number
): void {
  ctx.save();

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.roundRect(screenX, screenY, screenWidth, screenHeight, cornerRadius);
  ctx.fill();

  ctx.restore();
}

function drawDynamicIsland(
  ctx: Context2D,
  frameWidth: number,
  frameHeight: number,
  config: DeviceFrameConfig
): void {
  const islandWidth = Math.round(frameWidth * config.dynamicIslandWidthRatio);
  const islandHeight = Math.round(
    Math.max(frameWidth, frameHeight) * config.dynamicIslandHeightRatio
  );
  const islandX = Math.round((frameWidth - islandWidth) / 2);
  const topBezel = Math.round(
    Math.max(frameWidth, frameHeight) * config.bezelRatio
  );
  const islandTopOffset = Math.round(
    Math.max(frameWidth, frameHeight) * config.dynamicIslandTopRatio
  );
  const islandY = topBezel + islandTopOffset;
  const islandRadius = islandHeight / 2;

  ctx.save();
  ctx.fillStyle = DYNAMIC_ISLAND_COLOR;
  ctx.beginPath();
  ctx.roundRect(islandX, islandY, islandWidth, islandHeight, islandRadius);
  ctx.fill();
  ctx.restore();
}
