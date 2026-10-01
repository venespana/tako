// ReconcileState.ts — use case backing the `reconcile.sync` protocol request (task 3.10)
//
// Spec `agent-jobs#Reconcile-on-Connect`: on connect the client sends its
// cursor and receives the full job list plus every run NEWER than the cursor
// (seq > lastSeq — sequence numbers, immune to clock skew). The response's
// lastSeq is the agent-wide head the client persists as its next cursor.
import { JobValidationError } from '../../domain/job.js';
import type { JobView, RunView } from '../../domain/types.js';
import type { JobStore } from '../JobStore.js';

export interface ReconcileSnapshot {
  readonly jobs: JobView[];
  readonly runs: RunView[];
  readonly lastSeq: number;
}

export class ReconcileState {
  constructor(private readonly store: JobStore) {}

  async execute(lastSeq: number): Promise<ReconcileSnapshot> {
    if (!Number.isInteger(lastSeq) || lastSeq < 0) {
      throw new JobValidationError(`lastSeq must be a non-negative integer, got ${JSON.stringify(lastSeq)}`);
    }
    const [jobs, runs, head] = await Promise.all([
      this.store.listJobs(),
      this.store.listRuns({ sinceSeq: lastSeq }),
      this.store.lastSeq(),
    ]);
    return { jobs, runs, lastSeq: head };
  }
}
