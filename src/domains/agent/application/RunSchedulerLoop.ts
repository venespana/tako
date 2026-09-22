// RunSchedulerLoop.ts — the autonomous tick (task 7.1)
//
// Wakes every 30 s (injectible interval + timer) and, for each ENABLED cron
// job, consults the WU3 pure decision (decideCatchUp) over the persisted
// schedule_state (watermark last_scheduled_fire + last_fire_enqueued crash
// guard):
//
//   enqueue → the firing is due: set the crash guard, queue EXACTLY ONE run
//             (catchup: true when >1 firing was missed), and let ExecuteRun
//             advance the watermark when the run settles.
//   advance → crash leftover (guard set, enqueued firing never completed):
//             advance the watermark + clear the guard WITHOUT re-enqueueing
//             — at-most-once inside the crash window (design §Job & Run
//             Model: the guard exists so a crash can never double-enqueue).
//   none    → nothing due.
//
// Fresh jobs (no schedule_state yet) get their watermark initialized at the
// first tick after registration — no catch-up for pre-registration history.
//
// Runs DRAIN SERIALLY (one at a time) from an internal queue while the tick
// keeps ticking. Serial execution is STRUCTURAL: a single drain loop awaits
// each run, so no code path can start a second run while one is in flight.
// A job whose fire is queued or in-flight is skipped by the tick — the
// drain's completion advance is what keeps decideCatchUp from re-firing it.
//
// Clean shutdown (task 7.3 contract): stop() clears the timer, lets the
// in-flight run finish, and rolls queued-but-not-started firings back to
// their pre-enqueue schedule state so the NEXT start catches them up exactly
// once (dropping them unaccounted would silently lose the firing).
//
// DST note (design D6): schedules are server-local cron; wall times skipped
// by a DST transition never fire — nextAfter never lands on them, no magic
// retries.
import type { Clock } from './Clock.js';
import type { ExecuteRun } from './ExecuteRun.js';
import type { JobStore } from './JobStore.js';
import type { JobDefinition, RunMode } from '../domain/types.js';
import { decideCatchUp } from './use-cases/MissedOnceCatchUp.js';

export const DEFAULT_TICK_INTERVAL_MS = 30_000;

/**
 * Scheduled runs APPLY: the spec's apply-after-report scenario fires
 * "explicitly or on schedule", and unattended autonomy is the point of the
 * agent (destructive scopes stay structurally bounded per ADR-0008).
 */
const SCHEDULED_RUN_MODE: RunMode = 'apply';

/** Port over the event-loop timer so tests drive ticks deterministically. */
export interface SchedulerTimer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const defaultSchedulerTimer: SchedulerTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** One due scheduled firing queued for serial execution. */
interface QueuedFire {
  readonly job: JobDefinition;
  readonly catchup: boolean;
  /** Watermark ExecuteRun persists once this run settles. */
  readonly nextWatermark: string;
  /** Watermark before this firing was enqueued — restored when dropped at a clean stop. */
  readonly previousWatermark: string;
}

export interface RunSchedulerLoopOptions {
  readonly store: JobStore;
  readonly clock: Clock;
  readonly executeRun: ExecuteRun;
  readonly intervalMs?: number;
  readonly timer?: SchedulerTimer;
  readonly log?: (line: string) => void;
  readonly error?: (line: string) => void;
}

export class RunSchedulerLoop {
  readonly #store: JobStore;
  readonly #clock: Clock;
  readonly #executeRun: ExecuteRun;
  readonly #intervalMs: number;
  readonly #timer: SchedulerTimer;
  readonly #log: (line: string) => void;
  readonly #error: (line: string) => void;
  readonly #queue: QueuedFire[] = [];

  #started = false;
  #stopped = false;
  #draining = false;
  #timerHandle: unknown;
  #tickInFlight?: Promise<void>;
  #currentFire?: QueuedFire;
  #currentRun?: Promise<void>;

  constructor(options: RunSchedulerLoopOptions) {
    this.#store = options.store;
    this.#clock = options.clock;
    this.#executeRun = options.executeRun;
    this.#intervalMs = options.intervalMs ?? DEFAULT_TICK_INTERVAL_MS;
    this.#timer = options.timer ?? defaultSchedulerTimer;
    this.#log = options.log ?? (() => {});
    this.#error = options.error ?? (() => {});
  }

  /** Run the first (start-of-agent catch-up) tick, then arm the recurring timer. */
  async start(): Promise<void> {
    if (this.#started || this.#stopped) return;
    this.#started = true;
    this.#tickInFlight = this.#tick();
    try {
      await this.#tickInFlight;
    } finally {
      this.#armTimer();
    }
  }

  /**
   * Clean shutdown: stop ticking, finish the in-flight run, roll back
   * queued-not-started firings. Idempotent.
   */
  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#timerHandle !== undefined) {
      this.#timer.clear(this.#timerHandle);
      this.#timerHandle = undefined;
    }
    await this.#tickInFlight;
    const inflight = this.#currentRun;
    if (inflight !== undefined) await inflight;
    await this.#restoreQueuedFires();
    this.#queue.length = 0;
  }

  /** True while a scheduled fire for this job is queued or executing. */
  hasQueuedFire(jobId: string): boolean {
    return this.#currentFire?.job.id === jobId || this.#queue.some(fire => fire.job.id === jobId);
  }

  #armTimer(): void {
    if (this.#stopped) return;
    // Self-rearming: the next tick is scheduled only after the previous one's
    // decision phase completes — ticks never overlap themselves.
    this.#timerHandle = this.#timer.set(() => void this.#tickAndRearm(), this.#intervalMs);
  }

  async #tickAndRearm(): Promise<void> {
    this.#timerHandle = undefined;
    this.#tickInFlight = this.#tick();
    try {
      await this.#tickInFlight;
    } finally {
      this.#armTimer();
    }
  }

  async #tick(): Promise<void> {
    let jobs;
    try {
      jobs = await this.#store.listJobs();
    } catch (error) {
      this.#report(`tick failed listing jobs: ${describeError(error)}`);
      return;
    }
    const now = this.#clock.now();
    for (const view of jobs) {
      if (!view.enabled) continue;
      // Per-job isolation: one broken job must not kill the tick for the rest.
      try {
        await this.#processJob(view.job, now);
      } catch (error) {
        this.#report(`tick: job ${view.job.id}: ${describeError(error)}`);
      }
    }
  }

  async #processJob(job: JobDefinition, now: Date): Promise<void> {
    if (this.hasQueuedFire(job.id)) return;

    const state = await this.#store.getScheduleState(job.id);
    if (state === undefined || state.lastScheduledFire === undefined) {
      // Fresh registration: the watermark starts at NOW — history before the
      // job existed is never caught up (decideCatchUp's fresh-job contract).
      await this.#store.saveScheduleState({
        jobId: job.id,
        lastScheduledFire: now.toISOString(),
        lastFireEnqueued: false,
      });
      return;
    }

    const decision = decideCatchUp({
      expr: job.schedule.expr,
      watermark: state.lastScheduledFire,
      lastFireEnqueued: state.lastFireEnqueued,
      now,
    });

    if (decision.action === 'none') return;

    if (decision.action === 'advance') {
      await this.#store.saveScheduleState({
        jobId: job.id,
        lastScheduledFire: decision.nextWatermark,
        lastFireEnqueued: false,
      });
      return;
    }

    // Enqueue EXACTLY ONE run for the (possibly multi-missed) firing. The
    // crash guard goes down FIRST: a crash from here until ExecuteRun's
    // completion advance leaves guard=true behind, which the next start
    // resolves via the 'advance' path — never a double-enqueue.
    await this.#store.saveScheduleState({
      jobId: job.id,
      lastScheduledFire: state.lastScheduledFire,
      lastFireEnqueued: true,
    });
    this.#queue.push({
      job,
      catchup: decision.catchup,
      nextWatermark: decision.nextWatermark,
      previousWatermark: state.lastScheduledFire,
    });
    this.#log(
      `job ${job.id} due (fire at ${decision.fireAt}${decision.catchup ? ', catch-up' : ''}) — queued serial run`
    );
    void this.#drain();
  }

  /**
   * The serial drain: ONE loop, each run awaited — structurally impossible
   * to execute two runs concurrently. A stop() observed before dequeuing
   * leaves the remaining firings queued for the rollback in stop().
   */
  async #drain(): Promise<void> {
    if (this.#draining) return;
    this.#draining = true;
    try {
      while (this.#queue.length > 0 && !this.#stopped) {
        const fire = this.#queue.shift();
        if (fire === undefined) break;
        this.#currentFire = fire;
        this.#currentRun = this.#executeOne(fire);
        await this.#currentRun;
        this.#currentFire = undefined;
        this.#currentRun = undefined;
      }
    } finally {
      this.#draining = false;
    }
  }

  async #executeOne(fire: QueuedFire): Promise<void> {
    try {
      await this.#executeRun.execute({
        job: fire.job,
        mode: SCHEDULED_RUN_MODE,
        catchup: fire.catchup,
        fire: { nextWatermark: fire.nextWatermark },
      });
    } catch (error) {
      // ExecuteRun records handler failures as failed runs; only store-level
      // crashes reach here. Report and keep draining — the queue lives on.
      this.#report(`run for job ${fire.job.id} crashed: ${describeError(error)}`);
    }
  }

  async #restoreQueuedFires(): Promise<void> {
    for (const fire of this.#queue) {
      try {
        await this.#store.saveScheduleState({
          jobId: fire.job.id,
          lastScheduledFire: fire.previousWatermark,
          lastFireEnqueued: false,
        });
      } catch (error) {
        this.#report(`stop: could not restore schedule state for job ${fire.job.id}: ${describeError(error)}`);
      }
    }
  }

  #report(line: string): void {
    this.#error(line);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
