import React, { lazy, Suspense } from 'react';

const EditorV2Window = lazy(
  () => import('@/renderer/editor-v2/window/editor-v2-window')
);

interface EditorVersionHostProps {
  legacyApp: React.ReactNode;
}

const isEditorV2Route = (search: string): boolean =>
  new URLSearchParams(search).get('editor') === 'v2';

export default function EditorVersionHost({
  legacyApp,
}: EditorVersionHostProps) {
  if (!isEditorV2Route(window.location.search)) return legacyApp;
  return (
    <Suspense
      fallback={
        <div className="bg-background text-muted-foreground flex h-screen items-center justify-center text-sm">
          Opening Editor V2…
        </div>
      }
    >
      <EditorV2Window />
    </Suspense>
  );
}
