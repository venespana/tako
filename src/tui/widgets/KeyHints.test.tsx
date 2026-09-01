// KeyHints.test.tsx — Unit tests for KeyHints widget.
// KeyHints is prop-less: the hint bar is identical on every route and the
// back key is always visible (Esc/⌫/h → goBack via the router).
import { describe, it, expect } from 'vitest';
import { renderToString } from 'ink';
import { KeyHints } from './KeyHints.js';

describe('KeyHints', () => {
  it('renders movement key hints', () => {
    const output = renderToString(<KeyHints />);
    expect(output).toContain('↑↓');
    expect(output).toContain('j');
    expect(output).toContain('k');
  });

  it('renders select and quit hints', () => {
    const output = renderToString(<KeyHints />);
    expect(output).toContain('Enter');
    expect(output).toContain('l');
    expect(output).toContain('q');
  });

  it('always renders the back hint', () => {
    // The old view-based tests asserted back was hidden on the list view and
    // shown on the submenu view. With the router there is no view distinction:
    // back (goBack) is always available, so the hint is always rendered.
    const output = renderToString(<KeyHints />);
    expect(output).toContain('h');
    expect(output).toContain('Esc');
    expect(output).toContain('back');
  });
});
