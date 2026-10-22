// ExecuteRun.ts — execute one run through the state machine (task 7.2)
//
// Engine-side use case: takes a job definition + mode, drives
// pending → running → terminal through the WU3 pure transition guard
// (domain/run.ts), calls the JobHandler port, and records the outcome
// (result + finishedAt). When the run accounts for a scheduled fire, it
// advances the catch-up watermark and clears the last_fire_enqueued crash
// guard — ON FAILURE TOO: the firing is accounted for exactly once whatever
// the outcome (spec `agent-jobs#Missed-Runs-Execute-Once`).
//
// Handler throws (composition-root validation errors, watchdog timeouts,
// adapter crashes) are RECORDED as failed runs with an { error } result —
// never silently swallowed, never left pending. Illegal transitions
// (store corruption) are thrown loudly by the WU3 guard; the watermark
// still advances in the finally block so the firing cannot re-enqueue.
//
// Dry-run mutates nothing: that is the JobHandler implementation's contract
// (RunStackLifecycle / RunPrune never touch their ports in dry-run mode);
// this use case only passes the mode through and records the report.
import type { Clock } from './Clock.js';
import type { JobExecutionOutcome, JobHandler } from './JobHandler.js';
import type { JobStore } from './JobStore.js';
import type { JobStateChangedPayload, RunCompletedPayload } from '../domain/protocol.js';
import { transitionRun } from '../domain/run.js';
import type { JobDefinition, RunMode, RunStatus, RunView } from '../domain/types.js';

/** Push events the composition root forwards to connected clients. */
export type RunEngineEvent =
  | { readonly type: 'job.state_changed'; readonly payload: JobStateChangedPayload }
  | { readonly type: 'run.completed'; readonly payload: RunCompletedPayload };

/** Present when this run accounts for one scheduled cron firing. */
export interface ScheduledFireContext {
  /** ISO instant the schedule_state watermark advances to once the run settles. */
  readonly nextWatermark: string;
}

export interface ExecuteRunInput {
  readonly job: JobDefinition;
  readonly mode: RunMode;
  /** True for the missed-once catch-up execution. */
  readonly catchup: boolean;
  /**
   * Pre-created pending run (task 8.0, triggered executions): when present,
   * THIS run is driven instead of creating a new one — the run the trigger
   * response returned is the run that executes. Scheduled fires omit it.
   */
  readonly run?: RunView;
  readonly fire?: ScheduledFireContext;
}

export interface ExecuteRunOptions {
  readonly store: JobStore;
  readonly clock: Clock;
  readonly handler: JobHandler;
  /** Optional event sink; the agent-run composition root broadcasts to clients. */
  readonly onEvent?: (event: RunEngineEvent) => void;
}

export class ExecuteRun {
  readonly #options: ExecuteRunOptions;

  constructor(options: ExecuteRunOptions) {
    this.#options = options;
  }

  /** Execute one run and return the final view; a started run always reaches a terminal status. */
  async execute(input: ExecuteRunInput): Promise<RunView> {
    const { store, clock, handler } = this.#options;
    const { job, mode, catchup } = input;

    let run =
      input.run ?? (await store.createRun({ jobId: job.id, mode, catchup, startedAt: clock.now().toISOString() }));

    try {
      run = await this.#transition(run, 'running');
      let outcome: JobExecutionOutcome;

      try {
        outcome = await handler.execute(job, mode);
      } catch (error) {
        outcome = { status: 'failed', result: { error: describeError(error) } };
      }

      const finishedAt = clock.now().toISOString();
      run = await this.#finish(run, outcome, finishedAt);
    } finally {
      if (input.fire !== undefined) {
        await store.saveScheduleState({
          jobId: job.id,
          lastScheduledFire: input.fire.nextWatermark,
          lastFireEnqueued: false,
        });
      }
    }

    return run;
  }

  async #transition(run: RunView, to: RunStatus): Promise<RunView> {
    const from = run.status;
    transitionRun(from, to);
    const updated = await this.#options.store.updateRun(run.id, { status: to });

    if (updated === undefined) {
      throw new Error(`run ${run.id} vanished while transitioning ${from} → ${to}`);
    }

    this.#emit({
      type: 'job.state_changed',
      payload: {
        jobId: run.jobId,
        runId: run.id,
        from,
        to,
        at: this.#options.clock.now().toISOString(),
      },
    });
    return updated;
  }

  async #finish(run: RunView, outcome: JobExecutionOutcome, finishedAt: string): Promise<RunView> {
    const from = run.status;
    const to: RunStatus = outcome.status;
    transitionRun(from, to);
    const updated = await this.#options.store.updateRun(run.id, {
      status: to,
      finishedAt,
      ...(outcome.result !== undefined && { result: outcome.result }),
    });

    if (updated === undefined) {
      throw new Error(`run ${run.id} vanished while finishing as ${to}`);
    }

    this.#emit({
      type: 'job.state_changed',
      payload: { jobId: run.jobId, runId: run.id, from, to, at: finishedAt },
    });
    this.#emit({
      type: 'run.completed',
      payload: {
        jobId: run.jobId,
        runId: run.id,
        status: outcome.status,
        ...(outcome.result !== undefined && { result: outcome.result }),
      },
    });
    return updated;
  }

  #emit(event: RunEngineEvent): void {
    this.#options.onEvent?.(event);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
