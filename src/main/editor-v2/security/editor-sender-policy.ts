import { getWindowData } from '@/main/capture/video/window-manager';
import { isDev } from '@/main/utils/env';
import type { EditorProjectSession } from '@/main/editor-v2/project/project-service';

export interface AuthorizedEditorV2Sender {
  session: EditorProjectSession;
  data: NonNullable<ReturnType<typeof getWindowData>>;
}

export const authorizeEditorV2Sender = async (
  webContentsId: number,
  projectToken: string
): Promise<AuthorizedEditorV2Sender | null> => {
  const data = getWindowData(webContentsId);
  if (
    !isDev ||
    data?.editorVersion !== 'v2' ||
    data.projectToken !== projectToken
  ) {
    return null;
  }
  if (data.projectSession) return { session: data.projectSession, data };

  try {
    const opened = data.projectOpen ? await data.projectOpen : null;
    if (!opened) return null;
    data.projectSession = opened.session;
    return { session: opened.session, data };
  } catch {
    return null;
  }
};
