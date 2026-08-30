import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import EditorVersionHost from '@/renderer/editor-v2/shell/editor-version-host';
import { canShowEditorVersionSwitch } from '@/renderer/editor-v2/shell/editor-version-switch';
import { render, type RenderResult } from '../helpers/render';

vi.mock('@/renderer/editor-v2/window/editor-v2-window', () => ({
  default: () => <div data-editor-version="v2">V2 editor</div>,
}));

let rendered: RenderResult | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
  window.history.replaceState({}, '', '/');
});

describe('Editor version host', () => {
  it('requires both main and renderer development gates for switching', () => {
    expect(canShowEditorVersionSwitch(true, true)).toBe(true);
    expect(canShowEditorVersionSwitch(true, false)).toBe(false);
    expect(canShowEditorVersionSwitch(false, true)).toBe(false);
  });

  it('mounts only the legacy app on the normal route', () => {
    window.history.replaceState({}, '', '/');
    rendered = render(
      <EditorVersionHost
        legacyApp={<div data-editor-version="v1">V1 editor</div>}
      />
    );
    expect(
      rendered.container.querySelectorAll('[data-editor-version]')
    ).toHaveLength(1);
    expect(
      rendered.container.querySelector('[data-editor-version="v1"]')
    ).not.toBeNull();
  });

  it('mounts only Editor V2 on the dedicated route', async () => {
    window.history.replaceState({}, '', '/?editor=v2');
    rendered = render(
      <EditorVersionHost
        legacyApp={<div data-editor-version="v1">V1 editor</div>}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      rendered.container.querySelectorAll('[data-editor-version]')
    ).toHaveLength(1);
    expect(
      rendered.container.querySelector('[data-editor-version="v2"]')
    ).not.toBeNull();
  });
});
