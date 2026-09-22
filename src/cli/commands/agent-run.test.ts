// cli/commands/agent-run.test.ts — outcome mapping (tasks 6.1 + 7.5 mapping rules)
//
// The JobHandler mapping lives in the agent-mode composition root: docker
// reports → terminal run statuses. 'planned' (dry-run) maps to 'succeeded'
// on apply-time semantics; a PruneReport with ANY per-scope error is
// 'failed' while the full report stays recorded as the run result.
import { describe, expect, it } from 'vitest';

import type { PruneReport, StackLifecycleReport } from '../../domains/docker/domain/types.js';
import { mapLifecycleOutcome, mapPruneOutcome } from './agent-run.js';

const lifecycleReport = (status: StackLifecycleReport['status']): StackLifecycleReport => ({
  mode: 'apply',
  op: 'pull',
  stackDir: '/srv/stacks/caddy',
  command: { argv: ['docker', 'compose', 'pull'], cwd: '/srv/stacks/caddy' },
  ...(status !== 'planned' && {
    execution: { exitCode: status === 'succeeded' ? 0 : 3, stdout: '', stderr: 'boom' },
  }),
  status,
});

const pruneReport = (withError: boolean): PruneReport => ({
  mode: 'apply',
  scopes: ['stopped-containers', 'dangling-images'],
  entries: [
    { scope: 'stopped-containers', items: [], count: 2 },
    {
      scope: 'dangling-images',
      items: [],
      count: 0,
      ...(withError && { error: 'docker daemon unreachable during prune' }),
    },
  ],
});

describe('agent-run outcome mapping (7.5 rules)', () => {
  it('6.1 RED: lifecycle planned (dry-run) → succeeded with the report recorded', () => {
    const outcome = mapLifecycleOutcome(lifecycleReport('planned'));
    expect(outcome.status).toBe('succeeded');
    expect(outcome.result).toEqual(lifecycleReport('planned'));
  });

  it('6.1 RED: lifecycle succeeded/failed pass through as terminal statuses', () => {
    expect(mapLifecycleOutcome(lifecycleReport('succeeded')).status).toBe('succeeded');
    expect(mapLifecycleOutcome(lifecycleReport('failed')).status).toBe('failed');
  });

  it('6.1 RED: prune with any per-scope error → failed, full report recorded', () => {
    const report = pruneReport(true);
    const outcome = mapPruneOutcome(report);
    expect(outcome.status).toBe('failed');
    expect(outcome.result).toEqual(report);
  });

  it('6.1 RED: clean prune report → succeeded', () => {
    expect(mapPruneOutcome(pruneReport(false)).status).toBe('succeeded');
  });
});
