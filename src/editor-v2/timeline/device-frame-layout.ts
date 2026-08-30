export interface DeviceFrameLayout {
  frameWidth: number;
  frameHeight: number;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  screenCornerRadius: number;
  deviceType: 'iphone' | 'ipad';
}

export interface DeviceFrameConfig {
  bezelRatio: number;
  deviceCornerRatio: number;
  screenCornerRatio: number;
  sideButtonWidthRatio: number;
  dynamicIslandWidthRatio: number;
  dynamicIslandHeightRatio: number;
  dynamicIslandTopRatio: number;
  hasDynamicIsland: boolean;
}

export const IPHONE_DEVICE_FRAME_CONFIG: DeviceFrameConfig = {
  bezelRatio: 0.01,
  deviceCornerRatio: 0.065,
  screenCornerRatio: 0.055,
  sideButtonWidthRatio: 0.006,
  dynamicIslandWidthRatio: 0.25,
  dynamicIslandHeightRatio: 0.03,
  dynamicIslandTopRatio: 0.02,
  hasDynamicIsland: true,
};

export const IPAD_DEVICE_FRAME_CONFIG: DeviceFrameConfig = {
  bezelRatio: 0.008,
  deviceCornerRatio: 0.035,
  screenCornerRatio: 0.025,
  sideButtonWidthRatio: 0.004,
  dynamicIslandWidthRatio: 0,
  dynamicIslandHeightRatio: 0,
  dynamicIslandTopRatio: 0,
  hasDynamicIsland: false,
};

export const getDeviceFrameConfig = (
  deviceType: DeviceFrameLayout['deviceType']
): DeviceFrameConfig =>
  deviceType === 'ipad' ? IPAD_DEVICE_FRAME_CONFIG : IPHONE_DEVICE_FRAME_CONFIG;

const getDeviceType = (
  videoWidth: number,
  videoHeight: number
): DeviceFrameLayout['deviceType'] => {
  const aspectRatio = videoWidth / videoHeight;
  if (aspectRatio <= 0.55) return 'iphone';
  if (aspectRatio >= 0.6) return 'ipad';
  return videoWidth >= 1400 ? 'ipad' : 'iphone';
};

export const calculateDeviceFrameLayout = (
  videoWidth: number,
  videoHeight: number
): DeviceFrameLayout => {
  const deviceType = getDeviceType(videoWidth, videoHeight);
  const config = getDeviceFrameConfig(deviceType);
  const bezel = Math.round(
    Math.max(videoWidth, videoHeight) * config.bezelRatio
  );
  const frameWidth = videoWidth + bezel * 2;
  const frameHeight = videoHeight + bezel * 2;
  const screenCornerRadius = Math.round(
    Math.max(frameWidth, frameHeight) * config.screenCornerRatio
  );
  return {
    frameWidth,
    frameHeight,
    screenX: bezel,
    screenY: bezel,
    screenWidth: videoWidth,
    screenHeight: videoHeight,
    screenCornerRadius,
    deviceType,
  };
};
