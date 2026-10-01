// persistence/store-mapping.ts — PURE mapping helpers for the BunqueueJobStore
//
// Kept free of bun:sqlite/bunqueue imports so the unit layer (vitest, Node)
// can pin the mapping contracts directly: persisted spec_json re-validation
// (invalid rows are rejected, never served or executed) and the
// runs-mirror → RunView conversion.
import { parseJobDefinition } from '../../domain/job.js';
import type { JobDefinition, JobView, RunStatus, RunView } from '../../domain/types.js';

export interface JobRow {
  id: string;
  type: string;
  spec_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface RunRow {
  seq: number;
  id: string;
  job_id: string;
  mode: string;
  status: string;
  catchup: number;
  started_at: string;
  finished_at: string | null;
  result_json: string | null;
}

export interface ScheduleRow {
  job_id: string;
  last_scheduled_fire: string | null;
  last_fire_enqueued: number;
}

/** Map a persisted (and therefore potentially tampered) job row to a view. Invalid → undefined. */
export function parseJobRow(row: JobRow): JobView | undefined {
  try {
    const job: JobDefinition = parseJobDefinition(JSON.parse(row.spec_json));
    return { job, enabled: row.enabled === 1, createdAt: row.created_at, updatedAt: row.updated_at };
  } catch {
    return undefined;
  }
}

/** Map a runs-mirror row to the protocol RunView.
 *
 * Tamper-tolerant: a corrupted `result_json` (manual DB edit, partial write)
 * must never crash a history/reconcile load — it degrades to an explicit
 * error result instead of throwing or fabricating a report.
 */
export function runViewFromRow(row: RunRow): RunView {
  let result: unknown;
  if (row.result_json !== null) {
    try {
      result = JSON.parse(row.result_json) as unknown;
    } catch {
      result = { error: 'corrupted result record (unparseable result_json)' };
    }
  }
  return {
    seq: row.seq,
    id: row.id,
    jobId: row.job_id,
    mode: row.mode as RunView['mode'],
    status: row.status as RunStatus,
    catchup: row.catchup === 1,
    startedAt: row.started_at,
    ...(row.finished_at !== null && { finishedAt: row.finished_at }),
    ...(row.result_json !== null && { result }),
  };
}
