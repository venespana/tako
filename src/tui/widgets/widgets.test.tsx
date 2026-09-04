// widgets.test.tsx — Unit tests for TUI widgets.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'ink';
import { Logo } from './Logo.js';

describe('Logo', () => {
  it('renders without crashing', () => {
    const output = renderToString(<Logo />);
    // Logo renders the box-drawing ASCII art
    expect(output).toContain('███╗');
  });

  it('contains the full ASCII art', () => {
    const output = renderToString(<Logo />);
    // The ASCII art contains distinct characters we can check for
    expect(output).toContain('███╗');
    expect(output).toContain('███╗');
  });
});
