// application/ExecuteRun.test.ts — STRICT TDD RED phase (task 7.2)
//
// ExecuteRun drives ONE run through the state machine: pending → running →
// terminal (WU3 pure guard), calling the JobHandler port and recording the
// outcome. A scheduled fire also advances the catch-up watermark and clears
// the crash guard — ON FAILURE TOO (spec `agent-jobs#Missed-Runs-Execute-Once`:
// the firing is accounted for exactly once, whatever the outcome).
import { describe, expect, it } from 'vitest';

import { IllegalRunTransitionError } from '../domain/run.js';
import type { JobDefinition, RunMode, RunStatus, RunView } from '../domain/types.js';
import { InMemoryJobStore } from '../testing/InMemoryJobStore.js';
import type { Clock } from './Clock.js';
import { UNSUPPORTED_OUTCOME, type JobExecutionOutcome, type JobHandler } from './JobHandler.js';
import type { CreateRunInput } from './JobStore.js';
// RED: import the module that doesn't exist yet
import { ExecuteRun, type RunEngineEvent } from './ExecuteRun.js';

const hourlyJob = (id: string): JobDefinition => ({
  id,
  type: 'stack-lifecycle',
  op: 'pull',
  stackDir: '/srv/stacks/caddy',
  schedule: { kind: 'cron', expr: '0 * * * *' },
});

class FakeClock implements Clock {
  #now: Date;

  constructor(iso: string) {
    this.#now = new Date(iso);
  }

  now(): Date {
    return this.#now;
  }

  advance(ms: number): void {
    this.#now = new Date(this.#now.getTime() + ms);
  }
}

class FakeJobHandler implements JobHandler {
  readonly calls: Array<{ job: JobDefinition; mode: RunMode }> = [];

  constructor(private readonly outcome: JobExecutionOutcome | Error) {}

  async execute(job: JobDefinition, mode: RunMode): Promise<JobExecutionOutcome> {
    this.calls.push({ job, mode });
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

/** Corrupted-persistence fake: createRun hands back an already-terminal run. */
class TerminalRunStore extends InMemoryJobStore {
  override async createRun(input: CreateRunInput): Promise<RunView> {
    const run = await super.createRun(input);
    return { ...run, status: 'succeeded' as RunStatus };
  }
}

function build(): {
  store: InMemoryJobStore;
  clock: FakeClock;
  events: RunEngineEvent[];
} {
  const store = new InMemoryJobStore();
  const clock = new FakeClock('2026-09-18T11:30:00.000Z');
  const events: RunEngineEvent[] = [];
  return { store, clock, events };
}

describe('ExecuteRun — one run through the state machine (7.2)', () => {
  it('7.2 RED: apply success — pending→running→succeeded, result + finishedAt recorded, watermark advances, guard clears', async () => {
    const { store, clock, events } = build();
    const job = hourlyJob('nas-pull');
    await store.upsertJob(job);
    // The loop set the crash guard when it enqueued this firing.
    await store.saveScheduleState({ jobId: job.id, lastScheduledFire: '2026-09-18T08:00:00.000Z', lastFireEnqueued: true });
    const handler = new FakeJobHandler({ status: 'succeeded', result: { pulled: ['caddy:2'] } });
    const executeRun = new ExecuteRun({ store, clock, handler, onEvent: event => events.push(event) });

    const run = await executeRun.execute({
      job,
      mode: 'apply',
      catchup: true,
      fire: { nextWatermark: '2026-09-18T12:00:00.000Z' },
    });

    expect(run.status).toBe('succeeded');
    expect(run.finishedAt).toBe('2026-09-18T11:30:00.000Z');
    expect(run.result).toEqual({ pulled: ['caddy:2'] });
    expect(handler.calls).toEqual([{ job, mode: 'apply' }]);
    const state = await store.getScheduleState(job.id);
    expect(state).toEqual({ jobId: job.id, lastScheduledFire: '2026-09-18T12:00:00.000Z', lastFireEnqueued: false });
    expect(events).toEqual([
      {
        type: 'job.state_changed',
        payload: { jobId: job.id, runId: run.id, from: 'pending', to: 'running', at: '2026-09-18T11:30:00.000Z' },
      },
      {
        type: 'job.state_changed',
        payload: { jobId: job.id, runId: run.id, from: 'running', to: 'succeeded', at: '2026-09-18T11:30:00.000Z' },
      },
      {
        type: 'run.completed',
        payload: { jobId: job.id, runId: run.id, status: 'succeeded', result: { pulled: ['caddy:2'] } },
      },
    ]);
  });

  it('7.2 RED: handler throws — run recorded FAILED with { error } result, watermark STILL advances (advance on failure)', async () => {
    const { store, clock, events } = build();
    const job = hourlyJob('nas-pull');
    await store.upsertJob(job);
    await store.saveScheduleState({ jobId: job.id, lastScheduledFire: '2026-09-18T08:00:00.000Z', lastFireEnqueued: true });
    const handler = new FakeJobHandler(new Error('docker daemon unreachable'));
    const executeRun = new ExecuteRun({ store, clock, handler, onEvent: event => events.push(event) });

    const run = await executeRun.execute({
      job,
      mode: 'apply',
      catchup: false,
      fire: { nextWatermark: '2026-09-18T12:00:00.000Z' },
    });

    expect(run.status).toBe('failed');
    expect(run.finishedAt).toBe('2026-09-18T11:30:00.000Z');
    expect(run.result).toEqual({ error: 'docker daemon unreachable' });
    const state = await store.getScheduleState(job.id);
    expect(state).toEqual({ jobId: job.id, lastScheduledFire: '2026-09-18T12:00:00.000Z', lastFireEnqueued: false });
    expect(events.at(-1)).toEqual({
      type: 'run.completed',
      payload: { jobId: job.id, runId: run.id, status: 'failed', result: { error: 'docker daemon unreachable' } },
    });
  });

  it('7.2 RED: dry-run mode passes through to the handler; report recorded; no fire → schedule state untouched', async () => {
    const { store, clock } = build();
    const job = hourlyJob('nas-pull');
    await store.upsertJob(job);
    await store.saveScheduleState({ jobId: job.id, lastScheduledFire: '2026-09-18T08:00:00.000Z', lastFireEnqueued: false });
    const handler = new FakeJobHandler({ status: 'succeeded', result: { planned: true } });
    const executeRun = new ExecuteRun({ store, clock, handler });

    const run = await executeRun.execute({ job, mode: 'dry-run', catchup: false });

    expect(run.status).toBe('succeeded');
    expect(run.result).toEqual({ planned: true });
    expect(handler.calls).toEqual([{ job, mode: 'dry-run' }]);
    // No scheduled fire context → the loop's watermark bookkeeping is untouched.
    expect(await store.getScheduleState(job.id)).toEqual({
      jobId: job.id,
      lastScheduledFire: '2026-09-18T08:00:00.000Z',
      lastFireEnqueued: false,
    });
  });

  it('7.2 RED: server-config stub handler outcome — terminal unsupported, watermark still accounted', async () => {
    const { store, clock } = build();
    const job: JobDefinition = { id: 'srv-cfg', type: 'server-config', schedule: { kind: 'cron', expr: '0 3 * * *' } };
    await store.upsertJob(job);
    await store.saveScheduleState({ jobId: job.id, lastScheduledFire: '2026-09-18T02:00:00.000Z', lastFireEnqueued: true });
    const executeRun = new ExecuteRun({ store, clock, handler: new FakeJobHandler(UNSUPPORTED_OUTCOME) });

    const run = await executeRun.execute({
      job,
      mode: 'apply',
      catchup: false,
      fire: { nextWatermark: '2026-09-18T03:00:00.000Z' },
    });

    expect(run.status).toBe('unsupported');
    expect(await store.getScheduleState(job.id)).toEqual({
      jobId: job.id,
      lastScheduledFire: '2026-09-18T03:00:00.000Z',
      lastFireEnqueued: false,
    });
  });

  it('7.2 RED: illegal transition (corrupted store returns a terminal run) rejected by the WU3 guard', async () => {
    const store = new TerminalRunStore();
    const clock = new FakeClock('2026-09-18T11:30:00.000Z');
    const job = hourlyJob('nas-pull');
    await store.upsertJob(job);
    const executeRun = new ExecuteRun({ store, clock, handler: new FakeJobHandler({ status: 'succeeded' }) });

    await expect(executeRun.execute({ job, mode: 'apply', catchup: false })).rejects.toThrow(IllegalRunTransitionError);
  });

  it('8.0 RED: executes a pre-created triggered run instead of creating a second one', async () => {
    const { store, clock } = build();
    const job = hourlyJob('nas-pull');
    await store.upsertJob(job);
    // TriggerJob already created this pending run when the trigger arrived.
    const triggered = await store.createRun({
      jobId: job.id,
      mode: 'dry-run',
      catchup: false,
      startedAt: clock.now().toISOString(),
    });
    const handler = new FakeJobHandler({ status: 'succeeded', result: { planned: true } });
    const executeRun = new ExecuteRun({ store, clock, handler });

    const run = await executeRun.execute({ job, mode: 'dry-run', catchup: false, run: triggered });

    expect(run.id).toBe(triggered.id);
    expect(run.status).toBe('succeeded');
    const runs = await store.listRuns({});
    expect(runs).toHaveLength(1); // the pre-created run — never a duplicate
    expect(runs[0]?.id).toBe(triggered.id);
    expect(handler.calls).toEqual([{ job, mode: 'dry-run' }]);
  });
});
