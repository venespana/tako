// application/RunSchedulerLoop.test.ts — STRICT TDD RED phase (task 7.1/7.4)
//
// The loop wakes on an injectible timer and, per enabled cron job, applies
// the WU3 pure decision (decideCatchUp) over the persisted schedule_state:
// missed-once catch-up (3 missed → EXACTLY 1 run), tick fire/no-fire
// boundaries, and the last_fire_enqueued crash guard. Runs DRAIN SERIALLY —
// the second run waits for the first, and a job with an in-flight fire is
// never double-fired by a later tick.
import { describe, expect, it } from 'vitest';

import type { JobDefinition, JobView } from '../domain/types.js';
import { InMemoryJobStore } from '../testing/InMemoryJobStore.js';
import { ExecuteRun } from './ExecuteRun.js';
import type { JobExecutionOutcome, JobHandler } from './JobHandler.js';
// RED: import the module that doesn't exist yet
import { DEFAULT_TICK_INTERVAL_MS, RunSchedulerLoop, type SchedulerTimer } from './RunSchedulerLoop.js';

const T0 = '2026-09-18T08:00:00.000Z';
const HOUR = 3_600_000;

class FakeClock {
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

class FakeTimer implements SchedulerTimer {
  readonly pending: Array<{ fn: () => void; ms: number }> = [];

  set(fn: () => void, ms: number): unknown {
    this.pending.push({ fn, ms });
    return this.pending.length;
  }

  clear(handle: unknown): void {
    const index = Number(handle) - 1;
    if (index >= 0 && index < this.pending.length) this.pending.splice(index, 1);
  }

  fireNext(): void {
    const next = this.pending.shift();
    if (next) next.fn();
  }
}

const okHandler: JobHandler = { async execute(): Promise<JobExecutionOutcome> {
  return { status: 'succeeded', result: { ok: true } };
} };

/** Serial-execution probe: records start/end and holds each run on a manual gate. */
class GatedJobHandler implements JobHandler {
  readonly events: string[] = [];
  active = 0;
  maxConcurrent = 0;
  readonly #releases: Array<() => void> = [];

  execute(job: JobDefinition, _mode: string): Promise<JobExecutionOutcome> {
    this.events.push(`start:${job.id}`);
    this.active += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.active);
    return new Promise(resolve => {
      this.#releases.push(() => {
        this.active -= 1;
        this.events.push(`end:${job.id}`);
        resolve({ status: 'succeeded' });
      });
    });
  }

  releaseNext(): void {
    const release = this.#releases.shift();
    if (release) release();
  }
}

/** Skews one job to disabled so the loop's enabled-filter is observable. */
class DisabledJobStore extends InMemoryJobStore {
  override async listJobs(): Promise<JobView[]> {
    const jobs = await super.listJobs();
    return jobs.map(job => (job.job.id === 'off' ? { ...job, enabled: false } : job));
  }
}

function hourlyJob(id: string): JobDefinition {
  return { id, type: 'stack-lifecycle', op: 'pull', stackDir: `/srv/stacks/${id}`, schedule: { kind: 'cron', expr: '0 * * * *' } };
}

/** Seed a job whose watermark sits `missedHours` behind the clock (guard optional). */
async function seedJob(
  store: InMemoryJobStore,
  id: string,
  watermarkIso: string,
  guard = false
): Promise<JobDefinition> {
  const job = hourlyJob(id);
  await store.upsertJob(job);
  await store.saveScheduleState({ jobId: id, lastScheduledFire: watermarkIso, lastFireEnqueued: guard });
  return job;
}

function buildLoop(
  store: InMemoryJobStore,
  clock: FakeClock,
  handler: JobHandler = okHandler,
  intervalMs = DEFAULT_TICK_INTERVAL_MS
): { loop: RunSchedulerLoop; timer: FakeTimer; errors: string[] } {
  const timer = new FakeTimer();
  const errors: string[] = [];
  const executeRun = new ExecuteRun({ store, clock, handler });
  const loop = new RunSchedulerLoop({
    store,
    clock,
    executeRun,
    intervalMs,
    timer,
    error: line => errors.push(line),
  });
  return { loop, timer, errors };
}

/** Drain the microtask queue so in-memory store + drain-loop chains settle. */
async function settle(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

describe('RunSchedulerLoop — missed-once catch-up tick (7.1/7.4)', () => {
  it('7.1 RED: fresh job (no schedule state) → watermark initialized at now, no run', async () => {
    const store = new InMemoryJobStore();
    const clock = new FakeClock(T0);
    await store.upsertJob(hourlyJob('fresh-job'));
    const { loop, timer } = buildLoop(store, clock);

    await loop.start();

    expect(await store.listRuns({})).toEqual([]);
    expect(await store.getScheduleState('fresh-job')).toEqual({
      jobId: 'fresh-job',
      lastScheduledFire: T0,
      lastFireEnqueued: false,
    });
    expect(timer.pending).toHaveLength(1);
    expect(timer.pending[0]?.ms).toBe(DEFAULT_TICK_INTERVAL_MS);
    await loop.stop();
  });

  it('7.4 RED: 3 missed firings → EXACTLY 1 run (catchup true, mode apply), watermark advances past all misses', async () => {
    const store = new InMemoryJobStore();
    const clock = new FakeClock(T0);
    const job = await seedJob(store, 'nas-pull', T0);
    clock.advance(3.5 * HOUR); // 11:30 — fires at 09:00, 10:00, 11:00 were all missed
    const { loop } = buildLoop(store, clock);

    await loop.start();
    await settle();

    const runs = await store.listRuns({ jobId: job.id });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.catchup).toBe(true);
    expect(runs[0]?.mode).toBe('apply');
    expect(runs[0]?.status).toBe('succeeded');
    expect(await store.getScheduleState(job.id)).toEqual({
      jobId: job.id,
      lastScheduledFire: '2026-09-18T12:00:00.000Z',
      lastFireEnqueued: false,
    });
    await loop.stop();
  });

  it('7.4 RED: fire boundary — due at EXACTLY now fires; one minute before does not', async () => {
    const store = new InMemoryJobStore();
    const clock = new FakeClock(T0);
    const job = await seedJob(store, 'nas-pull', T0); // watermark 08:00

    clock.advance(59 * 60_000); // 08:59 — next fire 09:00 not due yet
    const early = buildLoop(store, clock);
    await early.loop.start();
    await settle();
    expect(await store.listRuns({ jobId: job.id })).toEqual([]);
    await early.loop.stop();

    clock.advance(60_000); // 09:00 exactly — due now (<= now)
    const due = buildLoop(store, clock);
    await due.loop.start();
    await settle();
    const runs = await store.listRuns({ jobId: job.id });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.catchup).toBe(false);
    await due.loop.stop();
  });

  it('7.4 RED: last_fire_enqueued crash guard — enqueue then crash before advance → restart does NOT double-run', async () => {
    const store = new InMemoryJobStore();
    const clock = new FakeClock(T0);
    const job = await seedJob(store, 'nas-pull', T0, true); // guard left set by the "crash"
    clock.advance(3.5 * HOUR);

    const restarted = buildLoop(store, clock); // fresh loop instance, same store
    await restarted.loop.start();
    await settle();

    expect(await store.listRuns({ jobId: job.id })).toEqual([]);
    expect(await store.getScheduleState(job.id)).toEqual({
      jobId: job.id,
      lastScheduledFire: '2026-09-18T12:00:00.000Z',
      lastFireEnqueued: false,
    });
    await restarted.loop.stop();
  });

  it('7.4 RED: disabled jobs are skipped entirely (state untouched)', async () => {
    const store = new DisabledJobStore();
    const clock = new FakeClock(T0);
    const job = await seedJob(store, 'off', T0);
    clock.advance(3.5 * HOUR);
    const { loop } = buildLoop(store, clock);

    await loop.start();
    await settle();

    expect(await store.listRuns({ jobId: job.id })).toEqual([]);
    expect(await store.getScheduleState(job.id)).toEqual({
      jobId: job.id,
      lastScheduledFire: T0,
      lastFireEnqueued: false,
    });
    await loop.stop();
  });
});

describe('RunSchedulerLoop — serial execution (7.4)', () => {
  it('7.4 RED: second queued run waits for the first to finish (max concurrency 1, FIFO order)', async () => {
    const store = new InMemoryJobStore();
    const clock = new FakeClock(T0);
    const a = await seedJob(store, 'job-a', T0);
    const b = await seedJob(store, 'job-b', T0);
    clock.advance(1.5 * HOUR); // 09:30 — the 09:00 fire is due for both
    const handler = new GatedJobHandler();
    const { loop } = buildLoop(store, clock, handler);

    await loop.start();
    await settle(3);
    expect(handler.events).toEqual(['start:job-a']);
    expect(loop.hasQueuedFire('job-b')).toBe(true);

    handler.releaseNext(); // finish a → b starts only after
    await settle();
    expect(handler.events).toEqual(['start:job-a', 'end:job-a', 'start:job-b']);
    handler.releaseNext();
    await settle();

    expect(handler.events).toEqual(['start:job-a', 'end:job-a', 'start:job-b', 'end:job-b']);
    expect(handler.maxConcurrent).toBe(1);
    expect((await store.listRuns({ jobId: a.id })).map(run => run.status)).toEqual(['succeeded']);
    expect((await store.listRuns({ jobId: b.id })).map(run => run.status)).toEqual(['succeeded']);
    await loop.stop();
  });

  it('7.4 RED: a later tick during an in-flight run does NOT double-fire the same job', async () => {
    const store = new InMemoryJobStore();
    const clock = new FakeClock(T0);
    const job = await seedJob(store, 'job-a', T0);
    clock.advance(1.5 * HOUR); // 09:30 — the 09:00 fire is due
    const handler = new GatedJobHandler();
    const { loop, timer } = buildLoop(store, clock, handler);

    await loop.start();
    await settle(3);
    expect(handler.events).toEqual(['start:job-a']);

    timer.fireNext(); // tick 2 while a is still executing
    await settle();
    expect(await store.listRuns({ jobId: job.id })).toHaveLength(1);

    handler.releaseNext();
    await settle();
    expect(await store.listRuns({ jobId: job.id })).toHaveLength(1);
    await loop.stop();
  });
});

describe('RunSchedulerLoop — clean shutdown (7.3 contract)', () => {
  it('stop() finishes the in-flight run, rolls back queued-not-started fires, clears the timer', async () => {
    const store = new InMemoryJobStore();
    const clock = new FakeClock(T0);
    const a = await seedJob(store, 'job-a', T0);
    const b = await seedJob(store, 'job-b', T0);
    clock.advance(1.5 * HOUR); // 09:30 — the 09:00 fire is due for both
    const handler = new GatedJobHandler();
    const { loop, timer } = buildLoop(store, clock, handler);

    await loop.start();
    await settle(3);
    expect(handler.events).toEqual(['start:job-a']); // a in flight, b queued

    const stopped = loop.stop();
    handler.releaseNext(); // the in-flight run finishes as part of stop
    await stopped;

    expect(timer.pending).toHaveLength(0);
    const aRuns = await store.listRuns({ jobId: a.id });
    expect(aRuns.map(run => run.status)).toEqual(['succeeded']);
    // b never started: its firing is rolled back so the restart catches it up.
    expect(await store.listRuns({ jobId: b.id })).toEqual([]);
    expect(await store.getScheduleState(b.id)).toEqual({
      jobId: b.id,
      lastScheduledFire: T0,
      lastFireEnqueued: false,
    });

    // Restart on the same store: b runs exactly once; a is already accounted.
    const restarted = buildLoop(store, clock, okHandler);
    await restarted.loop.start();
    await settle();
    expect(await store.listRuns({ jobId: b.id })).toHaveLength(1);
    expect(await store.listRuns({ jobId: a.id })).toHaveLength(1);
    await restarted.loop.stop();
  });
});
