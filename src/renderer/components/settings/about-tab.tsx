import { useEffect, useState, useCallback } from 'react';
import {
  Globe,
  Heart,
  RefreshCw,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import { Separator } from '@/renderer/components/ui/separator';
import { Button } from '@/renderer/components/ui/button';
import type { UpdateState, UpdateStatus } from '@/types/update';
import appIcon from '@build/icon.png';

export default function AboutTab() {
  const [version, setVersion] = useState('0.0.0');
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    const getInitialData = async () => {
      const appVersion = await window.ipcRenderer.invoke('app:getVersion');
      setVersion(appVersion);
    };
    getInitialData();
  }, []);

  useEffect(() => {
    const loadUpdateState = async () => {
      const state = await window.ipcRenderer.invoke('update:getState');
      setUpdateState(state);
    };
    loadUpdateState();

    const handleStatusChange = (
      _event: Electron.IpcRendererEvent,
      state: UpdateState
    ) => {
      setUpdateState(state);
    };

    const handleProgress = (
      _event: Electron.IpcRendererEvent,
      progress: number
    ) => {
      setDownloadProgress(progress);
    };

    window.ipcRenderer.on('update:status-changed', handleStatusChange);
    window.ipcRenderer.on('update:download-progress', handleProgress);

    return () => {
      window.ipcRenderer.off('update:status-changed', handleStatusChange);
      window.ipcRenderer.off('update:download-progress', handleProgress);
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    await window.ipcRenderer.invoke('update:check');
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    await window.ipcRenderer.invoke('update:install');
  }, []);

  const handleOpenLicenseNotices = useCallback(() => {
    window.ipcRenderer.send('legal:open-notices');
  }, []);

  const getStatusIcon = (status: UpdateStatus) => {
    switch (status) {
      case 'checking':
      case 'downloading':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'available':
        return <Download className="h-4 w-4" />;
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'up_to_date':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <RefreshCw className="h-4 w-4" />;
    }
  };

  const getStatusText = (status: UpdateStatus) => {
    switch (status) {
      case 'checking':
        return 'Checking for updates...';
      case 'available':
        return 'Update available';
      case 'downloading':
        return 'Downloading update...';
      case 'ready':
        return 'Update ready to install';
      case 'error':
        return 'Update check failed';
      case 'up_to_date':
        return 'You are up to date';
      default:
        return 'Check for updates';
    }
  };

  const renderUpdateSection = () => {
    if (!updateState) return null;

    const status = updateState.status;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(status)}
            <span className="text-sm">{getStatusText(status)}</span>
          </div>

          {(status === 'idle' ||
            status === 'up_to_date' ||
            status === 'error') && (
            <Button variant="outline" size="sm" onClick={handleCheckForUpdates}>
              <RefreshCw className="mr-1 h-3 w-3" />
              Check
            </Button>
          )}
        </div>

        {}
        {status === 'downloading' && (
          <div className="space-y-1">
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="text-muted-foreground text-right text-xs">
              {Math.floor(downloadProgress)}%
            </p>
          </div>
        )}

        {}
        {(status === 'available' || status === 'ready') &&
          updateState.latestVersion && (
            <div className="rounded-lg border bg-green-500/5 p-3">
              <p className="text-sm font-medium">
                Version {updateState.latestVersion} is available
              </p>
              {updateState.releaseNotes && (
                <div className="text-muted-foreground mt-2 max-h-32 overflow-y-auto text-xs">
                  <p className="text-foreground mb-1 font-medium">
                    What&apos;s New:
                  </p>
                  <pre className="font-sans whitespace-pre-wrap">
                    {updateState.releaseNotes}
                  </pre>
                </div>
              )}
            </div>
          )}

        {}
        {status === 'ready' && (
          <Button onClick={handleInstallUpdate} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Install Update
          </Button>
        )}

        {}
        {status === 'error' && updateState.error && (
          <p className="text-xs text-red-500">{updateState.error}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">About Capty</h2>
        <p className="text-muted-foreground text-sm">
          Application information and updates
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <img src={appIcon} alt="Capty" className="h-16 w-16 rounded-xl" />
            <div>
              <CardTitle className="text-2xl">Capty</CardTitle>
              <CardDescription>Version {version}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            A beautiful screenshot tool for macOS. Capture, annotate, and share
            screenshots with powerful editing tools and wallpaper backgrounds.
          </p>

          <Separator />

          {}
          {renderUpdateSection()}

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Globe className="text-muted-foreground h-4 w-4" />
              <a
                href="#"
                onClick={e => {
                  e.preventDefault();
                  window.ipcRenderer.send('open-external', 'https://capty.app');
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                capty.app
              </a>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Heart className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground">
                Made with love for the macOS community
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <FileText className="text-muted-foreground h-4 w-4" />
              <button
                type="button"
                onClick={handleOpenLicenseNotices}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Open-source licenses
              </button>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs">
              <p>&copy; 2025&ndash;2026 Capty. Licensed under AGPL-3.0.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.ipcRenderer.send('open-external', 'https://capty.app');
              }}
            >
              Visit Website
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
