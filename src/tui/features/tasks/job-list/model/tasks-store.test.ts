// features/tasks/job-list/model/tasks-store.test.ts — STRICT TDD RED phase (task 8.3/8.14)
//
// The zustand tasks store: connect (handshake + agent.status + reconcile.sync
// with the per-remote cursor), CRUD actions, trigger (queued run lands in
// history), history loading with merge, and the push-event handlers
// (job.state_changed / run.completed / protocol.warning) that keep the store
// live. All async behavior runs against a fake gateway + fake session — no
// real transport, no conf.
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AgentFrame,
  AgentRequestMap,
  AgentRequestType,
} from '../../../../../domains/agent/domain/protocol.js';
import type {
  JobDefinition,
  RunMode,
  RunView,
  Slug,
} from '../../../../../domains/agent/domain/types.js';
import type {
  AgentHandshake,
  AgentSession,
} from '../../../../../domains/agent/application/AgentTransport.js';
import {
  applyJobStateChanged,
  applyRunCompleted,
  mergeRuns,
  useTasksStore,
  type AgentInstallOutcome,
  type TasksGateway,
} from './tasks-store.js';

const PRUNE_JOB: JobDefinition = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['dangling-images'],
  schedule: { kind: 'cron', expr: '0 4 * * *' },
};

function jobView(job: JobDefinition, enabled = true) {
  return { job, enabled, createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z' };
}

function runView(overrides: Partial<RunView> & { id: string; jobId: Slug }): RunView {
  return {
    seq: 1,
    mode: 'apply',
    status: 'succeeded',
    catchup: false,
    startedAt: '2026-09-18T04:00:00.000Z',
    ...overrides,
  };
}

/** Fake protocol session: canned responses, recorded requests, manual push events. */
class FakeSession implements AgentSession {
  handshake: AgentHandshake = { ack: { agentVersion: '0.1.2', protocol: 1, agentStartId: 'start-1' } };
  readonly requests: Array<{ type: AgentRequestType; payload: unknown }> = [];
  readonly responses = new Map<AgentRequestType, unknown>();
  readonly listeners: Array<(frame: AgentFrame) => void> = [];
  failNext: Error | null = null;
  closed = false;

  async request<K extends AgentRequestType>(
    type: K,
    payload: AgentRequestMap[K]['request']
  ): Promise<AgentRequestMap[K]['response']> {
    this.requests.push({ type, payload });
    if (this.failNext !== null) throw this.failNext;
    return structuredClone(this.responses.get(type)) as AgentRequestMap[K]['response'];
  }

  onEvent(listener: (frame: AgentFrame) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  emit(frame: AgentFrame): void {
    for (const listener of [...this.listeners]) listener(frame);
  }
}

class FakeGateway implements TasksGateway {
  readonly remote = 'nas';
  readonly session = new FakeSession();
  connectCalls = 0;
  cursor = 3;
  readonly savedCursors: number[] = [];
  connectError: Error | null = null;

  async connect(): Promise<AgentSession> {
    this.connectCalls += 1;
    if (this.connectError !== null) throw this.connectError;
    return this.session;
  }

  // 9.19: part of the port — irrelevant to the store tests (no install path
  // runs here), so a never-used stub satisfies the interface honestly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async install(_onLine: (line: string) => void): Promise<AgentInstallOutcome> {
    return { ok: true };
  }

  loadCursor(): number {
    return this.cursor;
  }

  saveCursor(seq: number): void {
    this.cursor = seq;
    this.savedCursors.push(seq);
  }
}

function seedAgentAndSync(session: FakeSession, jobs: JobDefinition[] = [PRUNE_JOB], runs: RunView[] = []): void {
  session.responses.set('agent.status', {
    agentVersion: '0.1.2',
    protocol: 1,
    uptimeSec: 42,
    jobCount: jobs.length,
    unitState: 'active',
    linger: true,
    lingerByTako: true,
  });
  session.responses.set('reconcile.sync', { jobs: jobs.map(job => jobView(job)), runs, lastSeq: runs.at(-1)?.seq ?? 7 });
}

describe('tasks store — connect + reconcile (8.3/8.14)', () => {
  let gateway: FakeGateway;

  beforeEach(() => {
    gateway = new FakeGateway();
    useTasksStore.getState().reset();
  });

  it('connect: handshake → agent info → reconcile.sync from the cursor; runs merge; cursor saves', async () => {
    const run = runView({ id: 'r1', jobId: 'nas-prune', seq: 7 });
    seedAgentAndSync(gateway.session, [PRUNE_JOB], [run]);
    const store = useTasksStore;

    const ok = await store.getState().connect(gateway);

    expect(ok).toBe(true);
    const state = store.getState();
    expect(state.status).toBe('ready');
    expect(state.agent).toMatchObject({ agentVersion: '0.1.2', unitState: 'active', linger: true, lingerByTako: true });
    expect(state.jobs).toHaveLength(1);
    expect(state.historyByJob['nas-prune']).toEqual([run]);
    expect(state.lastSeq).toBe(7);
    expect(gateway.savedCursors).toEqual([7]);
    // The client offered its persisted cursor (3) to the sync.
    expect(gateway.session.requests).toEqual([
      { type: 'agent.status', payload: {} },
      { type: 'reconcile.sync', payload: { lastSeq: 3 } },
    ]);
    // Exactly one push-event subscription is live after connect.
    expect(gateway.session.listeners).toHaveLength(1);
  });

  it('connect: handshake warning downgrades to status warning with the detail, but the session continues', async () => {
    gateway.session.handshake = {
      ack: { agentVersion: '0.0.9', protocol: 1, agentStartId: 'start-1' },
      warning: {
        clientVersion: '0.1.2',
        agentVersion: '0.0.9',
        detail: 'agent version differs from client — re-run "tako agent install"',
      },
    };
    seedAgentAndSync(gateway.session);

    await expect(useTasksStore.getState().connect(gateway)).resolves.toBe(true);

    const state = useTasksStore.getState();
    expect(state.status).toBe('warning');
    expect(state.message).toContain('agent version differs');
    expect(state.jobs).toHaveLength(1); // the session stayed usable
  });

  it('connect failure (agent unreachable / not installed): status error with the message', async () => {
    gateway.connectError = new Error('channel open failed: ~/.tako/agent.sock');

    await expect(useTasksStore.getState().connect(gateway)).resolves.toBe(false);

    const state = useTasksStore.getState();
    expect(state.status).toBe('error');
    expect(state.message).toContain('agent.sock');
    // No session bound → every subsequent action fails fast.
    await expect(useTasksStore.getState().refresh()).resolves.toBe(false);
  });

  it('disconnect: closes the session, unsubscribes push events, resets to idle', async () => {
    seedAgentAndSync(gateway.session);
    const store = useTasksStore;
    await store.getState().connect(gateway);

    await store.getState().disconnect();

    const state = store.getState();
    expect(gateway.session.closed).toBe(true);
    expect(gateway.session.listeners).toHaveLength(0);
    expect(state.status).toBe('idle');
    expect(state.jobs).toEqual([]);
    // No session bound → every subsequent action fails fast.
    await expect(store.getState().refresh()).resolves.toBe(false);
  });
});

describe('tasks store — job CRUD actions (8.14)', () => {
  let gateway: FakeGateway;

  beforeEach(async () => {
    gateway = new FakeGateway();
    useTasksStore.getState().reset();
    seedAgentAndSync(gateway.session);
    await useTasksStore.getState().connect(gateway);
    gateway.session.requests.length = 0;
  });

  it('refresh: jobs.list response replaces the job list', async () => {
    const other: JobDefinition = {
      id: 'nightly-pull',
      type: 'stack-lifecycle',
      op: 'pull',
      stackDir: '/srv/stacks/caddy',
      schedule: { kind: 'cron', expr: '0 3 * * *' },
    };
    gateway.session.responses.set('jobs.list', { jobs: [jobView(other)] });

    await expect(useTasksStore.getState().refresh()).resolves.toBe(true);

    expect(useTasksStore.getState().jobs.map(view => view.job.id)).toEqual(['nightly-pull']);
  });

  it('upsert: inserts a new job and replaces an existing one by id (idempotent identity)', async () => {
    const updated: JobDefinition = { ...PRUNE_JOB, scopes: ['build-cache'] };
    gateway.session.responses.set('jobs.upsert', { job: jobView(updated), created: false });

    const saved = await useTasksStore.getState().upsert(updated);

    expect(saved?.job).toEqual(updated);
    expect(useTasksStore.getState().jobs).toHaveLength(1);
    expect(useTasksStore.getState().jobs[0]?.job).toEqual(updated);
  });

  it('remove: drops the job only when the server confirms the deletion', async () => {
    gateway.session.responses.set('jobs.delete', { deleted: true });

    await expect(useTasksStore.getState().remove('nas-prune')).resolves.toBe(true);
    expect(useTasksStore.getState().jobs).toEqual([]);

    gateway.session.responses.set('jobs.delete', { deleted: false });
    await expect(useTasksStore.getState().remove('nas-prune')).resolves.toBe(false);
  });

  it('trigger: appends the queued pending run to history and advances the cursor', async () => {
    const queued = runView({ id: 'r9', jobId: 'nas-prune', seq: 9, mode: 'dry-run', status: 'pending' });
    gateway.session.responses.set('jobs.trigger', { run: queued });

    const run = await useTasksStore.getState().trigger('nas-prune', 'dry-run');

    expect(run?.status).toBe('pending');
    expect(useTasksStore.getState().historyByJob['nas-prune']).toEqual([queued]);
    expect(useTasksStore.getState().lastSeq).toBe(9);
    // 7 was saved by connect's reconcile, 9 by the trigger's seq advance.
    expect(gateway.savedCursors).toEqual([7, 9]);
  });

  it('loadHistory: merges server runs with locally known runs (reconcile after disconnect), newest first', async () => {
    const local = runView({ id: 'r7', jobId: 'nas-prune', seq: 7, status: 'running' });
    useTasksStore.setState({ historyByJob: { 'nas-prune': [local] } });
    const serverR7 = runView({ id: 'r7', jobId: 'nas-prune', seq: 7, status: 'succeeded', finishedAt: 't7' });
    const serverR8 = runView({ id: 'r8', jobId: 'nas-prune', seq: 8, status: 'failed', result: { error: 'boom' } });
    gateway.session.responses.set('jobs.history', { runs: [serverR7, serverR8], lastSeq: 8 });

    const merged = await useTasksStore.getState().loadHistory('nas-prune');

    expect(merged.map(row => row.id)).toEqual(['r8', 'r7']); // newest first
    expect(merged.find(row => row.id === 'r7')?.status).toBe('succeeded'); // server truth wins
    expect(useTasksStore.getState().lastSeq).toBe(8);
    expect(gateway.savedCursors).toEqual([7, 8]); // reconcile's 7 + history's 8
  });

  it('select: lazily loads history for the newly selected job exactly once', async () => {
    const r1 = runView({ id: 'r1', jobId: 'nas-prune', seq: 1 });
    gateway.session.responses.set('jobs.history', { runs: [r1], lastSeq: 1 });

    // select() auto-loads missing history (fire-and-forget) — settle it.
    useTasksStore.getState().select('nas-prune');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useTasksStore.getState().historyByJob['nas-prune']).toHaveLength(1);

    // Re-selecting the same job must not re-request.
    useTasksStore.getState().select('nas-prune');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(gateway.session.requests.filter(request => request.type === 'jobs.history')).toHaveLength(1);
  });
});

describe('tasks store — push events keep the store live (8.14)', () => {
  let gateway: FakeGateway;

  beforeEach(async () => {
    gateway = new FakeGateway();
    useTasksStore.getState().reset();
    seedAgentAndSync(gateway.session);
    await useTasksStore.getState().connect(gateway);
    gateway.session.requests.length = 0;
  });

  it('job.state_changed updates the run status in place (running → succeeded, finishedAt from at)', () => {
    const running = runView({ id: 'r1', jobId: 'nas-prune', seq: 1, status: 'running' });
    useTasksStore.setState({ historyByJob: { 'nas-prune': [running] } });

    gateway.session.emit({
      v: 1,
      kind: 'event',
      type: 'job.state_changed',
      payload: { jobId: 'nas-prune', runId: 'r1', from: 'running', to: 'succeeded', at: '2026-09-18T04:05:00.000Z' },
    });

    const updated = useTasksStore.getState().historyByJob['nas-prune']?.[0];
    expect(updated?.status).toBe('succeeded');
    expect(updated?.finishedAt).toBe('2026-09-18T04:05:00.000Z');
  });

  it('run.completed records the terminal status and result', () => {
    const running = runView({ id: 'r2', jobId: 'nas-prune', seq: 2, status: 'running' });
    useTasksStore.setState({ historyByJob: { 'nas-prune': [running] } });

    gateway.session.emit({
      v: 1,
      kind: 'event',
      type: 'run.completed',
      payload: { jobId: 'nas-prune', runId: 'r2', status: 'failed', result: { error: 'docker down' } },
    });

    const updated = useTasksStore.getState().historyByJob['nas-prune']?.[0];
    expect(updated?.status).toBe('failed');
    expect(updated?.result).toEqual({ error: 'docker down' });
  });

  it('protocol.warning downgrades the store to warning with the detail', () => {
    gateway.session.emit({
      v: 1,
      kind: 'event',
      type: 'protocol.warning',
      payload: { clientVersion: '0.1.2', agentVersion: '0.0.9', detail: 'agent version differs' },
    });

    const state = useTasksStore.getState();
    expect(state.status).toBe('warning');
    expect(state.message).toContain('differs');
  });

  it('a failed request surfaces as status error and closes the dead session', async () => {
    gateway.session.failNext = new Error('transport closed');

    await expect(useTasksStore.getState().refresh()).resolves.toBe(false);

    const state = useTasksStore.getState();
    expect(state.status).toBe('error');
    expect(state.message).toContain('transport closed');
    expect(gateway.session.closed).toBe(true);
  });
});

describe('tasks store — pure reconcile helpers (8.14)', () => {
  it('mergeRuns dedupes by run id (server truth replaces local), sorted newest first', () => {
    const local = runView({ id: 'a', jobId: 'j', seq: 4, status: 'running' });
    const incomingOld = runView({ id: 'a', jobId: 'j', seq: 4, status: 'succeeded' });
    const incomingNew = runView({ id: 'b', jobId: 'j', seq: 9, status: 'failed' });

    const merged = mergeRuns([local], [incomingNew, incomingOld]);

    expect(merged.map(row => row.id)).toEqual(['b', 'a']);
    expect(merged.find(row => row.id === 'a')?.status).toBe('succeeded');
    expect(merged).toHaveLength(2); // never duplicated
  });

  it('job.state_changed on an unknown run id is a no-op (no fabricated history)', () => {
    const state = { 'nas-prune': [runView({ id: 'r1', jobId: 'nas-prune', seq: 1 })] };

    const next = applyJobStateChanged(state, {
      jobId: 'nas-prune',
      runId: 'unknown',
      from: 'pending',
      to: 'running',
      at: 't',
    });

    expect(next).toBe(state); // untouched — history only reflects known runs
  });

  it('run.completed updates an existing run with status + result', () => {
    const pending = runView({ id: 'r3', jobId: 'nas-prune', seq: 3, status: 'pending' });
    const state = { 'nas-prune': [pending] };

    const next = applyRunCompleted(state, {
      jobId: 'nas-prune',
      runId: 'r3',
      status: 'succeeded',
      result: { removed: 3 },
    });

    expect(next['nas-prune']?.[0]?.status).toBe('succeeded');
    expect(next['nas-prune']?.[0]?.result).toEqual({ removed: 3 });
  });
});
