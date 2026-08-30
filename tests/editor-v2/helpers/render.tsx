import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export interface RenderResult {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
}

export const render = (node: ReactNode): RenderResult => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(node);
  });

  return {
    container,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
};
