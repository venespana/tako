// DeleteJob.ts — use case backing the `jobs.delete` protocol request (task 3.10)
//
// Idempotent: deleting an unknown id answers `false`, never an error. The job
// id is untrusted and is validated at the domain guard first (task 2.9).
import { assertSlug } from '../../domain/job.js';
import type { Slug } from '../../domain/types.js';
import type { JobStore } from '../JobStore.js';

export class DeleteJob {
  constructor(private readonly store: JobStore) {}

  /** @returns true when a job with that id existed and was removed. */
  async execute(jobId: string): Promise<boolean> {
    const id: Slug = assertSlug(jobId);
    return this.store.deleteJob(id);
  }
}
