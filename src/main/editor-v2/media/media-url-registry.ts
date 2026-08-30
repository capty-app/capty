import crypto from 'crypto';
import path from 'path';
import { pathToFileURL } from 'url';
import { net, protocol } from 'electron';

const MEDIA_SCHEME = 'capty-media';

interface MediaUrlEntry {
  ownerId: number;
  filePath: string;
}

const contentTypeForPath = (filePath: string): string => {
  const types: Record<string, string> = {
    '.aac': 'audio/aac',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.m4a': 'audio/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
  };
  return (
    types[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  );
};

export class MediaUrlRegistry {
  private readonly entries = new Map<string, MediaUrlEntry>();
  private readonly tokensByResource = new Map<string, string>();

  authorize(ownerId: number, filePath: string): string {
    const resourceKey = `${ownerId}\0${filePath}`;
    const existing = this.tokensByResource.get(resourceKey);
    if (existing) return `${MEDIA_SCHEME}://resource/${existing}`;
    const token = crypto.randomBytes(24).toString('base64url');
    this.entries.set(token, { ownerId, filePath });
    this.tokensByResource.set(resourceKey, token);
    return `${MEDIA_SCHEME}://resource/${token}`;
  }

  resolve(url: string): MediaUrlEntry | null {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== `${MEDIA_SCHEME}:` ||
        parsed.hostname !== 'resource'
      ) {
        return null;
      }
      const token = parsed.pathname.slice(1);
      return this.entries.get(token) ?? null;
    } catch {
      return null;
    }
  }

  revokeOwner(ownerId: number): void {
    for (const [token, entry] of this.entries) {
      if (entry.ownerId !== ownerId) continue;
      this.entries.delete(token);
      this.tokensByResource.delete(`${entry.ownerId}\0${entry.filePath}`);
    }
  }

  clear(): void {
    this.entries.clear();
    this.tokensByResource.clear();
  }
}

export const mediaUrlRegistry = new MediaUrlRegistry();

export const registerEditorV2MediaScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
};

export const installEditorV2MediaProtocol = (): void => {
  protocol.handle(MEDIA_SCHEME, async request => {
    const entry = mediaUrlRegistry.resolve(request.url);
    if (!entry) return new Response('Not found', { status: 404 });
    const forwardedHeaders = new Headers();
    const range = request.headers.get('range');
    if (range) forwardedHeaders.set('range', range);
    const response = await net.fetch(pathToFileURL(entry.filePath).toString(), {
      method: request.method,
      headers: forwardedHeaders,
    });
    if (!response.ok) return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Type', contentTypeForPath(entry.filePath));
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
};
