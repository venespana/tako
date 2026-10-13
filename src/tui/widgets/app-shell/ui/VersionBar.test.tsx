// VersionBar.test.tsx — Unit tests for the VersionBar widget: the footer
// must render the actual build-time VERSION constant, not just any string.
import { renderToString } from 'ink';

import { describe, it, expect } from 'vitest';

import { VersionBar } from './VersionBar.js';
import { VERSION } from '../../../../shared/lib/version.js';

describe('VersionBar', () => {
  it('renders the VERSION constant with the v prefix', () => {
    const output = renderToString(<VersionBar />);
    expect(output).toContain(`v${VERSION}`);
  });

  it('renders nothing beyond the prefixed version', () => {
    const output = renderToString(<VersionBar />);
    expect(output.trim()).toBe(`v${VERSION}`);
  });
});
