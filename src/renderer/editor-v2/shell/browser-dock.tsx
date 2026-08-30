import React from 'react';
import { Film, Search, Sparkles } from 'lucide-react';

import { Button } from '@/renderer/components/ui/button';
import type { EditorV2Workspace } from '@/types/editor-v2';

interface BrowserDockProps {
  activeTab: EditorV2Workspace['browserTab'];
  onTabChange: (tab: EditorV2Workspace['browserTab']) => void;
  onCollapse: () => void;
}

export default function BrowserDock({
  activeTab,
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
      <div className="border-border flex h-9 items-center gap-2 border-b px-3">
        <Search className="text-muted-foreground size-3.5" />
        <span className="text-muted-foreground text-xs">
          Search {activeTab}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-center">
        <div>
          <div className="bg-muted mx-auto mb-3 flex size-10 items-center justify-center rounded-md">
            {activeTab === 'project' ? (
              <Film className="text-muted-foreground size-5" />
            ) : (
              <Sparkles className="text-muted-foreground size-5" />
            )}
          </div>
          <p className="text-sm font-medium">
            {activeTab === 'project' ? 'Project media' : 'Effects library'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {activeTab === 'project'
              ? 'Media import is not available in this preview.'
              : 'Effects are not available in this preview.'}
          </p>
        </div>
      </div>
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
