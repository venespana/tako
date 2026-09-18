// JobStore.ts — PORT interface (application layer owns this, task 3.7)
//
// Durable persistence for jobs, schedule state, and runs (spec
// `agent-jobs#Durable-Job-Persistence`). The v0 adapter is bun:sqlite
// (`SqliteJobStore`, WU4, ADR-0016); tests use in-memory fakes. All shapes
// mirror the design's SQLite schema; timestamps are ISO 8601 strings.
import type { JobDefinition, JobView, RunMode, RunStatus, RunView, Slug } from '../domain/types.js';

/** Per-job scheduler bookkeeping (schedule_state table). */
export interface ScheduleState {
  readonly jobId: Slug;
  /** Catch-up watermark: last cron fire already accounted for (ISO 8601). */
  readonly lastScheduledFire?: string;
  /**
   * Crash guard (D8 window): set true when a firing is enqueued, cleared once
   * the watermark advances — a crash in between must not double-enqueue.
   */
  readonly lastFireEnqueued: boolean;
}

export interface CreateRunInput {
  readonly jobId: Slug;
  readonly mode: RunMode;
  /** True for the missed-once catch-up execution. */
  readonly catchup: boolean;
  readonly startedAt: string;
}

export interface RunPatch {
  readonly status?: RunStatus;
  readonly finishedAt?: string;
  readonly result?: unknown;
}

export interface RunsQuery {
  readonly jobId?: Slug;
  /** Only runs with seq > sinceSeq (reconcile cursor semantics). */
  readonly sinceSeq?: number;
  readonly limit?: number;
}

export interface JobUpsertResult {
  readonly job: JobView;
  /** False when a job with the same id already existed (idempotent identity). */
  readonly created: boolean;
}

/** Port: job/schedule/run persistence. Job ids are the idempotent identity. */
export interface JobStore {
  listJobs(): Promise<JobView[]>;
  getJob(id: Slug): Promise<JobView | undefined>;
  upsertJob(job: JobDefinition): Promise<JobUpsertResult>;
  /** @returns false when no job with that id exists. */
  deleteJob(id: Slug): Promise<boolean>;

  getScheduleState(jobId: Slug): Promise<ScheduleState | undefined>;
  saveScheduleState(state: ScheduleState): Promise<void>;

  /** Persist a new pending run; the store assigns seq (monotonic) and id. */
  createRun(input: CreateRunInput): Promise<RunView>;
  /** Apply a status/result patch; @returns undefined when the run id is unknown. */
  updateRun(runId: string, patch: RunPatch): Promise<RunView | undefined>;
  listRuns(query: RunsQuery): Promise<RunView[]>;
  /** Current reconcile cursor: max run seq, 0 when no runs exist. */
  lastSeq(): Promise<number>;
}
