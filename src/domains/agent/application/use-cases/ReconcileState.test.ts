// application/use-cases/ReconcileState.test.ts — STRICT TDD RED phase (task 3.10)
import { describe, it, expect } from 'vitest';
// RED: import the modules that don't exist yet
import { ReconcileState } from './ReconcileState.js';
import { UpsertJob } from './UpsertJob.js';
import { InMemoryJobStore } from '../../testing/InMemoryJobStore.js';

async function seededStore(): Promise<InMemoryJobStore> {
  const store = new InMemoryJobStore();
  await new UpsertJob(store).execute({ id: 'nas-prune', type: 'prune', scopes: ['build-cache'], schedule: { kind: 'cron', expr: '0 3 * * *' } });
  await store.createRun({ jobId: 'nas-prune', mode: 'apply', catchup: false, startedAt: '2026-09-18T01:00:00.000Z' });
  await store.createRun({ jobId: 'nas-prune', mode: 'apply', catchup: true, startedAt: '2026-09-18T02:00:00.000Z' });
  return store;
}

describe('ReconcileState — spec agent-jobs#Reconcile-on-Connect', () => {
  it('3.10 RED: cursor 0 → full resync (all jobs, all runs, current lastSeq)', async () => {
    const store = await seededStore();
    const state = await new ReconcileState(store).execute(0);
    expect(state.jobs).toHaveLength(1);
    expect(state.runs).toHaveLength(2);
    expect(state.lastSeq).toBe(2);
  });

  it('3.10 RED: runs newer than the cursor only (seq > lastSeq)', async () => {
    const store = await seededStore();
    const state = await new ReconcileState(store).execute(1);
    expect(state.runs.map((run) => run.seq)).toEqual([2]);
    expect(state.jobs).toHaveLength(1); // jobs always delivered in full
    expect(state.lastSeq).toBe(2);
  });

  it('3.10 RED: cursor at the head → jobs yes, runs empty, cursor unchanged', async () => {
    const store = await seededStore();
    const state = await new ReconcileState(store).execute(2);
    expect(state.jobs).toHaveLength(1);
    expect(state.runs).toEqual([]);
    expect(state.lastSeq).toBe(2);
  });

  it('3.10 RED: empty agent → empty everything with cursor 0', async () => {
    const state = await new ReconcileState(new InMemoryJobStore()).execute(0);
    expect(state.jobs).toEqual([]);
    expect(state.runs).toEqual([]);
    expect(state.lastSeq).toBe(0);
  });
});
