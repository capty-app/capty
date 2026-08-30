import { lazy, Suspense, useEffect, useState } from 'react';
import type {
  EditorActionShortcuts,
  EditorPreferences,
  EditorShortcuts,
  ScreenshotFormat,
  SettingsConfig,
} from '@/types/settings';
import type { EditorState } from '@/types/history';
import type { CapturePreviewParams } from '@/types/capture-preview';
import { useAccentColor } from '@/renderer/hooks/useAccentColor';
import { ToastProvider } from '@/renderer/components/ui/toast';
import EditorVersionHost from '@/renderer/editor-v2/shell/editor-version-host';

const ScreenshotWindow = lazy(
  () => import('@/renderer/windows/screenshot-window')
);
const SettingsWindow = lazy(() => import('@/renderer/windows/settings-window'));
const ActivationWindow = lazy(
  () => import('@/renderer/windows/activation-window')
);
const OnboardingWindow = lazy(
  () => import('@/renderer/windows/onboarding-window')
);
const PinWindow = lazy(() => import('@/renderer/windows/pin-window'));
const VideoEditorWindow = lazy(
  () => import('@/renderer/windows/video-editor-window')
);
const CapturePreviewWindow = lazy(
  () => import('@/renderer/windows/capture-preview-window')
);

interface ScreenshotParams {
  filePath: string;
  width?: number;
  height?: number;
  editorState?: EditorState;
  historyId?: string;
}

interface PinParams {
  imageBase64: string;
  width: number;
  height: number;
  pinId: string;
}

interface VideoEditorParams {
  filePath: string;
  canSwitchEditorVersion?: boolean;
}

interface LoadEvent {
  type:
    | 'screenshot'
    | 'settings'
    | 'activation'
    | 'onboarding'
    | 'pin'
    | 'video-editor'
    | 'capture-preview';
  params:
    | ScreenshotParams
    | PinParams
    | VideoEditorParams
    | CapturePreviewParams
    | Record<string, never>;
}

function LegacyApp() {
  useAccentColor();

  const [windowData, setWindowData] = useState<LoadEvent | null>(null);
  const [editorPreferences, setEditorPreferences] =
    useState<EditorPreferences | null>(null);
  const [screenshotSettings, setScreenshotSettings] = useState<{
    closeOnCopy: boolean;
    closeOnSave: boolean;
    format: ScreenshotFormat;
  } | null>(null);
  const [editorShortcuts, setEditorShortcuts] =
    useState<EditorShortcuts | null>(null);
  const [editorActionShortcuts, setEditorActionShortcuts] =
    useState<EditorActionShortcuts | null>(null);

  useEffect(() => {
    const handleLoad = async (_event: unknown, data: LoadEvent) => {
      if (data.type === 'screenshot') {
        const [prefs, settings] = await Promise.all([
          window.ipcRenderer.invoke(
            'editor:getPreferences'
          ) as Promise<EditorPreferences>,
          window.ipcRenderer.invoke('settings:get') as Promise<SettingsConfig>,
        ]);
        setEditorPreferences(prefs);
        setScreenshotSettings(settings.screenshot);
        setEditorShortcuts(settings.shortcuts.editor);
        setEditorActionShortcuts(settings.shortcuts.editorActions);
      }
      setWindowData(data);
    };

    window.ipcRenderer.on('load', handleLoad);

    return () => {
      window.ipcRenderer.off('load', handleLoad);
    };
  }, []);

  if (!windowData) {
    return (
      <div className="bg-background flex h-screen w-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (
    windowData.type === 'screenshot' &&
    (!editorPreferences || !screenshotSettings)
  ) {
    return (
      <div className="bg-background flex h-screen w-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const renderWindow = () => {
    switch (windowData.type) {
      case 'screenshot': {
        const screenshotParams = windowData.params as ScreenshotParams;
        return (
          <ScreenshotWindow
            key={screenshotParams.filePath}
            params={screenshotParams}
            initialPreferences={editorPreferences!}
            screenshotSettings={screenshotSettings!}
            editorShortcuts={editorShortcuts ?? undefined}
            editorActionShortcuts={editorActionShortcuts ?? undefined}
          />
        );
      }
      case 'settings':
        return <SettingsWindow />;
      case 'activation':
        return <ActivationWindow />;
      case 'onboarding':
        return <OnboardingWindow />;
      case 'pin':
        return <PinWindow params={windowData.params as PinParams} />;
      case 'video-editor':
        return (
          <VideoEditorWindow params={windowData.params as VideoEditorParams} />
        );
      case 'capture-preview':
        return (
          <CapturePreviewWindow
            params={windowData.params as CapturePreviewParams}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ToastProvider>
      <Suspense
        fallback={
          <div className="bg-background flex h-screen w-full items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        }
      >
        {renderWindow()}
      </Suspense>
    </ToastProvider>
  );
}

function App() {
  return <EditorVersionHost legacyApp={<LegacyApp />} />;
}

export default App;
