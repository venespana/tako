// application/use-cases/DeleteJob.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect } from 'vitest';

// RED: import the module that doesn't exist yet
import { DeleteJob } from './DeleteJob.js';
import { JobValidationError } from '../../domain/job.js';
import { InMemoryJobStore } from '../../testing/InMemoryJobStore.js';

const PRUNE_JOB = {
  id: 'nas-prune',
  type: 'prune' as const,
  scopes: ['build-cache' as const],
  schedule: { kind: 'cron' as const, expr: '0 3 * * *' },
};

describe('DeleteJob', () => {
  it('3.10 RED: deleting an existing job returns true and removes it', async () => {
    const store = new InMemoryJobStore();
    await store.upsertJob(PRUNE_JOB);
    const deleted = await new DeleteJob(store).execute('nas-prune');
    expect(deleted).toBe(true);
    expect(await store.listJobs()).toHaveLength(0);
  });

  it('3.10 RED: deleting an unknown job returns false (idempotent delete)', async () => {
    const store = new InMemoryJobStore();
    expect(await new DeleteJob(store).execute('nope')).toBe(false);
  });

  it('3.12 RED: hostile job id is rejected at the guard before the store is consulted', async () => {
    const store = new InMemoryJobStore();
    await expect(new DeleteJob(store).execute('nas;prune')).rejects.toThrow(JobValidationError);
    await expect(new DeleteJob(store).execute('$(x)')).rejects.toThrow(JobValidationError);
  });
});
