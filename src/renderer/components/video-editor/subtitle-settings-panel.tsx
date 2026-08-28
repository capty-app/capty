import { useCallback, useEffect, useState } from 'react';
import { Edit3, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { Label } from '@/renderer/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/renderer/components/ui/tabs';
import { Textarea } from '@/renderer/components/ui/textarea';
import SubtitleDataEditorDialog from './subtitle-data-editor-dialog';
import {
  DataEditorSection,
  ResetButton,
  SettingsPanelHeader,
  TabSelector,
} from './components';
import { useStyleUpdater } from './hooks/use-style-updater';
import type {
  SubtitleData,
  SubtitleGenerationOptions,
  SubtitleGenerationStatus,
  SubtitleStyle,
  WhisperDownloadStatus,
  WhisperModel,
} from '@/types/subtitle';
import { DEFAULT_SUBTITLE_STYLE, WHISPER_MODELS } from '@/types/subtitle';
import { FONT_SIZE_OPTIONS } from './constants';

interface SubtitleSettingsPanelProps {
  subtitleStyle: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
  subtitleData: SubtitleData | null;
  hasMicAudio: boolean;
  videoDuration: number;
  onGenerate: (options: SubtitleGenerationOptions) => Promise<void>;
  onDelete: () => Promise<void>;
  onSubtitleDataSave: (
    data: SubtitleData
  ) => Promise<{ success: boolean; error?: string }>;
  onSubtitleDataImport: () => Promise<{ success: boolean; error?: string }>;
}

const POSITION_OPTIONS: {
  value: 'bottom' | 'top';
  label: string;
}[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
];

const BACKGROUND_OPTIONS: {
  value: 'dark' | 'light' | 'none';
  label: string;
}[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'none', label: 'None' },
];

export default function SubtitleSettingsPanel({
  subtitleStyle,
  onStyleChange,
  subtitleData,
  hasMicAudio,
  videoDuration,
  onGenerate,
  onDelete,
  onSubtitleDataSave,
  onSubtitleDataImport,
}: SubtitleSettingsPanelProps) {
  const [selectedModel, setSelectedModel] = useState<WhisperModel>('base');
  const [customPrompt, setCustomPrompt] = useState('');
  const [downloadStatus, setDownloadStatus] = useState<WhisperDownloadStatus>({
    status: 'not-checked',
  });
  const [generationStatus, setGenerationStatus] =
    useState<SubtitleGenerationStatus>({ status: 'idle' });
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const checkWhisperStatus = useCallback(async () => {
    setDownloadStatus({ status: 'checking' });
    const status = await window.ipcRenderer.invoke(
      'video-editor:getWhisperStatus'
    );
    const modelAvailable = await window.ipcRenderer.invoke(
      'video-editor:isWhisperModelAvailable',
      selectedModel
    );

    if (status.binaryAvailable && modelAvailable) {
      setDownloadStatus({ status: 'ready' });
    } else {
      setDownloadStatus({ status: 'not-downloaded' });
    }
  }, [selectedModel]);

  useEffect(() => {
    const handleDownloadProgress = (
      _: unknown,
      progress: { item: 'binary' | WhisperModel; percent: number }
    ) => {
      setDownloadStatus({
        status: 'downloading',
        progress: progress.percent,
        item: progress.item,
      });
    };

    const handleGenerationProgress = (_: unknown, percent: number) => {
      setGenerationStatus({ status: 'generating', progress: percent });
    };

    window.ipcRenderer.on('whisper:download-progress', handleDownloadProgress);
    window.ipcRenderer.on(
      'subtitle:generation-progress',
      handleGenerationProgress
    );

    return () => {
      window.ipcRenderer.off(
        'whisper:download-progress',
        handleDownloadProgress
      );
      window.ipcRenderer.off(
        'subtitle:generation-progress',
        handleGenerationProgress
      );
    };
  }, []);

  useEffect(() => {
    if (hasMicAudio) {
      checkWhisperStatus();
    }
  }, [selectedModel, checkWhisperStatus, hasMicAudio]);

  const updateStyle = useStyleUpdater(subtitleStyle, onStyleChange);

  const handleGenerate = async () => {
    if (
      downloadStatus.status !== 'ready' &&
      downloadStatus.status !== 'not-downloaded'
    ) {
      return;
    }

    if (downloadStatus.status === 'not-downloaded') {
      setDownloadStatus({
        status: 'downloading',
        progress: 0,
        item: selectedModel,
      });
      const downloadResult = await window.ipcRenderer.invoke(
        'video-editor:downloadWhisper',
        selectedModel
      );
      if (!downloadResult.success) {
        setGenerationStatus({
          status: 'error',
          message: downloadResult.error || 'Download failed',
        });
        setDownloadStatus({ status: 'not-downloaded' });
        return;
      }
      setDownloadStatus({ status: 'ready' });
    }

    setGenerationStatus({ status: 'generating', progress: 0 });

    try {
      await onGenerate({
        model: selectedModel,
        prompt: customPrompt || undefined,
      });
      setGenerationStatus({ status: 'complete' });
    } catch (error) {
      setGenerationStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Generation failed',
      });
    }
  };

  const handleDelete = async () => {
    await onDelete();
    setGenerationStatus({ status: 'idle' });
  };

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    setImportError(null);
    try {
      const result = await onSubtitleDataImport();
      if (!result.success && result.error && result.error !== 'Cancelled') {
        setImportError(result.error);
      }
    } finally {
      setIsImporting(false);
    }
  }, [onSubtitleDataImport]);

  const hasSubtitles = subtitleData && subtitleData.segments.length > 0;

  const isProcessing =
    downloadStatus.status === 'downloading' ||
    generationStatus.status === 'generating';

  const isGenerateDisabled =
    isProcessing || downloadStatus.status === 'checking';

  if (!hasSubtitles) {
    return (
      <div className="space-y-4 p-4">
        <SettingsPanelHeader
          title="Subtitles"
          description={
            hasMicAudio
              ? 'Generate subtitles from microphone audio or import manually'
              : 'No microphone audio available. Import subtitles manually.'
          }
        />

        {hasMicAudio && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Model</Label>
              <Tabs
                value={selectedModel}
                onValueChange={(value: string) =>
                  setSelectedModel(value as WhisperModel)
                }
              >
                <TabsList className="w-full">
                  {WHISPER_MODELS.map(model => (
                    <TabsTrigger
                      key={model.id}
                      value={model.id}
                      className="flex-1"
                      disabled={isProcessing}
                    >
                      {model.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="text-muted-foreground space-y-1 text-xs">
                <p>
                  {
                    WHISPER_MODELS.find(m => m.id === selectedModel)
                      ?.description
                  }
                </p>
                <p>
                  Download:{' '}
                  {
                    WHISPER_MODELS.find(m => m.id === selectedModel)
                      ?.downloadSize
                  }{' '}
                  (first time only) · Memory:{' '}
                  {
                    WHISPER_MODELS.find(m => m.id === selectedModel)
                      ?.memoryUsage
                  }
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Custom Prompt (optional)</Label>
              <Textarea
                value={customPrompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setCustomPrompt(e.target.value)
                }
                placeholder="Add context to improve accuracy..."
                className="h-20 resize-none text-sm"
                disabled={isProcessing}
              />
              <p className="text-muted-foreground text-xs">
                Add context like speaker names, technical terms, or topics
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerateDisabled}
              className="w-full"
            >
              {isGenerateDisabled ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {downloadStatus.status === 'downloading'
                    ? `Downloading model (${downloadStatus.progress}%)`
                    : downloadStatus.status === 'checking'
                      ? 'Checking...'
                      : `Generating (${generationStatus.status === 'generating' ? generationStatus.progress : 0}%)`}
                </>
              ) : (
                'Generate Subtitles'
              )}
            </Button>

            {generationStatus.status === 'error' && (
              <p className="text-destructive text-center text-xs">
                {generationStatus.message}
              </p>
            )}

            <div className="border-border relative border-t pt-4">
              <span className="text-muted-foreground bg-muted-background absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 text-xs">
                or
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {hasMicAudio
              ? 'You can also add subtitles manually by importing a JSON/SRT file or creating them in the editor.'
              : 'You can add subtitles manually by importing a JSON/SRT file or creating them in the editor.'}
          </p>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleImport}
              disabled={isImporting}
              className="w-full gap-2"
            >
              <FileUp className="size-3.5" />
              {isImporting ? 'Importing...' : 'Import from File'}
            </Button>

            {importError && (
              <p className="text-destructive text-center text-xs">
                {importError}
              </p>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditorOpen(true)}
              className="w-full gap-2"
            >
              <Edit3 className="size-3.5" />
              Create Manually
            </Button>
          </div>
        </div>

        <div className="border-border bg-muted-background space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Subtitle Data Format</p>
          <p className="text-muted-foreground text-xs">
            Subtitle data is a JSON file containing segments with start/end
            times (in seconds) and text content. You can also import standard
            SRT files.
          </p>
        </div>

        <SubtitleDataEditorDialog
          open={isEditorOpen}
          onOpenChange={setIsEditorOpen}
          initialData={null}
          videoDuration={videoDuration}
          onSave={onSubtitleDataSave}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <SettingsPanelHeader
        title="Subtitles"
        description="Show subtitles in your video"
        enabled={subtitleStyle.visible}
        onEnabledChange={checked => updateStyle({ visible: checked })}
      />

      {!subtitleStyle.visible ? (
        <p className="text-muted-foreground text-sm">
          Subtitles are disabled. Enable them to show subtitles in your video.
        </p>
      ) : (
        <>
          <TabSelector
            label="Size"
            value={subtitleStyle.fontSize}
            options={[...FONT_SIZE_OPTIONS]}
            onChange={value =>
              updateStyle({ fontSize: value as 'small' | 'medium' | 'large' })
            }
          />

          <TabSelector
            label="Position"
            value={subtitleStyle.position}
            options={POSITION_OPTIONS}
            onChange={value =>
              updateStyle({ position: value as 'bottom' | 'top' })
            }
          />

          <TabSelector
            label="Background"
            value={subtitleStyle.backgroundColor}
            options={BACKGROUND_OPTIONS}
            onChange={value =>
              updateStyle({
                backgroundColor: value as 'dark' | 'light' | 'none',
              })
            }
          />

          <DataEditorSection
            label="Subtitle Data"
            onEdit={() => setIsEditorOpen(true)}
            onImport={handleImport}
            isImporting={isImporting}
          >
            {subtitleData.segments.length} segments
            {subtitleData.meta.model !== 'manual' &&
              subtitleData.meta.model !== 'imported' &&
              ` · Generated with ${subtitleData.meta.model} model`}
            {subtitleData.meta.prompt && ' · Using custom prompt'}
          </DataEditorSection>

          {hasMicAudio && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={isProcessing}
                className="flex-1"
              >
                Regenerate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isProcessing}
                className="text-destructive hover:text-destructive flex-1"
              >
                Delete
              </Button>
            </div>
          )}

          {!hasMicAudio && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isProcessing}
              className="text-destructive hover:text-destructive w-full"
            >
              Delete Subtitles
            </Button>
          )}

          <ResetButton onClick={() => onStyleChange(DEFAULT_SUBTITLE_STYLE)} />

          <SubtitleDataEditorDialog
            open={isEditorOpen}
            onOpenChange={setIsEditorOpen}
            initialData={subtitleData}
            videoDuration={videoDuration}
            onSave={onSubtitleDataSave}
          />
        </>
      )}
    </div>
  );
}
