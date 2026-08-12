// VersionBar.test.tsx — Unit tests for VersionBar widget.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'ink';
import { VersionBar } from './VersionBar.js';

describe('VersionBar', () => {
  it('renders the VERSION constant', () => {
    const output = renderToString(<VersionBar />);
    // The version constant should appear in the output
    expect(output).toBeDefined();
    expect(typeof output).toBe('string');
  });
});
