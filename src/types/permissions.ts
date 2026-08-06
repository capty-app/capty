export type ScreenRecordingStatus =
  'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export type MicrophoneStatus =
  'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export type CameraStatus =
  'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

export interface PermissionsState {
  screenRecording: ScreenRecordingStatus;
  accessibility: boolean;
  microphone: MicrophoneStatus;
  camera: CameraStatus;
}
