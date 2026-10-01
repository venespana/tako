// pages/tasks/ui/TasksPage.test.tsx — STRICT TDD RED phase (task 8.11/8.14)
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from 'ink-testing-library';

import { Text } from 'ink';

import type { JobDefinition } from '../../../../domains/agent/domain/types.js';
import { FakeTasksGateway } from '../../../test-utils/fake-agent-session.js';
// Public API only (9.7): the slice index exports the test reset seam — no
// test-only deep import into model/.
import { resetTasksStoreForTests } from '../../../features/tasks/job-list/index.js';
import { useEditingStore } from '../../../shared/lib/editing-store.js';
import { usePageHintsStore } from '../../../shared/lib/page-hints-store.js';
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

beforeEach(() => {
  // 9.20: the footer hints + editing flag are module-scope zustand stores —
  // reset them alongside the tasks store so no test inherits a previous
  // test's published hints or a leaked EditingGuard flag.
  resetTasksStoreForTests();
  useEditingStore.setState({ isEditing: false });
  usePageHintsStore.setState({ hints: [], formMode: false });
});

describe('TasksPage (8.11)', () => {
  it('no active remote: prompts to select one first', () => {
    const { lastFrame } = render(<TasksPage gateway={null} />);
    expect(lastFrame() ?? '').toContain('No remote selected');
  });

  it('agent unreachable: the in-TUI install panel replaces the terminal hint (9.14b)', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.connectError = new Error('channel open failed');
    // 9.19: the install is the gateway's in-process install — script it to
    // stream a progress line and fail.
    gateway.installScript = onLine => {
      onLine('ssh: connect refused');
      return Promise.resolve({ ok: false, error: 'ssh: connect refused' });
    };
    resetTasksStoreForTests();
    const instance = render(<TasksPage gateway={gateway} />);
    await until(() => (instance.lastFrame() ?? '').includes('install failed (ssh: connect refused)'));

    const frame = instance.lastFrame() ?? '';
    expect(frame).toContain('Agent install on nas');
    expect(frame).toContain('agent install nas'); // the operation stays visible
    expect(frame).toContain('connect refused'); // live output lines
    expect(frame).toContain('install failed'); // failure status (the r retry hint lives in the footer, 9.15a)

    instance.unmount();
  });

  it('9.14b: install success reconnects the workspace (fresh handshake, same gateway)', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([]);
    gateway.connectError = new Error('channel open failed');
    // The install "fixes" the remote: the gateway becomes reachable right
    // before its success lands, so the automatic reconnect succeeds.
    gateway.installScript = () => {
      gateway.connectError = null;
      return Promise.resolve({ ok: true });
    };
    resetTasksStoreForTests();
    const instance = render(<TasksPage gateway={gateway} />);

    // First connect fails (agent missing) → panel runs → success → reconnect.
    await until(() => gateway.connectCalls === 2);
    await until(() => (instance.lastFrame() ?? '').includes('No jobs yet'));

    expect(gateway.session.closed).toBe(false);
    instance.unmount();
  });

  it('9.14a: publishes the handshake agent version to the app runtime', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]);
    const onAgentVersion = vi.fn();
    resetTasksStoreForTests();
    const instance = render(<TasksPage gateway={gateway} onAgentVersion={onAgentVersion} />);

    await until(() => onAgentVersion.mock.calls.length > 0);
    expect(onAgentVersion).toHaveBeenCalledWith('0.1.2');
    instance.unmount();
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

describe('TasksPage form mode (9.15c: Esc-only cancel, chars are data entry)', () => {
  it('with the form open, t/d/r/a fire NOTHING and type into the focused field; ONLY Esc returns to browse', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]);
    gateway.session.responses.set('jobs.trigger', {
      run: { seq: 8, id: 'r8', jobId: 'nas-prune', mode: 'dry-run', status: 'pending', catchup: false, startedAt: 't' },
    });
    const instance = await renderWith(gateway);

    instance.stdin.write('n'); // open the create form
    await until(() => (instance.lastFrame() ?? '').includes('New job'));

    // Every char with a browse-mode meaning — plus the old form's quick-edit
    // chars — must be DATA ENTRY now: nothing triggers, nothing deletes, no
    // mode flips, and the characters land in the focused id field.
    instance.stdin.write('tdra');
    instance.stdin.write('t123o');
    await new Promise(resolve => setTimeout(resolve, 120));

    expect(gateway.session.requests.some(request => request.type === 'jobs.trigger')).toBe(false);
    expect(gateway.session.requests.some(request => request.type === 'jobs.delete')).toBe(false);
    expect(instance.lastFrame() ?? '').toContain('tdrat123o'); // chars reached the focused field
    expect(instance.lastFrame() ?? '').toContain('New job'); // still the form

    instance.stdin.write('\x1b'); // Esc is the ONLY cancel
    await until(() => (instance.lastFrame() ?? '').includes('Jobs'));
    expect(instance.lastFrame() ?? '').not.toContain('New job');

    // Back in browse, the actions are live again (the gating is mode-scoped).
    instance.stdin.write('r');
    await until(() => gateway.session.requests.some(request => request.type === 'jobs.trigger'));
    instance.unmount();
  });

  it('the old inline hint line is gone from the page body (9.15a: footer only)', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]);
    const instance = await renderWith(gateway);

    const frame = instance.lastFrame() ?? '';
    expect(frame).not.toContain('n new ·');
    expect(frame).not.toContain('press ');
    instance.unmount();
  });
});

describe('TasksPage footer hint publication (9.15a: single writer per page)', () => {
  /** Renders the hints the page currently publishes (stands in for the footer). */
  function FooterSpy(): React.ReactElement {
    const hints = usePageHintsStore(state => state.hints);
    return <Text>footer: {hints.map(hint => `${hint.key} ${hint.label}`).join(' · ')}</Text>;
  }

  it('browse publishes the action hints; the install state takes the footer over on failure', async () => {
    const gateway = new FakeTasksGateway('nas');
    gateway.seedAgent([jobView(PRUNE_JOB)]);
    gateway.installScript = onLine => {
      onLine('ssh: connect refused');
      return Promise.resolve({ ok: false, error: 'ssh: connect refused' });
    };
    resetTasksStoreForTests();
    const instance = render(
      <>
        <TasksPage gateway={gateway} />
        <FooterSpy />
      </>
    );

    // Ready browse workspace → the action hints are published.
    await until(() => (instance.lastFrame() ?? '').includes('footer: n new'));
    // Any request now fails → the install panel replaces the workspace and
    // the page hands the footer to the r retry hint (ready → error handoff).
    // The in-process install settles a microtask after the status flip, so
    // both assertions poll (footer first, then the pane's failure line).
    gateway.session.failNext = new Error('channel closed');
    instance.stdin.write('r');
    await until(() => (instance.lastFrame() ?? '').includes('footer: r retry'));
    await until(() => (instance.lastFrame() ?? '').includes('install failed'));
    instance.unmount();
  });
});
