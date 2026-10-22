// stack-status-view.test.ts — Unit tests for the pure status view model:
// the 3-bucket health classification of human status text, the 2-bucket
// stat strip math (paused counts as stopped, per the design), and the
// health → Ink color mapping (pen rows: running green, exited red, paused
// yellow).
import { describe, expect, it } from 'vitest';

import { classifyStackHealth, computeStatusStats, healthColor } from './stack-status-view.js';
import type { StackStatusEntry } from '../../../../services/docker.js';

const entry = (name: string, status: string): StackStatusEntry => ({
  name,
  status,
  configFiles: `/opt/${name}/compose.yaml`,
});

describe('classifyStackHealth', () => {
  it('classifies running(3) as running', () => {
    expect(classifyStackHealth('running(3)')).toBe('running');
  });

  it('classifies exited(1) as stopped', () => {
    expect(classifyStackHealth('exited(1)')).toBe('stopped');
  });

  it('classifies paused as paused', () => {
    expect(classifyStackHealth('paused')).toBe('paused');
  });

  it('classifies mixed `running(2) exited(1)` as stopped (exited dominates)', () => {
    expect(classifyStackHealth('running(2) exited(1)')).toBe('stopped');
  });

  it('defaults unknown status text to running', () => {
    expect(classifyStackHealth('restarting')).toBe('running');
  });
});

describe('computeStatusStats', () => {
  it('counts total, running and stopped — paused counts as stopped', () => {
    const stats = computeStatusStats([
      entry('media', 'running(3)'),
      entry('proxy', 'running(2)'),
      entry('backup', 'exited(1)'),
      entry('ha', 'paused'),
    ]);

    expect(stats).toEqual({ total: 4, running: 2, stopped: 2 });
  });

  it('returns zeros for an empty list', () => {
    expect(computeStatusStats([])).toEqual({ total: 0, running: 0, stopped: 0 });
  });

  it('buckets every entry: running + stopped equals total', () => {
    const stats = computeStatusStats([
      entry('a', 'running(1)'),
      entry('b', 'exited(1)'),
      entry('c', 'running(2) exited(1)'),
      entry('d', 'paused'),
    ]);

    expect(stats.running + stats.stopped).toBe(stats.total);
  });
});

describe('healthColor', () => {
  it('maps running → green, stopped → red, paused → yellow', () => {
    expect(healthColor('running')).toBe('green');
    expect(healthColor('stopped')).toBe('red');
    expect(healthColor('paused')).toBe('yellow');
  });
});
