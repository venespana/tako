// persistence/BunqueueJobStore.ts — JobStore port adapter over bunqueue embedded (task 4.2)
//
// VERIFIED FINDING — bunqueue's missed-cron-fire semantics (bunqueue 2.9.5,
// verified empirically with separate-process restarts against a temp
// dataPath, plus source reading of
// infrastructure/scheduler/cron/{runtime,execution}.js):
//
//   1. Default `skipMissedOnRestart: true`: on load, a scheduler whose
//      persisted next_run is in the past is silently re-anchored to the next
//      FUTURE occurrence — N missed firings produce 0 runs. That violates
//      spec `agent-jobs#Missed-Runs-Execute-Once` (exactly once).
//   2. `skipMissedOnRestart: false`: the past-due next_run survives the
//      restart and the first tick fires EXACTLY ONE job, then recomputes
//      next_run from now (cron) or collapses the remaining slots via the
//      preventOverlap/overlap guard (interval). Verified: 5 missed cron
//      occurrences → 1 firing; 5 missed interval slots → 1 firing. Bunqueue
//      never re-fires missed occurrences more than once.
//   3. Source nuance: the tick persists the advanced next_run BEFORE pushing
//      the spawned job, so a crash inside that window loses the firing
//      (at-most-once). The Tako watermark protocol
//      (schedule_state.last_fire_enqueued, RunSchedulerLoop WU7) stays on top
//      as the safety net for that window, per design D3.
//
// CONFIGURATION: every scheduler is created with skipMissedOnRestart: false,
// matching the spec's run-missed-ONCE policy natively.
//
// WHY TAKO ALSO OWNS THIN TABLES: bunqueue's public scheduler API does not
// round-trip the scheduler template payload or timestamps (SchedulerInfo is
// {id, name, next, pattern, every, limit}), and its job history has no
// monotonic numeric cursor (reconcile needs `seq`/`sinceSeq`/`lastSeq`).
// Per the design §SQLite Schema amendment, Tako therefore keeps the thin
// `tako_jobs` / `tako_schedule_state` / `tako_runs` tables — in the SAME
// dataPath file — for definitions, watermark/crash-guard, and the runs
// mirror; bunqueue owns cron firing and its own schema. The tako_ prefix is
// REQUIRED, not cosmetic: bunqueue's schema ships its own `jobs` table, and
// sharing the file with an unprefixed `jobs` breaks bunqueue's migrations
// (verified: 'no such column: queue' during its step-1 migration). Persisted definitions are re-validated by
// the domain guards on every load; invalid rows are rejected, never served
// or executed.
//
// bun:sqlite + bunqueue are scoped to persistence/** (ADR-0016): consumers
// MUST reach this module via lazy import() (agent-mode composition root).
import { randomUUID } from 'node:crypto';

import { Database } from 'bun:sqlite';
import { Queue } from 'bunqueue/client';

import { parseJobRow, runViewFromRow, type JobRow, type RunRow, type ScheduleRow } from './store-mapping.js';
import type {
  CreateRunInput,
  JobStore,
  JobUpsertResult,
  RunPatch,
  RunsQuery,
  ScheduleState,
} from '../../application/JobStore.js';
import type { JobDefinition, JobView, RunView, Slug } from '../../domain/types.js';

export const DEFAULT_QUEUE_NAME = 'tako-agent';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tako_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('stack-lifecycle','prune','server-config')),
  spec_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tako_schedule_state (
  job_id TEXT PRIMARY KEY REFERENCES tako_jobs(id) ON DELETE CASCADE,
  last_scheduled_fire TEXT,
  last_fire_enqueued INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tako_runs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES tako_jobs(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('dry-run','apply')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed','unsupported')),
  catchup INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  result_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_tako_runs_job ON tako_runs(job_id, seq);
`;

export interface BunqueueJobStoreOptions {
  /** Absolute path of the shared agent database (~/.tako/agent.db). */
  readonly dataPath: string;
  /** bunqueue queue name; schedulers live inside it keyed by job Slug. */
  readonly queueName?: string;
}

export class BunqueueJobStore implements JobStore {
  readonly #dataPath: string;
  readonly #queueName: string;
  #database?: Database;
  #queue?: Queue<unknown>;
  #opened = false;

  constructor(options: BunqueueJobStoreOptions) {
    this.#dataPath = options.dataPath;
    this.#queueName = options.queueName ?? DEFAULT_QUEUE_NAME;
  }

  /**
   * Open both stores: create/upgrade Tako's thin tables and construct the
   * embedded bunqueue queue (its own schema lives in the same file).
   */
  async open(): Promise<void> {
    if (this.#opened) return;
    this.#database = new Database(this.#dataPath);
    this.#database.run('PRAGMA journal_mode = WAL');
    this.#database.run('PRAGMA busy_timeout = 5000');
    this.#database.run('PRAGMA foreign_keys = ON');
    this.#database.exec(SCHEMA_SQL);
    // Lazy construction: the module import is the ADR-0016 gate; the queue
    // binds to the same dataPath (embedded mode, Bun-only).
    this.#queue = new Queue(this.#queueName, { embedded: true, dataPath: this.#dataPath });
    this.#opened = true;
  }

  async close(): Promise<void> {
    if (!this.#opened) return;
    await this.#queue?.close();
    // The embedded cron runtime holds a safety-interval timer that would
    // otherwise keep the agent process alive after close; shut the shared
    // manager down (the agent process owns exactly one dataPath).
    const { shutdownManager } = await import('bunqueue/client');
    shutdownManager();
    this.#database?.close();
    this.#database = undefined;
    this.#queue = undefined;
    this.#opened = false;
  }

  async listJobs(): Promise<JobView[]> {
    const rows = this.#requireDb()
      .query('SELECT * FROM tako_jobs ORDER BY created_at, id')
      .all() as unknown as JobRow[];
    const views: JobView[] = [];
    for (const row of rows) {
      const view = parseJobRow(row);
      if (view) views.push(view);
    }
    return views;
  }

  async getJob(id: Slug): Promise<JobView | undefined> {
    const row = this.#requireDb().query('SELECT * FROM tako_jobs WHERE id = ?').get(id) as unknown as
      JobRow | undefined;
    return row ? parseJobRow(row) : undefined;
  }

  async upsertJob(job: JobDefinition): Promise<JobUpsertResult> {
    const db = this.#requireDb();
    const specJson = JSON.stringify(job);
    const existing = db.query('SELECT created_at FROM tako_jobs WHERE id = ?').get(job.id) as
      { created_at: string } | undefined;
    if (existing) {
      db.run('UPDATE tako_jobs SET type = ?, spec_json = ?, updated_at = ? WHERE id = ?', [
        job.type,
        specJson,
        new Date().toISOString(),
        job.id,
      ]);
    } else {
      const now = new Date().toISOString();
      db.run('INSERT INTO tako_jobs (id, type, spec_json, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)', [
        job.id,
        job.type,
        specJson,
        now,
        now,
      ]);
    }
    // Mirror the schedule into bunqueue: the scheduler id IS the job Slug
    // (idempotent upsert). skipMissedOnRestart: false — see the verified
    // finding in the module header. The template payload carries the
    // definition so the WU7 Worker can execute it straight from job.data.
    await this.#queue!.upsertJobScheduler(
      job.id,
      { pattern: job.schedule.expr, skipMissedOnRestart: false },
      { name: job.id, data: job }
    );
    const view = await this.getJob(job.id);
    if (!view) throw new Error(`upsertJob: job ${job.id} vanished after write`);
    return { job: view, created: existing === undefined };
  }

  async deleteJob(id: Slug): Promise<boolean> {
    const db = this.#requireDb();
    const removed = db.run('DELETE FROM tako_jobs WHERE id = ?', [id]);
    // FK cascade clears schedule_state + runs; the bunqueue scheduler goes too.
    await this.#queue!.removeJobScheduler(id);
    return Number(removed.changes) > 0;
  }

  async getScheduleState(jobId: Slug): Promise<ScheduleState | undefined> {
    const row = this.#requireDb().query('SELECT * FROM tako_schedule_state WHERE job_id = ?').get(jobId) as unknown as
      ScheduleRow | undefined;
    if (!row) return undefined;
    return {
      jobId: row.job_id,
      ...(row.last_scheduled_fire !== null && { lastScheduledFire: row.last_scheduled_fire }),
      lastFireEnqueued: row.last_fire_enqueued === 1,
    };
  }

  async saveScheduleState(state: ScheduleState): Promise<void> {
    this.#requireDb().run(
      `INSERT INTO tako_schedule_state (job_id, last_scheduled_fire, last_fire_enqueued)
         VALUES (?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           last_scheduled_fire = excluded.last_scheduled_fire,
           last_fire_enqueued = excluded.last_fire_enqueued`,
      [state.jobId, state.lastScheduledFire ?? null, state.lastFireEnqueued ? 1 : 0]
    );
  }

  async createRun(input: CreateRunInput): Promise<RunView> {
    const db = this.#requireDb();
    const id = randomUUID();
    db.run('INSERT INTO tako_runs (id, job_id, mode, status, catchup, started_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      input.jobId,
      input.mode,
      'pending',
      input.catchup ? 1 : 0,
      input.startedAt,
    ]);
    const row = db.query('SELECT * FROM tako_runs WHERE id = ?').get(id) as unknown as RunRow;
    return runViewFromRow(row);
  }

  async updateRun(runId: string, patch: RunPatch): Promise<RunView | undefined> {
    const db = this.#requireDb();
    const current = db.query('SELECT * FROM tako_runs WHERE id = ?').get(runId) as unknown as RunRow | undefined;
    if (!current) return undefined;
    const status = patch.status ?? current.status;
    const finishedAt = patch.finishedAt ?? current.finished_at;
    const resultJson = patch.result !== undefined ? JSON.stringify(patch.result) : current.result_json;
    db.run('UPDATE tako_runs SET status = ?, finished_at = ?, result_json = ? WHERE id = ?', [
      status,
      finishedAt,
      resultJson,
      runId,
    ]);
    const row = db.query('SELECT * FROM tako_runs WHERE id = ?').get(runId) as unknown as RunRow;
    return runViewFromRow(row);
  }

  async listRuns(query: RunsQuery = {}): Promise<RunView[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (query.jobId !== undefined) {
      conditions.push('job_id = ?');
      params.push(query.jobId);
    }
    if (query.sinceSeq !== undefined) {
      conditions.push('seq > ?');
      params.push(query.sinceSeq);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit !== undefined ? ` LIMIT ${Math.floor(query.limit)}` : '';
    const rows = this.#requireDb()
      .query(`SELECT * FROM tako_runs${where} ORDER BY seq ASC${limit}`)
      .all(...params) as unknown as RunRow[];
    return rows.map(runViewFromRow);
  }

  async lastSeq(): Promise<number> {
    const row = this.#requireDb().query('SELECT COALESCE(MAX(seq), 0) AS head FROM tako_runs').get() as {
      head: number;
    };
    return row.head;
  }

  #requireDb(): Database {
    if (!this.#database || !this.#opened) {
      throw new Error('BunqueueJobStore is not open — call open() first (agent-mode composition root)');
    }
    return this.#database;
  }
}
