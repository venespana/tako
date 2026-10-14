// pages/tasks/ui/TasksPage.test.tsx — STRICT TDD RED phase (task 8.11/8.14).
// Per ADR-0019 §7 the page consumes services/agent directly, so these tests
// MOCK the service module instead of injecting a gateway fake.
import { Text } from 'ink';

import { render } from 'ink-testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksPage } from './TasksPage.js';
import type { JobDefinition } from '../../../../services/agent.js';
import { connectAgentSession, installAgent } from '../../../../services/agent.js';
import { useEditingStore } from '../../../shared/lib/editing-store.js';
import { usePageHintsStore } from '../../../shared/lib/page-hints-store.js';
import { FakeAgentSession } from '../../../test-utils/fake-agent-session.js';
import { resetTasksStoreForTests } from '../model/tasks-store.js';

vi.mock('../../../../services/agent.js', async importOriginal => {
  // Spread the REAL module so the pure domain re-exports the page and the
  // job form consume (SLUG_PATTERN, isValidCronExpr, isValidStackDir) keep
  // working; only the transport-bearing functions are replaced.
  const actual = await importOriginal<typeof import('../../../../services/agent.js')>();
  return {
    ...actual,
    connectAgentSession: vi.fn(),
    installAgent: vi.fn(),
    loadReconcileCursor: vi.fn(() => 0),
    saveReconcileCursor: vi.fn(),
  };
});

const PRUNE_JOB: JobDefinition = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['dangling-images'],
  schedule: { kind: 'cron', expr: '0 4 * * *' },
};

function jobView(job: JobDefinition) {
  return { job, enabled: true, createdAt: 't', updatedAt: 't' };
}

/** A connected-by-default fake: the session is served by the mocked service. */
function fakeConnected(): FakeAgentSession {
  const session = new FakeAgentSession();
  vi.mocked(connectAgentSession).mockResolvedValue({ kind: 'connected', session });
  return session;
}

async function renderWith(_session: FakeAgentSession) {
  resetTasksStoreForTests();
  const instance = render(<TasksPage remote='nas' />);
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
  vi.clearAllMocks();
  resetTasksStoreForTests();
  useEditingStore.setState({ isEditing: false });
  usePageHintsStore.setState({ hints: [], formMode: false });
});

describe('TasksPage (8.11)', () => {
  it('no active remote: prompts to select one first', () => {
    const { lastFrame } = render(<TasksPage remote={null} />);
    expect(lastFrame() ?? '').toContain('No remote selected');
  });

  it('agent unreachable: the in-TUI install panel replaces the terminal hint (9.14b)', async () => {
    vi.mocked(connectAgentSession).mockRejectedValue(new Error('channel open failed'));
    // 9.19: the install is the service's in-process install — script it to
    // stream a progress line and fail.
    vi.mocked(installAgent).mockImplementation(async ({ onLine }) => {
      onLine?.('ssh: connect refused');
      return { kind: 'failed', error: 'ssh: connect refused' };
    });
    resetTasksStoreForTests();
    const instance = render(<TasksPage remote='nas' />);
    await until(() => (instance.lastFrame() ?? '').includes('install failed (ssh: connect refused)'));

    const frame = instance.lastFrame() ?? '';
    expect(frame).toContain('Agent install on nas');
    expect(frame).toContain('agent install nas'); // the operation stays visible
    expect(frame).toContain('connect refused'); // live output lines
    expect(frame).toContain('install failed'); // failure status (the r retry hint lives in the footer, 9.15a)

    instance.unmount();
  });

  it('9.14b: install success reconnects the workspace (fresh handshake, NEW session)', async () => {
    let reconnectedSession: FakeAgentSession | null = null;
    const first = new FakeAgentSession();
    first.seedAgent([]);
    vi.mocked(connectAgentSession)
      .mockRejectedValueOnce(new Error('channel open failed'))
      .mockImplementation(async () => {
        // The reconnect is a FRESH session (the service resolves the remote
        // and builds a fresh SSH stack per connect call).
        reconnectedSession = new FakeAgentSession();
        reconnectedSession.seedAgent([]);
        return { kind: 'connected', session: reconnectedSession };
      });
    // The install "fixes" the remote: the service becomes installable right
    // before its success lands, so the automatic reconnect succeeds.
    vi.mocked(installAgent).mockResolvedValue({ kind: 'installed' });
    resetTasksStoreForTests();
    const instance = render(<TasksPage remote='nas' />);

    // First connect fails (agent missing) → panel runs → success → reconnect.
    await until(() => vi.mocked(connectAgentSession).mock.calls.length === 2);
    await until(() => (instance.lastFrame() ?? '').includes('No jobs yet'));

    expect(first.closed).toBe(false);
    // The closure assignment is invisible to TS's flow analysis; read through the widened type.
    expect((reconnectedSession as FakeAgentSession | null)?.closed).toBe(false);
    instance.unmount();
  });

  it('9.14a: publishes the handshake agent version to the app runtime', async () => {
    const session = fakeConnected();
    session.seedAgent([jobView(PRUNE_JOB)]);
    const onAgentVersion = vi.fn();
    resetTasksStoreForTests();
    const instance = render(<TasksPage remote='nas' onAgentVersion={onAgentVersion} />);

    await until(() => onAgentVersion.mock.calls.length > 0);
    expect(onAgentVersion).toHaveBeenCalledWith('0.1.2');
    instance.unmount();
  });

  it('ready: renders the agent header and the job list from reconcile', async () => {
    const session = fakeConnected();
    session.seedAgent([jobView(PRUNE_JOB)]);
    const instance = await renderWith(session);
    const frame = instance.lastFrame() ?? '';
    expect(frame).toContain('nas-prune');
    expect(frame).toContain('active');
    instance.unmount();
  });

  it('r queues a dry-run trigger for the selected job (jobs.trigger over the protocol)', async () => {
    const session = fakeConnected();
    session.seedAgent([jobView(PRUNE_JOB)]);
    session.responses.set('jobs.trigger', {
      run: { seq: 8, id: 'r8', jobId: 'nas-prune', mode: 'dry-run', status: 'pending', catchup: false, startedAt: 't' },
    });
    const instance = await renderWith(session);

    instance.stdin.write('r');
    await until(() => session.requests.some(request => request.type === 'jobs.trigger'));

    const trigger = session.requests.find(request => request.type === 'jobs.trigger');
    expect(trigger).toEqual({ type: 'jobs.trigger', payload: { jobId: 'nas-prune', mode: 'dry-run' } });
    instance.unmount();
  });

  it('d removes the selected job (jobs.delete over the protocol)', async () => {
    const session = fakeConnected();
    session.seedAgent([jobView(PRUNE_JOB)]);
    session.responses.set('jobs.delete', { deleted: true });
    const instance = await renderWith(session);

    instance.stdin.write('d');
    await until(() => session.requests.some(request => request.type === 'jobs.delete'));

    expect(session.requests).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'jobs.delete' })]));
    instance.unmount();
  });

  it('unmount disconnects the session (effect cleanup)', async () => {
    const session = fakeConnected();
    session.seedAgent([jobView(PRUNE_JOB)]);
    const instance = await renderWith(session);

    instance.unmount();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(session.closed).toBe(true);
  });
});

describe('TasksPage form mode (9.15c: Esc-only cancel, chars are data entry)', () => {
  it('with the form open, t/d/r/a fire NOTHING and type into the focused field; ONLY Esc returns to browse', async () => {
    const session = fakeConnected();
    session.seedAgent([jobView(PRUNE_JOB)]);
    session.responses.set('jobs.trigger', {
      run: { seq: 8, id: 'r8', jobId: 'nas-prune', mode: 'dry-run', status: 'pending', catchup: false, startedAt: 't' },
    });
    const instance = await renderWith(session);

    instance.stdin.write('n'); // open the create form
    await until(() => (instance.lastFrame() ?? '').includes('New job'));

    // Every char with a browse-mode meaning — plus the old form's quick-edit
    // chars — must be DATA ENTRY now: nothing triggers, nothing deletes, no
    // mode flips, and the characters land in the focused id field.
    instance.stdin.write('tdra');
    instance.stdin.write('t123o');
    await new Promise(resolve => setTimeout(resolve, 120));

    expect(session.requests.some(request => request.type === 'jobs.trigger')).toBe(false);
    expect(session.requests.some(request => request.type === 'jobs.delete')).toBe(false);
    expect(instance.lastFrame() ?? '').toContain('tdrat123o'); // chars reached the focused field
    expect(instance.lastFrame() ?? '').toContain('New job'); // still the form

    instance.stdin.write('\x1b'); // Esc is the ONLY cancel
    await until(() => (instance.lastFrame() ?? '').includes('Jobs'));
    expect(instance.lastFrame() ?? '').not.toContain('New job');

    // Back in browse, the actions are live again (the gating is mode-scoped).
    instance.stdin.write('r');
    await until(() => session.requests.some(request => request.type === 'jobs.trigger'));
    instance.unmount();
  });

  it('the old inline hint line is gone from the page body (9.15a: footer only)', async () => {
    const session = fakeConnected();
    session.seedAgent([jobView(PRUNE_JOB)]);
    const instance = await renderWith(session);

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
    const session = fakeConnected();
    session.seedAgent([jobView(PRUNE_JOB)]);
    vi.mocked(installAgent).mockImplementation(async ({ onLine }) => {
      onLine?.('ssh: connect refused');
      return { kind: 'failed', error: 'ssh: connect refused' };
    });
    resetTasksStoreForTests();
    const instance = render(
      <>
        <TasksPage remote='nas' />
        <FooterSpy />
      </>
    );

    // Ready browse workspace → the action hints are published.
    await until(() => (instance.lastFrame() ?? '').includes('footer: n new'));
    // Any request now fails → the install panel replaces the workspace and
    // the page hands the footer to the r retry hint (ready → error handoff).
    // The in-process install settles a microtask after the status flip, so
    // both assertions poll (footer first, then the pane's failure line).
    session.failNext = new Error('channel closed');
    instance.stdin.write('r');
    await until(() => (instance.lastFrame() ?? '').includes('footer: r retry'));
    await until(() => (instance.lastFrame() ?? '').includes('install failed'));
    instance.unmount();
  });
});
