// integration/agent/fixtures/store-worker.ts — Bun child-process fixture
//
// The unit/integration vitest projects run on Node (vitest workers), where
// `bun:sqlite` is unresolvable and bunqueue refuses non-Bun runtimes — so the
// REAL BunqueueJobStore is exercised by spawning this fixture with `bun`.
// Each spawn is a genuine fresh process: setup → exit → assert is a true
// agent-restart persistence test (no shutdownManager tricks needed).
//
// Usage: bun store-worker.ts <command> <dbPath> [args...]
//   setup <db>            seed two jobs + one completed run + schedule state
//   assert <db>           reopen and verify everything survived the restart
//   tamper <db> <jobId>   corrupt a job's spec_json directly in SQLite
//   meta-setup <db>       write the seeded agent_meta keys
//   meta-assert <db>      reopen and verify the agent_meta keys
import { randomUUID } from 'node:crypto';

import type { JobDefinition } from '../../../../src/domains/agent/domain/types.js';

const [command, dbPath, arg] = process.argv.slice(2);

const PRUNE_JOB: JobDefinition = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['dangling-images', 'build-cache'],
  schedule: { kind: 'cron', expr: '0 4 * * *' },
};
const STACK_JOB: JobDefinition = {
  id: 'homepage-pull',
  type: 'stack-lifecycle',
  op: 'pull',
  stackDir: '/opt/homepage',
  schedule: { kind: 'cron', expr: '30 3 * * 1' },
};

async function openStore(
  databasePath: string
): Promise<import('../../../../src/domains/agent/application/JobStore.js').JobStore> {
  const { BunqueueJobStore } =
    await import('../../../../src/domains/agent/infrastructure/persistence/BunqueueJobStore.js');
  const store = new BunqueueJobStore({ dataPath: databasePath });
  await store.open();
  return store;
}

async function setup(databasePath: string): Promise<void> {
  const store = await openStore(databasePath);
  await store.upsertJob(PRUNE_JOB);
  await store.upsertJob(STACK_JOB);
  const run = await store.createRun({
    jobId: 'nas-prune',
    mode: 'apply',
    catchup: false,
    startedAt: '2026-01-01T04:00:00.000Z',
  });
  await store.updateRun(run.id, {
    status: 'succeeded',
    finishedAt: '2026-01-01T04:00:05.000Z',
    result: { deleted: 3 },
  });
  await store.saveScheduleState({
    jobId: 'nas-prune',
    lastScheduledFire: '2026-01-01T04:00:00.000Z',
    lastFireEnqueued: false,
  });
  await store.close();
  console.log('SETUP_OK');
}

interface AssertPayload {
  jobs: string[];
  pruneJob: JobDefinition;
  run: { seq: number; status: string; result: unknown; jobId: string } | undefined;
  schedule: { lastScheduledFire?: string; lastFireEnqueued: boolean } | undefined;
  lastSeq: number;
  scheduler: { id: string; skipMissedOnRestart: number } | undefined;
}

async function assertDb(databasePath: string): Promise<void> {
  const store = await openStore(databasePath);
  const jobs = await store.listJobs();
  const pruneJob = await store.getJob('nas-prune');
  const runs = await store.listRuns({});
  const schedule = await store.getScheduleState('nas-prune');
  const lastSeq = await store.lastSeq();
  await store.close();

  // The bunqueue scheduler must exist with skipMissedOnRestart=false — the
  // empirically verified configuration that satisfies run-missed-ONCE.
  const { Database } = await import('bun:sqlite');
  const raw = new Database(databasePath);
  const schedulerRow = raw
    .query('SELECT name, skip_missed_on_restart FROM cron_jobs WHERE name = ?')
    .get('nas-prune') as { name: string; skip_missed_on_restart: number } | undefined;
  raw.close();

  const payload: AssertPayload = {
    jobs: jobs.map(job => job.job.id).sort(),
    pruneJob: pruneJob?.job as JobDefinition,
    run: runs[0]
      ? { seq: runs[0].seq, status: runs[0].status, result: runs[0].result, jobId: runs[0].jobId }
      : undefined,
    schedule: schedule
      ? { lastScheduledFire: schedule.lastScheduledFire, lastFireEnqueued: schedule.lastFireEnqueued }
      : undefined,
    lastSeq,
    scheduler: schedulerRow
      ? { id: schedulerRow.name, skipMissedOnRestart: schedulerRow.skip_missed_on_restart }
      : undefined,
  };
  console.log(JSON.stringify(payload));
}

async function tamper(databasePath: string, jobId: string): Promise<void> {
  const { Database } = await import('bun:sqlite');
  const raw = new Database(databasePath);
  raw.run('UPDATE tako_jobs SET spec_json = \'{"id":"x"\' WHERE id = ?', [jobId]);
  raw.close();
  console.log('TAMPER_OK');
}

async function metaSetup(databasePath: string): Promise<void> {
  const { openAgentMeta } = await import('../../../../src/domains/agent/infrastructure/persistence/agent-meta.js');
  const meta = openAgentMeta(databasePath);
  meta.setLingerEnabledByTako(true);
  meta.setInstalledVersion('0.1.2');
  meta.setInstalledAt(new Date('2026-01-01T00:00:00.000Z').toISOString());
  meta.close();
  console.log('META_SETUP_OK');
}

async function metaAssert(databasePath: string): Promise<void> {
  const { openAgentMeta } = await import('../../../../src/domains/agent/infrastructure/persistence/agent-meta.js');
  const meta = openAgentMeta(databasePath);
  const payload = {
    lingerByTako: meta.getLingerEnabledByTako(),
    installedVersion: meta.getInstalledVersion(),
    installedAt: meta.getInstalledAt(),
    roundtrip: randomUUID().length === 36,
  };
  meta.close();
  console.log(JSON.stringify(payload));
}

try {
  switch (command) {
    case 'setup':
      await setup(dbPath as string);
      break;
    case 'assert':
      await assertDb(dbPath as string);
      break;
    case 'tamper':
      await tamper(dbPath as string, arg as string);
      break;
    case 'meta-setup':
      await metaSetup(dbPath as string);
      break;
    case 'meta-assert':
      await metaAssert(dbPath as string);
      break;
    default:
      console.error(`unknown command: ${command ?? '(none)'}`);
      process.exit(2);
  }
  // Standalone CLI worker: exit deterministically (bunqueue keeps timers).
  process.exit(0);
} catch (error) {
  console.error('WORKER_FAILED:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
