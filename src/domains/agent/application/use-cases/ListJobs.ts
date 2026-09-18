// ListJobs.ts — use case backing the `jobs.list` protocol request (task 3.10)

import type { JobView } from '../../domain/types.js';
import type { JobStore } from '../JobStore.js';

export class ListJobs {
  constructor(private readonly store: JobStore) {}

  async execute(): Promise<JobView[]> {
    return this.store.listJobs();
  }
}
