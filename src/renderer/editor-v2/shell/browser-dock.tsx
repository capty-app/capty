import React from 'react';
import { Film, Sparkles } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import EffectsBrowser from '@/renderer/editor-v2/effects/effects-browser';
import ProjectBrowser from '@/renderer/editor-v2/media/project-browser';
import type { EditorV2Workspace } from '@/types/editor-v2';

interface BrowserDockProps {
  activeTab: EditorV2Workspace['browserTab'];
  projectToken: string;
  onRemoveManaged: (assetId: string) => Promise<void>;
  onMediaOperationStart: () => (() => void) | null;
  operationsFrozen: boolean;
  onTabChange: (tab: EditorV2Workspace['browserTab']) => void;
  onCollapse: () => void;
}

export default function BrowserDock({
  activeTab,
  projectToken,
  onRemoveManaged,
  onMediaOperationStart,
  operationsFrozen,
  onTabChange,
  onCollapse,
}: BrowserDockProps) {
  return (
    <aside
      aria-label="Project browser"
      className="bg-card flex h-full flex-col"
    >
      <div className="border-border flex h-10 items-center gap-1 border-b px-2">
        <Button
          variant={activeTab === 'project' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 flex-1 justify-start gap-2 px-2"
          onClick={() => onTabChange('project')}
        >
          <Film className="size-3.5" />
          Project
        </Button>
        <Button
          variant={activeTab === 'effects' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 flex-1 justify-start gap-2 px-2"
          onClick={() => onTabChange('effects')}
        >
          <Sparkles className="size-3.5" />
          Effects
        </Button>
      </div>
      {activeTab === 'project' ? (
        <ProjectBrowser
          projectToken={projectToken}
          onRemoveManaged={onRemoveManaged}
          onMediaOperationStart={onMediaOperationStart}
          operationsFrozen={operationsFrozen}
        />
      ) : (
        <EffectsBrowser projectToken={projectToken} />
      )}
      <div className="border-border border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full"
          onClick={onCollapse}
        >
          Collapse browser
        </Button>
      </div>
    </aside>
  );
}
