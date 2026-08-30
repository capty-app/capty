import { EditorV2CompositionEngine } from './composition-engine';
import { createLegacyCaptyEffectAdapter } from './legacy-capty-effect-adapter';
import { BrowserCompositionSourceProvider } from './source-provider';
import type { EditorProjectV2 } from '@/types/editor-v2';

export const createBrowserCompositionEngine = (
  projectToken: string,
  assets: EditorProjectV2['assets']
): EditorV2CompositionEngine =>
  new EditorV2CompositionEngine(
    new BrowserCompositionSourceProvider((assetId, sourceStreamId, sourceRole) => {
      if (!assets[assetId]) {
        return Promise.resolve({
          status: 'failed',
          error: `Asset ${assetId} does not exist`,
        });
      }
      return window.editorV2.getMediaStatus({
        projectToken,
        assetId,
        sourceStreamId,
        sourceRole,
      });
    }),
    createLegacyCaptyEffectAdapter(async (kind, locator) => {
      const result = await window.editorV2.readData({
        projectToken,
        kind,
        locator,
      });
      if (result.status === 'failed') throw new Error(result.error);
      return result.data;
    })
  );
