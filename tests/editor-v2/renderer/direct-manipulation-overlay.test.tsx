import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmptyEditorProject } from '@/editor-v2/document/defaults';
import DirectManipulationOverlay from '@/renderer/editor-v2/viewer/direct-manipulation-overlay';
import EditorProvider from '@/renderer/editor-v2/store/editor-provider';
import { useEditorStore } from '@/renderer/editor-v2/store/use-editor-store';
import { render, type RenderResult } from '../helpers/render';
import type { EditorProjectV2 } from '@/types/editor-v2';

let rendered: RenderResult | null = null;

const createProject = (): EditorProjectV2 => {
  const project = createEmptyEditorProject({
    id: 'project',
    name: 'Direct manipulation',
    createdAt: '2026-09-01T00:00:00.000Z',
    sequenceId: 'sequence',
    videoTrackId: 'video',
    audioTrackId: 'audio',
  });
  project.assets.image = {
    id: 'image',
    kind: 'image',
    name: 'Image',
    locator: { kind: 'managed', relativePath: 'media/image/image.png' },
    importedAt: '2026-09-01T00:00:00.000Z',
    width: 1000,
    height: 500,
    orientation: 1,
    defaultStillDurationTicks: 90_000,
  };
  project.sequence.clips.clip = {
    id: 'clip',
    kind: 'image',
    trackId: 'video',
    assetId: 'image',
    name: 'Image',
    timelineStart: 0,
    timelineDuration: 90_000,
    sourceStart: 0,
    sourceDuration: 90_000,
    playbackRate: { numerator: 1, denominator: 1 },
    effects: [
      {
        id: 'transform',
        kind: 'transform',
        enabled: true,
        value: {
          positionX: 0,
          positionY: 0,
          scaleX: 1,
          scaleY: 1,
          rotationDegrees: 0,
          anchorX: 0.5,
          anchorY: 0.5,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
          cropLeft: 0,
        },
      },
    ],
  };
  project.sequence.tracks.video.clipIds.push('clip');
  return project;
};

function Harness() {
  const store = useEditorStore();
  const transform = store.document.sequence.clips.clip.effects[0];
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          store.setSelection({
            kind: 'effect',
            clipId: 'clip',
            effectId: 'transform',
          })
        }
      >
        Select Transform
      </button>
      <button type="button" onClick={() => store.undo()}>
        Undo
      </button>
      <output>
        {transform.kind === 'transform'
          ? `${transform.value.positionX},${transform.value.positionY}`
          : 'invalid'}
      </output>
      <output aria-label="Transform state">
        {transform.kind === 'transform' ? JSON.stringify(transform.value) : ''}
      </output>
      <div className="relative">
        <DirectManipulationOverlay width={1000} height={500} />
      </div>
    </div>
  );
}

const pointerEvent = (
  type: string,
  options: MouseEventInit & { pointerId: number }
): Event => {
  const event = new MouseEvent(type, { ...options, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId });
  return event;
};

const prepareOverlay = (): HTMLElement => {
  const overlay = rendered!.container.querySelector<HTMLElement>(
    '[aria-label="Directly edit transform"]'
  );
  if (!overlay) throw new Error('Direct manipulation overlay is unavailable');
  overlay.setPointerCapture = vi.fn();
  overlay.getBoundingClientRect = vi.fn(
    () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 50,
        width: 100,
        height: 50,
        toJSON: () => ({}),
      }) as DOMRect
  );
  return overlay;
};

afterEach(() => {
  rendered?.unmount();
  rendered?.container.remove();
  rendered = null;
});

describe('DirectManipulationOverlay', () => {
  it('commits one undoable transform transaction', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    act(() => {
      [...rendered!.container.querySelectorAll('button')]
        .find(button => button.textContent === 'Select Transform')
        ?.click();
    });
    const overlay = prepareOverlay();

    act(() => {
      overlay.dispatchEvent(
        pointerEvent('pointerdown', {
          pointerId: 1,
          button: 0,
          clientX: 10,
          clientY: 10,
        })
      );
      overlay.dispatchEvent(
        pointerEvent('pointermove', {
          pointerId: 1,
          clientX: 20,
          clientY: 15,
        })
      );
      overlay.dispatchEvent(
        pointerEvent('pointerup', {
          pointerId: 1,
          clientX: 20,
          clientY: 15,
        })
      );
    });

    expect(rendered.container.querySelector('output')?.textContent).toBe(
      '100,50'
    );
    act(() => {
      [...rendered!.container.querySelectorAll('button')]
        .find(button => button.textContent === 'Undo')
        ?.click();
    });
    expect(rendered.container.querySelector('output')?.textContent).toBe('0,0');
  });

  it('directly edits bottom and right crop handles', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    act(() => {
      [...rendered!.container.querySelectorAll('button')]
        .find(button => button.textContent === 'Select Transform')
        ?.click();
    });
    act(() => {
      [...rendered!.container.querySelectorAll('button')]
        .find(button => button.textContent === 'Crop Bottom/Right')
        ?.click();
    });
    const overlay = prepareOverlay();

    act(() => {
      overlay.dispatchEvent(
        pointerEvent('pointerdown', {
          pointerId: 3,
          button: 0,
          clientX: 80,
          clientY: 40,
        })
      );
      overlay.dispatchEvent(
        pointerEvent('pointermove', {
          pointerId: 3,
          clientX: 70,
          clientY: 35,
        })
      );
      overlay.dispatchEvent(
        pointerEvent('pointerup', {
          pointerId: 3,
          clientX: 70,
          clientY: 35,
        })
      );
    });

    const state = JSON.parse(
      rendered.container.querySelector('[aria-label="Transform state"]')
        ?.textContent ?? '{}'
    ) as { cropRight: number; cropBottom: number };
    expect(state.cropRight).toBeCloseTo(0.1);
    expect(state.cropBottom).toBeCloseTo(0.1);
  });

  it('cancels the preview transaction when pointer capture is lost', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    act(() => {
      [...rendered!.container.querySelectorAll('button')]
        .find(button => button.textContent === 'Select Transform')
        ?.click();
    });
    const overlay = prepareOverlay();

    act(() => {
      overlay.dispatchEvent(
        pointerEvent('pointerdown', {
          pointerId: 4,
          button: 0,
          clientX: 10,
          clientY: 10,
        })
      );
      overlay.dispatchEvent(
        pointerEvent('pointermove', {
          pointerId: 4,
          clientX: 30,
          clientY: 20,
        })
      );
      overlay.dispatchEvent(
        pointerEvent('lostpointercapture', {
          pointerId: 4,
          clientX: 30,
          clientY: 20,
        })
      );
    });

    expect(rendered.container.querySelector('output')?.textContent).toBe('0,0');
  });

  it('cancels the preview transaction with Escape', () => {
    rendered = render(
      <EditorProvider initialDocument={createProject()}>
        <Harness />
      </EditorProvider>
    );
    act(() => {
      [...rendered!.container.querySelectorAll('button')]
        .find(button => button.textContent === 'Select Transform')
        ?.click();
    });
    const overlay = prepareOverlay();

    act(() => {
      overlay.dispatchEvent(
        pointerEvent('pointerdown', {
          pointerId: 2,
          button: 0,
          clientX: 10,
          clientY: 10,
        })
      );
      overlay.dispatchEvent(
        pointerEvent('pointermove', {
          pointerId: 2,
          clientX: 30,
          clientY: 20,
        })
      );
      overlay.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    });

    expect(rendered.container.querySelector('output')?.textContent).toBe('0,0');
  });
});
