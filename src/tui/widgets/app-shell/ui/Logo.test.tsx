// Logo.test.tsx — Unit tests for the Logo widget. The old widgets.test.tsx
// suite asserted the same box-drawing fragment twice; these tests pin the
// actual ASCII art content (the TAKO block-letter header).
import { describe, it, expect } from 'vitest';
import { renderToString } from 'ink';
import { Logo } from './Logo.js';

// Fragments of the TAKO block-letter art (first and last rows).
const ART_TOP = '████████╗ █████╗ ██╗  ██╗ ██████╗';
const ART_BOTTOM = '╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝';

describe('Logo', () => {
  it('renders the ASCII art header', () => {
    const output = renderToString(<Logo />);
    expect(output).toContain(ART_TOP);
    expect(output).toContain(ART_BOTTOM);
  });

  it('renders every row of the block-letter logo', () => {
    const output = renderToString(<Logo />);
    // Six art rows, separated by newlines — the full header is present.
    const rows = output
      .split('\n')
      .map(row => row.trimEnd())
      .filter(row => row.length > 0);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toContain('████████╗');
    expect(rows[1]).toContain('╚══██╔══╝');
    expect(rows[5]).toContain('╚═════╝');
  });
});
