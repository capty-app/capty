import { useState, useCallback, useEffect, useRef } from 'react';
import { Label } from '@/renderer/components/ui/label';
import { Switch } from '@/renderer/components/ui/switch';
import { Slider } from '@/renderer/components/ui/slider';
import { Input } from '@/renderer/components/ui/input';
import { Button } from '@/renderer/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/renderer/components/ui/tooltip';
import {
  FolderOpen,
  RotateCcw,
  HelpCircle,
  Loader2,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import ShortcutInput from './shortcut-input';
import CaptyCloudAccess from './capty-cloud-access';
import EditorCommandShortcutInput from './editor-command-shortcut-input';
import type { SettingsItem } from './settings-registry';
import type { SettingsConfig, StorageConfig } from '@/types/settings';
import { DEFAULT_STORAGE_CONFIG } from '@/types/settings';

interface SettingItemRendererProps {
  item: SettingsItem;
  settings: SettingsConfig;
  onUpdate: (updates: Partial<SettingsConfig>) => void;
}

function getStorageConfig(settings: SettingsConfig): StorageConfig {
  return { ...DEFAULT_STORAGE_CONFIG, ...settings.storage };
}

function NamingPatternControl({
  settings,
  onUpdate,
}: {
  settings: SettingsConfig;
  onUpdate: (updates: Partial<SettingsConfig>) => void;
}) {
  const [tokens, setTokens] = useState<
    { token: string; description: string; example: string }[]
  >([]);
  const [previewFilename, setPreviewFilename] = useState('');
  const [patternError, setPatternError] = useState('');
  const [localPattern, setLocalPattern] = useState(
    getStorageConfig(settings).namingPattern
  );
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    window.ipcRenderer.invoke('storage:getTokens').then(data => {
      if (isMountedRef.current) setTokens(data);
    });
  }, []);

  useEffect(() => {
    window.ipcRenderer
      .invoke('storage:previewFilename', localPattern, 'Screenshot')
      .then(preview => {
        if (isMountedRef.current) setPreviewFilename(preview);
      });
  }, [localPattern]);

  useEffect(() => {
    setLocalPattern(getStorageConfig(settings).namingPattern);
  }, [settings]);

  const handlePatternChange = useCallback(
    async (value: string) => {
      setLocalPattern(value);
      const error = await window.ipcRenderer.invoke(
        'storage:validatePattern',
        value
      );
      if (!isMountedRef.current) return;
      setPatternError(error || '');
      if (!error) {
        onUpdate({
          storage: { ...getStorageConfig(settings), namingPattern: value },
        });
      }
    },
    [settings, onUpdate]
  );

  const handleReset = useCallback(() => {
    const defaultPattern = DEFAULT_STORAGE_CONFIG.namingPattern;
    setLocalPattern(defaultPattern);
    setPatternError('');
    onUpdate({
      storage: { ...getStorageConfig(settings), namingPattern: defaultPattern },
    });
  }, [settings, onUpdate]);

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Naming Pattern</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="text-muted-foreground size-4 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="mb-2 font-medium">Available tokens:</p>
              <div className="space-y-1 text-xs">
                {tokens.map(t => (
                  <div key={t.token} className="flex justify-between gap-4">
                    <code className="bg-muted rounded px-1">{t.token}</code>
                    <span className="text-muted-foreground">
                      {t.description} ({t.example})
                    </span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-2">
          <Input
            value={localPattern}
            onChange={e => handlePatternChange(e.target.value)}
            placeholder="%type %Y-%m-%d at %H.%M.%S"
            className="flex-1 font-mono text-sm"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleReset}>
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset to default</TooltipContent>
          </Tooltip>
        </div>
        {patternError && (
          <p className="text-destructive text-sm">{patternError}</p>
        )}
        <p className="text-muted-foreground text-sm">
          Preview:{' '}
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
            {previewFilename}
          </code>
        </p>
      </div>
    </TooltipProvider>
  );
}

function PathPickerControl({
  pathType,
  settings,
  onUpdate,
}: {
  pathType: 'screenshots' | 'recordings';
  settings: SettingsConfig;
  onUpdate: (updates: Partial<SettingsConfig>) => void;
}) {
  const [defaultPath, setDefaultPath] = useState('');

  useEffect(() => {
    window.ipcRenderer.invoke('storage:getDefaultPaths').then(paths => {
      setDefaultPath(paths[pathType]);
    });
  }, [pathType]);

  const config = getStorageConfig(settings);
  const pathKey =
    pathType === 'screenshots' ? 'screenshotsPath' : 'recordingsPath';
  const customPath = config[pathKey];
  const displayPath = customPath || defaultPath;

  const handleSelect = useCallback(async () => {
    const result = await window.ipcRenderer.invoke(
      'storage:selectPath',
      pathType
    );
    if (result?.error || !result?.path) return;
    onUpdate({
      storage: { ...getStorageConfig(settings), [pathKey]: result.path },
    });
  }, [settings, onUpdate, pathType, pathKey]);

  const handleReset = useCallback(() => {
    onUpdate({
      storage: { ...getStorageConfig(settings), [pathKey]: '' },
    });
  }, [settings, onUpdate, pathKey]);

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <Label>Save Location</Label>
        <div className="flex gap-2">
          <Input value={displayPath} readOnly className="flex-1 text-sm" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleSelect}>
                <FolderOpen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Choose folder</TooltipContent>
          </Tooltip>
          {customPath && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleReset}>
                  <RotateCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset to default</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

function isActiveProviderConfigured(settings: SettingsConfig): boolean {
  const cloud = settings.cloud;
  if (cloud.activeProvider === 'capty') {
    return true;
  }
  if (cloud.activeProvider === 'rest') {
    if (!cloud.rest.url) return false;
    if (cloud.rest.responseIsPlainText) return true;
    return !!cloud.rest.responseUrlPath;
  }
  return Boolean(
    cloud.s3.endpoint &&
    cloud.s3.bucket &&
    cloud.s3.accessKeyId &&
    cloud.s3.secretAccessKey
  );
}

function CloudTestConnectionControl({
  settings,
}: {
  settings: SettingsConfig;
}) {
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');

  const isConfigured = isActiveProviderConfigured(settings);

  const handleTestConnection = useCallback(async () => {
    setTestStatus('testing');
    setTestMessage('');

    try {
      const result = await window.ipcRenderer.invoke('cloud:testConnection');
      if (result.success) {
        setTestStatus('success');
        setTestMessage('Connection successful!');
      } else {
        setTestStatus('error');
        setTestMessage(result.error || 'Connection failed');
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(
        error instanceof Error ? error.message : 'Connection failed'
      );
    }

    setTimeout(() => {
      setTestStatus('idle');
      setTestMessage('');
    }, 3000);
  }, []);

  return (
    <div className="flex items-center gap-3 py-2">
      <Button
        variant="outline"
        onClick={handleTestConnection}
        disabled={!isConfigured || testStatus === 'testing'}
      >
        {testStatus === 'testing' && (
          <Loader2 className="mr-2 size-4 animate-spin" />
        )}
        {testStatus === 'success' && (
          <CheckCircle className="mr-2 size-4 text-green-500" />
        )}
        {testStatus === 'error' && (
          <XCircle className="mr-2 size-4 text-red-500" />
        )}
        Test Connection
      </Button>
      {testMessage && (
        <span
          className={`text-sm ${testStatus === 'success' ? 'text-green-500' : 'text-red-500'}`}
        >
          {testMessage}
        </span>
      )}
      {!isConfigured && (
        <span className="text-muted-foreground text-xs">
          Fill in all required fields first
        </span>
      )}
    </div>
  );
}

function RestHeadersControl({
  settings,
  onUpdate,
}: {
  settings: SettingsConfig;
  onUpdate: (updates: Partial<SettingsConfig>) => void;
}) {
  const headers = settings.cloud.rest.headers;

  const updateHeaders = useCallback(
    (next: { key: string; value: string }[]) => {
      onUpdate({
        cloud: {
          ...settings.cloud,
          rest: { ...settings.cloud.rest, headers: next },
        },
      });
    },
    [settings.cloud, onUpdate]
  );

  const handleAdd = useCallback(() => {
    updateHeaders([...headers, { key: '', value: '' }]);
  }, [headers, updateHeaders]);

  const handleChange = useCallback(
    (index: number, field: 'key' | 'value', value: string) => {
      const next = headers.map((h, i) =>
        i === index ? { ...h, [field]: value } : h
      );
      updateHeaders(next);
    },
    [headers, updateHeaders]
  );

  const handleRemove = useCallback(
    (index: number) => {
      updateHeaders(headers.filter((_, i) => i !== index));
    },
    [headers, updateHeaders]
  );

  return (
    <div className="grid gap-2 py-2">
      <Label>Request Headers</Label>
      <p className="text-muted-foreground text-xs">
        Custom headers sent with the upload request (e.g. Authorization)
      </p>
      <div className="grid gap-2">
        {headers.map((header, index) => (
          <div key={index} className="flex gap-2">
            <Input
              placeholder="Header name"
              value={header.key}
              onChange={e => handleChange(index, 'key', e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Header value"
              value={header.value}
              onChange={e => handleChange(index, 'value', e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleRemove(index)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={handleAdd} className="w-fit">
        <Plus className="mr-2 size-4" />
        Add header
      </Button>
    </div>
  );
}

export default function SettingItemRenderer({
  item,
  settings,
  onUpdate,
}: SettingItemRendererProps) {
  if (
    'visibleWhen' in item &&
    item.visibleWhen &&
    !item.visibleWhen(settings)
  ) {
    return null;
  }

  if (item.type === 'naming-pattern') {
    return <NamingPatternControl settings={settings} onUpdate={onUpdate} />;
  }

  if (item.type === 'path-picker') {
    return (
      <PathPickerControl
        pathType={item.pathType}
        settings={settings}
        onUpdate={onUpdate}
      />
    );
  }

  if (item.type === 'cloud-test-connection') {
    return <CloudTestConnectionControl settings={settings} />;
  }

  if (item.type === 'capty-cloud-access') {
    return <CaptyCloudAccess />;
  }

  if (item.type === 'rest-headers') {
    return <RestHeadersControl settings={settings} onUpdate={onUpdate} />;
  }

  const handleSwitchChange = async (checked: boolean) => {
    if (item.type !== 'switch') return;
    if (item.onBeforeChange) {
      const allowed = await item.onBeforeChange(settings, checked);
      if (!allowed) return;
    }
    onUpdate(item.setValue(settings, checked));
  };

  switch (item.type) {
    case 'switch':
      return (
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex-1 space-y-0.5">
            <Label className="text-sm">{item.label}</Label>
            <p className="text-muted-foreground text-xs">{item.description}</p>
          </div>
          <Switch
            checked={item.getValue(settings)}
            onCheckedChange={handleSwitchChange}
            disabled={item.disabled?.(settings)}
          />
        </div>
      );

    case 'select':
      return (
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex-1 space-y-0.5">
            <Label className="text-sm">{item.label}</Label>
            <p className="text-muted-foreground text-xs">{item.description}</p>
          </div>
          <Select
            value={item.getValue(settings)}
            onValueChange={v => onUpdate(item.setValue(settings, v))}
          >
            <SelectTrigger className="w-auto min-w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {item.options.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'slider':
      return (
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{item.label}</Label>
            <span className="text-muted-foreground text-sm">
              {item.getValue(settings)}
            </span>
          </div>
          <Slider
            value={[item.getValue(settings)]}
            onValueChange={v => onUpdate(item.setValue(settings, v[0]))}
            min={item.min}
            max={item.max}
            step={item.step}
          />
          <p className="text-muted-foreground text-xs">{item.description}</p>
        </div>
      );

    case 'shortcut':
      return (
        <ShortcutInput
          label={item.label}
          value={item.getValue(settings)}
          onChange={v => onUpdate(item.setValue(settings, v))}
          singleKey={item.singleKey}
        />
      );

    case 'editor-command-shortcut':
      return (
        <EditorCommandShortcutInput
          commandId={item.commandId}
          settings={settings}
          onUpdate={onUpdate}
        />
      );

    case 'input':
      return (
        <div className="grid gap-2 py-2">
          <Label>{item.label}</Label>
          <Input
            type={item.inputType ?? 'text'}
            placeholder={item.placeholder}
            value={item.getValue(settings)}
            onChange={e => onUpdate(item.setValue(settings, e.target.value))}
          />
          {item.hint && (
            <p className="text-muted-foreground text-xs">{item.hint}</p>
          )}
        </div>
      );

    default:
      return null;
  }
}
