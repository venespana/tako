// application/use-cases/UpsertJob.test.ts — STRICT TDD RED phase (tasks 3.10, 3.11)
import { describe, it, expect } from 'vitest';

// RED: import the module that doesn't exist yet
import { UpsertJob } from './UpsertJob.js';
import { JobValidationError } from '../../domain/job.js';
import type { JobDefinition } from '../../domain/types.js';
import { InMemoryJobStore } from '../../testing/InMemoryJobStore.js';

const NAS_PRUNE: JobDefinition = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['stopped-containers'],
  schedule: { kind: 'cron', expr: '0 3 * * *' },
};

describe('UpsertJob — idempotent identity by id (spec agent-jobs#Idempotent-Job-Identity)', () => {
  it('3.11 RED: first submission creates the job', async () => {
    const store = new InMemoryJobStore();
    const result = await new UpsertJob(store).execute(NAS_PRUNE);
    expect(result.created).toBe(true);
    expect(result.job.job.id).toBe('nas-prune');
    expect(await store.listJobs()).toHaveLength(1);
  });

  it('3.11 RED: duplicate nas-prune submit → created false, EXACTLY ONE job with that id remains', async () => {
    const store = new InMemoryJobStore();
    const useCase = new UpsertJob(store);
    await useCase.execute(NAS_PRUNE);
    const second = await useCase.execute({ ...NAS_PRUNE, schedule: { kind: 'cron', expr: '30 4 * * *' } });
    expect(second.created).toBe(false);
    expect(second.job.job.schedule.expr).toBe('30 4 * * *'); // spec updated in place
    const jobs = await store.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.job.id).toBe('nas-prune');
  });

  it('3.11 RED: invalid definition is rejected BEFORE touching the store', async () => {
    const store = new InMemoryJobStore();
    await expect(
      new UpsertJob(store).execute({
        id: 'nas;prune',
        type: 'prune',
        scopes: ['build-cache'],
        schedule: { kind: 'cron', expr: '* * * * *' },
      })
    ).rejects.toThrow(JobValidationError);
    expect(await store.listJobs()).toHaveLength(0);
  });

  it('3.10 RED: server-config stub is a valid upsert target', async () => {
    const store = new InMemoryJobStore();
    const result = await new UpsertJob(store).execute({
      id: 'audit',
      type: 'server-config',
      schedule: { kind: 'cron', expr: '0 5 * * *' },
    });
    expect(result.created).toBe(true);
  });

  it('3.10 RED: upsert keeps an existing job enabled', async () => {
    const store = new InMemoryJobStore();
    const useCase = new UpsertJob(store);
    await useCase.execute(NAS_PRUNE);
    const second = await useCase.execute(NAS_PRUNE);
    expect(second.job.enabled).toBe(true);
  });
});
