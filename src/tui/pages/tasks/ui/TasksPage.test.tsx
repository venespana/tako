// pages/tasks/ui/TasksPage.test.tsx — STRICT TDD RED phase (task 8.11/8.14)
import { beforeEach, describe, expect, it } from 'vitest';

import { render } from 'ink-testing-library';

import type { JobDefinition } from '../../../../domains/agent/domain/types.js';
import { FakeTasksGateway } from '../../../test-utils/fake-agent-session.js';
// Public API only (9.7): the slice index exports the test reset seam — no
// test-only deep import into model/.
import { resetTasksStoreForTests, useTasksStore } from '../../../features/tasks/job-list/index.js';
import { TasksPage } from './TasksPage.js';

const PRUNE_JOB: JobDefinition = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['dangling-images'],
  schedule: { kind: 'cron', expr: '0 4 * * *' },
};

function jobView(job: JobDefinition) {
  return { job, enabled: true, createdAt: 't', updatedAt: 't' };
}

/** A completed dry-run in the selected job's history (the reviewed report). */
function dryRunView() {
  return {
    seq: 5,
    id: 'r5',
    jobId: 'nas-prune',
    mode: 'dry-run',
    status: 'succeeded',
    catchup: false,
    startedAt: 't',
    finishedAt: 't',
    result: { scopes: [], entries: [], mode: 'dry-run' },
  };
}

async function renderWith(gateway: FakeTasksGateway) {
  resetTasksStoreForTests();
  const instance = render(<TasksPage gateway={gateway} />);
  await new Promise(resolve => setTimeout(resolve, 50)); // connect + reconcile settle
  return instance;
}

/** Poll until predicate() holds (Ink key flush + async store settle). */
async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  for (let waited = 0; !predicate() && waited < timeoutMs; waited += 10) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('TasksPage (8.11)', () => {
  beforeEach(() => {
    resetTasksStoreForTests();
  });

  it('no active remote: prompts to select one first', () => {
    const { lastFrame } = render(<TasksPage gateway={null} />);
    expect(lastFrame() ?? '').toContain('No remote selected');
  });

  it('agent unreachable: install hint points at "tako agent install <remote>"', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.connectError = new Error('channel open failed');
    const { lastFrame } = await renderWith(gateway);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('tako agent install nas');
  });

  it('ready: renders the agent header and the job list from reconcile', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]);
    const { lastFrame } = await renderWith(gateway);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('nas-prune');
    expect(frame).toContain('active');
  });

  it('r queues a dry-run trigger for the selected job (jobs.trigger over the protocol)', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]);
    gateway.session.responses.set('jobs.trigger', {
      run: { seq: 8, id: 'r8', jobId: 'nas-prune', mode: 'dry-run', status: 'pending', catchup: false, startedAt: 't' },
    });
    const instance = await renderWith(gateway);

    instance.stdin.write('r');
    await until(() => gateway.session.requests.some(request => request.type === 'jobs.trigger'));

    const trigger = gateway.session.requests.find(request => request.type === 'jobs.trigger');
    expect(trigger).toEqual({ type: 'jobs.trigger', payload: { jobId: 'nas-prune', mode: 'dry-run' } });
  });

  it('d removes the selected job (jobs.delete over the protocol)', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]);
    gateway.session.responses.set('jobs.delete', { deleted: true });
    const instance = await renderWith(gateway);

    instance.stdin.write('d');
    await until(() => gateway.session.requests.some(request => request.type === 'jobs.delete'));

    expect(gateway.session.requests).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'jobs.delete' })])
    );
  });

  it('unmount disconnects the session (effect cleanup)', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]);
    const instance = await renderWith(gateway);

    instance.unmount();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(gateway.session.closed).toBe(true);
  });
});

describe('TasksPage apply gating (9.7 regression: a requires a reviewed dry-run, t applies directly)', () => {
  it('9.7: "a" with NO dry-run in the selected job\'s history triggers NOTHING (no jobs.trigger request)', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]); // no runs seeded
    const instance = await renderWith(gateway);

    instance.stdin.write('a');
    await new Promise(resolve => setTimeout(resolve, 120)); // let any (wrongly) fired request land

    expect(gateway.session.requests.some(request => request.type === 'jobs.trigger')).toBe(false);
  });

  it('9.7: "a" after a dry-run report is in history applies the selected job (mode apply)', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)], [dryRunView()]);
    gateway.session.responses.set('jobs.trigger', {
      run: { seq: 8, id: 'r8', jobId: 'nas-prune', mode: 'apply', status: 'pending', catchup: false, startedAt: 't' },
    });
    const instance = await renderWith(gateway);

    instance.stdin.write('a');
    await until(() => gateway.session.requests.some(request => request.type === 'jobs.trigger'));

    const trigger = gateway.session.requests.find(request => request.type === 'jobs.trigger');
    expect(trigger).toEqual({ type: 'jobs.trigger', payload: { jobId: 'nas-prune', mode: 'apply' } });
  });

  it('9.7: "t" applies DIRECTLY without any reviewed dry-run report', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]); // no dry-run anywhere
    gateway.session.responses.set('jobs.trigger', {
      run: { seq: 8, id: 'r8', jobId: 'nas-prune', mode: 'apply', status: 'pending', catchup: false, startedAt: 't' },
    });
    const instance = await renderWith(gateway);

    instance.stdin.write('t');
    await until(() => gateway.session.requests.some(request => request.type === 'jobs.trigger'));

    const trigger = gateway.session.requests.find(request => request.type === 'jobs.trigger');
    expect(trigger).toEqual({ type: 'jobs.trigger', payload: { jobId: 'nas-prune', mode: 'apply' } });
  });
});
