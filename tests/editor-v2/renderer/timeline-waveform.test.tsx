import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TimelineWaveform from '@/renderer/editor-v2/timeline/timeline-waveform';
import { render, type RenderResult } from '../helpers/render';

let rendered: RenderResult | null = null;

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
  vi.restoreAllMocks();
});

describe('TimelineWaveform', () => {
  it('fetches and renders normalized authorized waveform peaks', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([0, 0.25, 0.5, 1]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await act(async () => {
      rendered = render(
        <TimelineWaveform url="capty-media://waveform/token" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'capty-media://waveform/token',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(
      rendered.container.querySelectorAll('[aria-hidden="true"] span')
    ).toHaveLength(4);
  });

  it('uses the unavailable fallback for invalid waveform data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([0, 2]), { status: 200 })
    );

    await act(async () => {
      rendered = render(
        <TimelineWaveform url="capty-media://waveform/token" />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rendered.container.querySelector('.border-dashed')).not.toBeNull();
  });
});
