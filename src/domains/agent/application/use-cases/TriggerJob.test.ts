// application/use-cases/TriggerJob.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect } from 'vitest';
// RED: import the modules that don't exist yet
import { TriggerJob, JobNotFoundError } from './TriggerJob.js';
import { InMemoryJobStore } from '../../testing/InMemoryJobStore.js';
import { JobValidationError } from '../../domain/job.js';
import type { Clock } from '../Clock.js';

const PRUNE_JOB = {
  id: 'nas-prune',
  type: 'prune' as const,
  scopes: ['build-cache' as const],
  schedule: { kind: 'cron' as const, expr: '0 3 * * *' },
};

const FIXED_CLOCK: Clock = { now: () => new Date('2026-09-18T12:00:00.000Z') };

describe('TriggerJob', () => {
  it('3.10 RED: creates a pending run in the requested mode with clock timestamp', async () => {
    const store = new InMemoryJobStore();
    await store.upsertJob(PRUNE_JOB);
    const run = await new TriggerJob(store, FIXED_CLOCK).execute('nas-prune', 'dry-run');
    expect(run.status).toBe('pending');
    expect(run.mode).toBe('dry-run');
    expect(run.catchup).toBe(false);
    expect(run.startedAt).toBe('2026-09-18T12:00:00.000Z');
    expect(run.seq).toBeGreaterThan(0);
  });

  it('3.10 RED: triggered run is persisted and discoverable via history', async () => {
    const store = new InMemoryJobStore();
    await store.upsertJob(PRUNE_JOB);
    const run = await new TriggerJob(store, FIXED_CLOCK).execute('nas-prune', 'apply');
    expect(await store.listRuns({ jobId: 'nas-prune' })).toEqual([run]);
  });

  it('3.10 RED: unknown job id → JobNotFoundError, no run created', async () => {
    const store = new InMemoryJobStore();
    await expect(new TriggerJob(store, FIXED_CLOCK).execute('ghost', 'apply')).rejects.toThrow(JobNotFoundError);
    expect(await store.lastSeq()).toBe(0);
  });

  it('3.12 RED: hostile job id rejected at the domain guard', async () => {
    const store = new InMemoryJobStore();
    await expect(new TriggerJob(store, FIXED_CLOCK).execute('nas;prune', 'apply')).rejects.toThrow(JobValidationError);
  });

  it('3.10 RED: mode outside dry-run|apply is rejected', async () => {
    const store = new InMemoryJobStore();
    await store.upsertJob(PRUNE_JOB);
    await expect(new TriggerJob(store, FIXED_CLOCK).execute('nas-prune', 'destroy' as 'apply')).rejects.toThrow(
      JobValidationError,
    );
  });
});
