// application/use-cases/ListJobs.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect } from 'vitest';

// RED: import the modules that don't exist yet
import { ListJobs } from './ListJobs.js';
import { UpsertJob } from './UpsertJob.js';
import { InMemoryJobStore } from '../../testing/InMemoryJobStore.js';

describe('ListJobs', () => {
  it('3.10 RED: returns every stored job as JobView', async () => {
    const store = new InMemoryJobStore();
    const upsert = new UpsertJob(store);
    await upsert.execute({
      id: 'nas-prune',
      type: 'prune',
      scopes: ['build-cache'],
      schedule: { kind: 'cron', expr: '0 3 * * *' },
    });
    await upsert.execute({
      id: 'web-up',
      type: 'stack-lifecycle',
      op: 'up',
      stackDir: '/opt/web',
      schedule: { kind: 'cron', expr: '* * * * *' },
    });

    const jobs = await new ListJobs(store).execute();

    expect(jobs.map(job => job.job.id).sort()).toEqual(['nas-prune', 'web-up']);
    expect(jobs[0]?.enabled).toBe(true);
    expect(typeof jobs[0]?.createdAt).toBe('string');
  });

  it('3.10 RED: empty store → empty list', async () => {
    expect(await new ListJobs(new InMemoryJobStore()).execute()).toEqual([]);
  });
});
