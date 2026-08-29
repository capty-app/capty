import type {
  ArrowStyle,
  GradientOption,
  HighlightColor,
  HighlightOpacity,
  NumberSize,
  NumberStyle,
  RedactIntensity,
  RedactStyle,
  ShapeFillMode,
  TextFontFamily,
  TextFontSize,
  ToolType,
  WindowFrameSettings,
} from './editor';
import type { HistoryConfig } from './history';
import { DEFAULT_HISTORY_CONFIG } from './history';

export interface StorageConfig {
  screenshotsPath: string;
  recordingsPath: string;
  namingPattern: string;
}

export type SaveLocationKind = 'screenshot' | 'video';

export type SaveLocationsConfig = Record<SaveLocationKind, string>;

export const DEFAULT_SAVE_LOCATIONS_CONFIG: SaveLocationsConfig = {
  screenshot: '',
  video: '',
};

export interface PreviewConfig {
  displayId: number | null;
  followActiveDisplay: boolean;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  screenshotsPath: '',
  recordingsPath: '',
  namingPattern: '%type %Y-%m-%d at %H.%M.%S',
};

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  displayId: null,
  followActiveDisplay: true,
};

export type ScreenshotFormat = 'png' | 'jpeg';

export type MultiImageAttachEdge = 'right' | 'left' | 'top' | 'bottom';

export type ShortcutAction =
  | 'area'
  | 'window'
  | 'screen'
  | 'captureText'
  | 'scanQRCode'
  | 'recordArea'
  | 'recordScreen'
  | 'recordWindow';

export type CloudProvider = 'capty' | 'rest' | 's3';

export interface S3ProviderConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathPrefix: string;
  customDomain: string;
}

export interface RestHeader {
  key: string;
  value: string;
}

export interface RestProviderConfig {
  url: string;
  headers: RestHeader[];
  fileFieldName: string;
  responseIsPlainText: boolean;
  responseUrlPath: string;
}

export interface CloudConfig {
  enabled: boolean;
  activeProvider: CloudProvider;
  s3: S3ProviderConfig;
  rest: RestProviderConfig;
}

export type BackgroundType = 'gradient' | 'image';

export interface GradientBackgroundData {
  colors: string[];
  angle: number;
}

export interface ImageBackgroundData {
  imageUrl: string;
}

export type CustomBackground =
  | {
      id: string;
      type: 'gradient';
      data: GradientBackgroundData;
    }
  | {
      id: string;
      type: 'image';
      data: ImageBackgroundData;
    };

export interface CustomGradient extends GradientOption {
  name: string;
}

export interface WallpaperPreset {
  id: string;
  name: string;
  gradient: GradientOption | null;
  backgroundImage?: string | null;
  backgroundBlur?: number;
  noise?: number;
  padding: number;
  corners: number;
  shadow: number;
  spacing?: number;
  windowFrame?: WindowFrameSettings;
}

export interface WallpaperImagePreset {
  id: string;
  name: string;
  imageUrl: string;
}

export interface EditorPreferences {
  lastTool: ToolType;
  color: string;
  strokeWidth: number;
  arrowStyle: ArrowStyle;
  highlightColor: HighlightColor;
  highlightOpacity: HighlightOpacity;
  numberStyle: NumberStyle;
  numberSize: NumberSize;
  numberStartValue: number;
  textBackground: boolean;
  textFontSize: TextFontSize;
  textFontFamily: TextFontFamily;
  redactStyle: RedactStyle;
  redactIntensity: RedactIntensity;
  shapeFillMode: ShapeFillMode;
}

export interface OnboardingConfig {
  completed: boolean;
  skipped: boolean;
}

export interface EditorShortcuts {
  pen: string;
  highlight: string;
  rectangle: string;
  circle: string;
  line: string;
  arrow: string;
  text: string;
  number: string;
  redact: string;
  select: string;
  crop: string;
  wallpaper: string;
}

export const DEFAULT_UPLOAD_TO_CLOUD_SHORTCUT = 'Command+Shift+U';

export interface EditorActionShortcuts {
  uploadToCloud: string;
}

export interface VideoEditorSidebarShortcuts {
  cursor: string;
  zoom: string;
  drawing: string;
  camera: string;
  audio: string;
  wallpaper: string;
  keyboard: string;
  subtitle: string;
  'first-frame': string;
  export: string;
}

export interface SettingsConfig {
  general: {
    startOnLogin: boolean;
    playSoundOnScreenshot: boolean;
    hideMenuBarIcon: boolean;
    showDeletionNotifications: boolean;
    showCaptureNotifications: boolean;
  };
  screenshot: {
    closeOnCopy: boolean;
    closeOnSave: boolean;
    captureToClipboard: boolean;
    showPreview: boolean;
    hideDesktopIcons: boolean;
    freezeScreen: boolean;
    format: ScreenshotFormat;
    multiImageAttachEdge: MultiImageAttachEdge;
  };
  shortcuts: {
    screenshot: {
      area: string;
      window: string;
      screen: string;
    };
    captureText: string;
    scanQRCode: string;
    timerCapture: string;
    scrollCapture: string;
    recording: {
      area: string;
      screen: string;
      window: string;
    };
    history: string;
    allInOne: string;
    openInEditor: string;
    clipboardInEditor: string;
    editor: EditorShortcuts;
    editorActions: EditorActionShortcuts;
    videoEditorSidebar: VideoEditorSidebarShortcuts;
  };
  editor: EditorPreferences;
  wallpaper: {
    customBackgrounds: CustomBackground[];
    presets: WallpaperPreset[];
    customGradients?: CustomGradient[];
  };
  history: HistoryConfig;
  onboarding: OnboardingConfig;
  cloud: CloudConfig;
  recording: RecordingSettings;
  storage: StorageConfig;
  saveLocations: SaveLocationsConfig;
  preview: PreviewConfig;
  allInOne: AllInOneConfig;
  scrollCapture: ScrollCaptureConfig;
}

export const DEFAULT_ONBOARDING_CONFIG: OnboardingConfig = {
  completed: false,
  skipped: false,
};

export const DEFAULT_S3_PROVIDER_CONFIG: S3ProviderConfig = {
  endpoint: '',
  region: '',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  pathPrefix: '',
  customDomain: '',
};

export const DEFAULT_REST_PROVIDER_CONFIG: RestProviderConfig = {
  url: '',
  headers: [],
  fileFieldName: 'file',
  responseIsPlainText: false,
  responseUrlPath: '',
};

export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  enabled: true,
  activeProvider: 'capty',
  s3: DEFAULT_S3_PROVIDER_CONFIG,
  rest: DEFAULT_REST_PROVIDER_CONFIG,
};

export type CameraShape = 'circle' | 'rounded';

export type CameraSize = 'small' | 'medium' | 'large';

export type CameraResolution = '480p' | '720p' | '1080p';

export interface CameraSettings {
  enabled: boolean;
  selectedDeviceId: string | null;
  selectedDeviceName: string | null;
  shape: CameraShape;
  size: CameraSize;
  position: { x: number; y: number } | null;
  resolution?: CameraResolution;
  flipped?: boolean;
}

export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  enabled: false,
  selectedDeviceId: null,
  selectedDeviceName: null,
  shape: 'rounded',
  size: 'large',
  position: null,
  resolution: '720p',
  flipped: false,
};

export const CAMERA_SIZE_DIMENSIONS: Record<CameraSize, number> = {
  small: 120,
  medium: 180,
  large: 260,
};

export const CAMERA_RESOLUTION_DIMENSIONS: Record<
  CameraResolution,
  { width: number; height: number }
> = {
  '480p': { width: 640, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
};

export interface IOSDeviceSettings {
  id: string;
  name: string | null;
}

export interface RecordingSettings {
  autoZoom: boolean;
  showPreview: boolean;
  systemAudio: boolean;
  micEnabled: boolean;
  selectedMicId: string | null;
  selectedMicName: string | null;
  camera: CameraSettings;
  iosDevice: IOSDeviceSettings | null;
}

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  autoZoom: false,
  showPreview: true,
  systemAudio: true,
  micEnabled: false,
  selectedMicId: null,
  selectedMicName: null,
  camera: DEFAULT_CAMERA_SETTINGS,
  iosDevice: null,
};

export interface AllInOneConfig {
  lastArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export const DEFAULT_ALL_IN_ONE_CONFIG: AllInOneConfig = {
  lastArea: null,
};

export type AutoScrollSpeed = 'slow' | 'medium' | 'fast';

export interface ScrollCaptureConfig {
  autoScrollSpeed: AutoScrollSpeed;
  maxHeight: number;
}

export const DEFAULT_SCROLL_CAPTURE_CONFIG: ScrollCaptureConfig = {
  autoScrollSpeed: 'medium',
  maxHeight: 20000,
};

export const DEFAULT_SETTINGS: SettingsConfig = {
  general: {
    startOnLogin: false,
    playSoundOnScreenshot: true,
    hideMenuBarIcon: false,
    showDeletionNotifications: true,
    showCaptureNotifications: true,
  },
  screenshot: {
    closeOnCopy: false,
    closeOnSave: false,
    captureToClipboard: false,
    showPreview: true,
    hideDesktopIcons: true,
    freezeScreen: false,
    format: 'png',
    multiImageAttachEdge: 'right',
  },
  shortcuts: {
    screenshot: {
      area: 'CommandOrControl+Shift+4',
      window: 'CommandOrControl+Shift+5',
      screen: 'CommandOrControl+Shift+3',
    },
    captureText: '',
    scanQRCode: '',
    timerCapture: '',
    scrollCapture: '',
    recording: {
      area: '',
      screen: '',
      window: '',
    },
    history: '',
    allInOne: '',
    openInEditor: '',
    clipboardInEditor: '',
    editor: {
      pen: 'p',
      highlight: 'h',
      rectangle: 'r',
      circle: 'o',
      line: 'l',
      arrow: 'a',
      text: 't',
      number: 'n',
      redact: 'x',
      select: 'v',
      crop: 'c',
      wallpaper: 'w',
    },
    editorActions: {
      uploadToCloud: DEFAULT_UPLOAD_TO_CLOUD_SHORTCUT,
    },
    videoEditorSidebar: {
      cursor: 'q',
      zoom: 'z',
      drawing: 'd',
      camera: 'm',
      audio: 'a',
      wallpaper: 'w',
      keyboard: 'k',
      subtitle: 's',
      'first-frame': 'f',
      export: 'e',
    },
  },
  editor: {
    lastTool: 'select',
    color: '#FF3B30',
    strokeWidth: 3,
    arrowStyle: 'standard',
    highlightColor: '#FFFF00',
    highlightOpacity: 0.4,
    numberStyle: 'numeric',
    numberSize: 'medium',
    numberStartValue: 1,
    textBackground: true,
    textFontSize: 20,
    textFontFamily: 'sans',
    redactStyle: 'pixelate',
    redactIntensity: 5,
    shapeFillMode: 'outline',
  },
  wallpaper: {
    customBackgrounds: [],
    presets: [],
  },
  history: DEFAULT_HISTORY_CONFIG,
  onboarding: DEFAULT_ONBOARDING_CONFIG,
  cloud: DEFAULT_CLOUD_CONFIG,
  recording: DEFAULT_RECORDING_SETTINGS,
  storage: DEFAULT_STORAGE_CONFIG,
  saveLocations: DEFAULT_SAVE_LOCATIONS_CONFIG,
  preview: DEFAULT_PREVIEW_CONFIG,
  allInOne: DEFAULT_ALL_IN_ONE_CONFIG,
  scrollCapture: DEFAULT_SCROLL_CAPTURE_CONFIG,
};
