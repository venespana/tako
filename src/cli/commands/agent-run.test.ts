// cli/commands/agent-run.test.ts — outcome mapping + watchdog (tasks 6.1 + 7.5)
//
// The JobHandler mapping lives in the agent-mode composition root: docker
// reports → terminal run statuses. 'planned' (dry-run) maps to 'succeeded'
// on apply-time semantics; a PruneReport with ANY per-scope error is
// 'failed' while the full report stays recorded as the run result.
// The watchdog bounds wedged compose calls so an unattended `pull` against a
// dead daemon cannot hang the serial queue forever (7.5).
import { describe, expect, it } from 'vitest';

import type { JobHandler } from '../../domains/agent/application/JobHandler.js';
import type { JobDefinition } from '../../domains/agent/domain/types.js';
import type { PruneReport, StackLifecycleReport } from '../../domains/docker/domain/types.js';
// RED: the watchdog exports don't exist yet
import {
  DEFAULT_WATCHDOG_TIMEOUT_MS,
  WatchdogTimeoutError,
  mapLifecycleOutcome,
  mapPruneOutcome,
  withWatchdogTimeout,
} from './agent-run.js';

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

describe('watchdog timeout for wedged job handlers (7.5)', () => {
  const pruneJob: JobDefinition = {
    id: 'nas-prune',
    type: 'prune',
    scopes: ['dangling-images'],
    schedule: { kind: 'cron', expr: '0 4 * * *' },
  };

  it('7.5 RED: default watchdog budget is the designed generous 10 minutes', () => {
    expect(DEFAULT_WATCHDOG_TIMEOUT_MS).toBe(600_000);
  });

  it('7.5 RED: fast handler outcome passes through untouched', async () => {
    const handler: JobHandler = { execute: async () => ({ status: 'succeeded', result: { ok: 1 } }) };
    const guarded = withWatchdogTimeout(handler, DEFAULT_WATCHDOG_TIMEOUT_MS);
    await expect(guarded.execute(pruneJob, 'dry-run')).resolves.toEqual({ status: 'succeeded', result: { ok: 1 } });
  });

  it('7.5 RED: wedged handler rejects with WatchdogTimeoutError after the budget', async () => {
    const wedged: JobHandler = { execute: () => new Promise<never>(() => {}) };
    const guarded = withWatchdogTimeout(wedged, 10);
    await expect(guarded.execute(pruneJob, 'apply')).rejects.toThrow(WatchdogTimeoutError);
  });

  it('7.5 RED: slow-but-completing handler inside the budget resolves normally', async () => {
    const handler: JobHandler = {
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { status: 'succeeded' };
      },
    };
    const guarded = withWatchdogTimeout(handler, 5_000);
    await expect(guarded.execute(pruneJob, 'apply')).resolves.toEqual({ status: 'succeeded' });
  });
});
