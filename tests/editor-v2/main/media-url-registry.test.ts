import { describe, expect, it } from 'vitest';

import { MediaUrlRegistry } from '@/main/editor-v2/media/media-url-registry';

describe('Editor V2 authorized media URLs', () => {
  it('uses opaque unguessable URLs and revokes every window-owned resource', () => {
    const registry = new MediaUrlRegistry();
    const sourcePath = '/Users/person/Secret/source.mov';
    const first = registry.authorize(7, sourcePath);
    const second = registry.authorize(7, sourcePath);
    const other = registry.authorize(8, '/Users/person/Other/audio.wav');

    expect(first).toMatch(/^capty-media:\/\/resource\/[A-Za-z0-9_-]+$/);
    expect(first).not.toContain(sourcePath);
    expect(first).toBe(second);
    expect(registry.resolve(first)).toEqual({
      ownerId: 7,
      filePath: sourcePath,
    });
    expect(
      registry.resolve('file:///Users/person/Secret/source.mov')
    ).toBeNull();

    registry.revokeOwner(7);
    expect(registry.resolve(first)).toBeNull();
    expect(registry.resolve(second)).toBeNull();
    expect(registry.resolve(other)).toEqual({
      ownerId: 8,
      filePath: '/Users/person/Other/audio.wav',
    });
  });
});
