import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Button from './Button.jsx';

describe('Vitest React/JSX setup', () => {
  it('renders an existing React component with its props and JSX children', () => {
    const markup = renderToStaticMarkup(
      <Button type="button" variant="quiet" disabled>
        Continuar
      </Button>,
    );

    expect(markup).toBe(
      '<button class="button button--quiet" type="button" disabled="">Continuar</button>',
    );
  });
});
