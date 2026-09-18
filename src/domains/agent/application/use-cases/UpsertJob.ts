// UpsertJob.ts — use case backing the `jobs.upsert` protocol request (task 3.10)
//
// Server-side: the socket server (WU4) hands the UNTRUSTED payload here; the
// client (WU8 store) may reuse the same flow over the transport. The domain
// guard runs BEFORE persistence so invalid definitions are rejected, never
// stored or executed (spec re-validation contract). Idempotent by job id.
import { parseJobDefinition } from '../../domain/job.js';
import type { JobDefinition } from '../../domain/types.js';
import type { JobStore, JobUpsertResult } from '../JobStore.js';

export class UpsertJob {
  constructor(private readonly store: JobStore) {}

  /** Validate an untrusted definition and persist it idempotently by id. */
  async execute(value: unknown): Promise<JobUpsertResult> {
    const job: JobDefinition = parseJobDefinition(value);
    return this.store.upsertJob(job);
  }
}
