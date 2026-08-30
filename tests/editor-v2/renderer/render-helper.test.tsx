import * as React from 'react';

import { render } from '../helpers/render';

const ContractFixture = ({ label }: { label: string }) => (
  <button type="button">{label}</button>
);

describe('renderer test helper', () => {
  it('renders and unmounts React content', () => {
    const view = render(<ContractFixture label="Editor V2" />);

    expect(view.container.textContent).toBe('Editor V2');
    expect(view.container.querySelector('button')?.type).toBe('button');

    view.unmount();

    expect(view.container.childElementCount).toBe(0);
  });
});
