// GetJobHistory.ts — use case backing the `jobs.history` protocol request (task 3.10)
//
// `lastSeq` is ALWAYS the agent-wide cursor (max run seq) so the client can
// advance its reconcile cursor even when the page was filtered by jobId.
import { assertSlug, JobValidationError } from '../../domain/job.js';
import type { RunView, Slug } from '../../domain/types.js';
import type { JobStore } from '../JobStore.js';

export interface JobHistoryQuery {
  readonly jobId?: string;
  readonly sinceSeq?: number;
  readonly limit?: number;
}

function assertNonNegativeInt(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;

  if (!Number.isInteger(value) || value < 0) {
    throw new JobValidationError(`${name} must be a non-negative integer, got ${JSON.stringify(value)}`);
  }

  return value;
}

export class GetJobHistory {
  constructor(private readonly store: JobStore) {}

  async execute(query: JobHistoryQuery = {}): Promise<{ runs: RunView[]; lastSeq: number }> {
    const jobId = query.jobId !== undefined ? (assertSlug(query.jobId) as Slug) : undefined;
    const sinceSeq = assertNonNegativeInt(query.sinceSeq, 'sinceSeq');
    const limit = assertNonNegativeInt(query.limit, 'limit');
    const runs = await this.store.listRuns({
      ...(jobId !== undefined && { jobId }),
      ...(sinceSeq !== undefined && { sinceSeq }),
      ...(limit !== undefined && { limit }),
    });
    const lastSeq = await this.store.lastSeq();
    return { runs, lastSeq };
  }
}
