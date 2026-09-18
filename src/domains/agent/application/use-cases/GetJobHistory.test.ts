// application/use-cases/GetJobHistory.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect } from 'vitest';
// RED: import the module that doesn't exist yet
import { GetJobHistory } from './GetJobHistory.js';
import { InMemoryJobStore } from '../../testing/InMemoryJobStore.js';
import { JobValidationError } from '../../domain/job.js';

async function seedThreeRuns(store: InMemoryJobStore): Promise<void> {
  await store.createRun({ jobId: 'nas-prune', mode: 'apply', catchup: false, startedAt: '2026-09-18T01:00:00.000Z' });
  await store.createRun({ jobId: 'nas-prune', mode: 'apply', catchup: false, startedAt: '2026-09-18T02:00:00.000Z' });
  await store.createRun({ jobId: 'web-up', mode: 'dry-run', catchup: false, startedAt: '2026-09-18T03:00:00.000Z' });
}

describe('GetJobHistory', () => {
  it('3.10 RED: returns runs with the agent-wide lastSeq cursor', async () => {
    const store = new InMemoryJobStore();
    await seedThreeRuns(store);
    const { runs, lastSeq } = await new GetJobHistory(store).execute({});
    expect(runs).toHaveLength(3);
    expect(lastSeq).toBe(3); // agent max, even without filters
  });

  it('3.10 RED: jobId filter narrows runs but lastSeq stays the agent-wide cursor', async () => {
    const store = new InMemoryJobStore();
    await seedThreeRuns(store);
    const { runs, lastSeq } = await new GetJobHistory(store).execute({ jobId: 'nas-prune' });
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.jobId === 'nas-prune')).toBe(true);
    expect(lastSeq).toBe(3);
  });

  it('3.10 RED: sinceSeq excludes up-to-and-including cursor (seq > sinceSeq)', async () => {
    const store = new InMemoryJobStore();
    await seedThreeRuns(store);
    const { runs } = await new GetJobHistory(store).execute({ sinceSeq: 2 });
    expect(runs.map((run) => run.seq)).toEqual([3]);
  });

  it('3.10 RED: limit caps the result (newest-first page, oldest runs dropped)', async () => {
    const store = new InMemoryJobStore();
    await seedThreeRuns(store);
    const { runs } = await new GetJobHistory(store).execute({ limit: 2 });
    expect(runs.map((run) => run.seq)).toEqual([1, 2]);
  });

  it('3.12 RED: hostile jobId is rejected, never passed through to persistence', async () => {
    const store = new InMemoryJobStore();
    await expect(new GetJobHistory(store).execute({ jobId: 'x;drop' })).rejects.toThrow(JobValidationError);
  });
});
