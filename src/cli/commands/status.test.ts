// status.test.ts — pure table formatter (S5 of mvp-status-command)
//
// formatStatusTable is the only rendering logic of `tako status`; the
// command wiring (S6) just prints whatever these pure lines say.
import { describe, expect, it } from 'vitest';

import { formatStatusTable } from './status.js';
import type { StackStatusEntry } from '../../services/docker.js';

const entry = (name: string, status: string, configFiles: string): StackStatusEntry => ({ name, status, configFiles });

describe('formatStatusTable', () => {
  it('renders a header and an aligned row (columns at least as wide as their labels)', () => {
    expect(formatStatusTable([entry('nas', 'up', '/a.yml')])).toEqual([
      'NAME  STATUS  CONFIG FILES',
      'nas   up      /a.yml',
    ]);
  });

  it('widens every column to its widest cell across rows', () => {
    const lines = formatStatusTable([
      entry('web', 'running(2)', '/w.yml'),
      entry('reverse-proxy', 'exited(1)', '/r.yml'),
    ]);

    expect(lines).toEqual([
      'NAME           STATUS      CONFIG FILES',
      'web            running(2)  /w.yml',
      'reverse-proxy  exited(1)   /r.yml',
    ]);
  });

  it('renders an explicit empty state for an empty listing', () => {
    expect(formatStatusTable([])).toEqual(['no compose stacks found']);
  });
});
