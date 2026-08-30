import type { EditorV2Bridge } from '@/types/editor-v2';

declare global {
  interface Window {
    editorV2: EditorV2Bridge;
  }
}

export {};
