// TriggerJob.ts — use case backing the `jobs.trigger` protocol request (task 3.10)
//
// Creates the pending run; execution itself is ExecuteRun's job (WU7) driven
// by the JobHandler port. Manual triggers are never catch-up runs.
import { assertSlug, JobValidationError } from '../../domain/job.js';
import type { RunMode, RunView, Slug } from '../../domain/types.js';
import type { Clock } from '../Clock.js';
import type { JobStore } from '../JobStore.js';

/** Thrown when a trigger references a job id that does not exist. */
export class JobNotFoundError extends Error {
  readonly jobId: Slug;

  constructor(jobId: Slug) {
    super(`job not found: ${jobId}`);
    this.name = 'JobNotFoundError';
    this.jobId = jobId;
  }
}

function isRunMode(value: unknown): value is RunMode {
  return value === 'dry-run' || value === 'apply';
}

export class TriggerJob {
  constructor(
    private readonly store: JobStore,
    private readonly clock: Clock
  ) {}

  /** Validate id and mode, require the job to exist, persist a pending run. */
  async execute(jobId: string, mode: RunMode): Promise<RunView> {
    const id: Slug = assertSlug(jobId);
    if (!isRunMode(mode)) {
      throw new JobValidationError(`mode must be 'dry-run' or 'apply', got ${JSON.stringify(mode)}`);
    }
    const job = await this.store.getJob(id);
    if (!job) throw new JobNotFoundError(id);
    return this.store.createRun({ jobId: id, mode, catchup: false, startedAt: this.clock.now().toISOString() });
  }
}
