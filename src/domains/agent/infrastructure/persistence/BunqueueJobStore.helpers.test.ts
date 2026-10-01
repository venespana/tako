// infrastructure/persistence/BunqueueJobStore.helpers.test.ts — unit layer
//
// The DB-coupled paths run under real Bun via the integration fixture
// (vitest workers are Node — bun:sqlite unresolvable, bunqueue refuses
// non-Bun), so the unit layer pins the PURE mapping contracts: persisted
// spec_json re-validation (invalid rows are rejected, never served) and
// runs-mirror row → RunView conversion.
import { describe, expect, it } from 'vitest';

import type { JobRow, RunRow } from './store-mapping.js';
import { parseJobRow, runViewFromRow } from './store-mapping.js';

const VALID_SPEC = {
  id: 'nas-prune',
  type: 'prune',
  scopes: ['dangling-images'],
  schedule: { kind: 'cron', expr: '0 4 * * *' },
};

function jobRow(specJson: string): JobRow {
  return {
    id: 'nas-prune',
    type: 'prune',
    spec_json: specJson,
    enabled: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('BunqueueJobStore — persisted definition re-validation', () => {
  it('maps a valid persisted row back to a JobView', () => {
    const view = parseJobRow(jobRow(JSON.stringify(VALID_SPEC)));
    expect(view).toEqual({
      job: VALID_SPEC,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('rejects a tampered spec_json (invalid → undefined, never served)', () => {
    expect(parseJobRow(jobRow('{"id":"x"'))).toBeUndefined();
  });

  it('rejects a valid-JSON row whose definition violates the domain guards', () => {
    const hostile = JSON.stringify({
      id: 'bad;id',
      type: 'prune',
      scopes: ['dangling-images'],
      schedule: { kind: 'cron', expr: '0 4 * * *' },
    });
    expect(parseJobRow(jobRow(hostile))).toBeUndefined();
  });

  it('rejects forbidden prune scopes on the load path (structural, ADR-0008)', () => {
    const volumePrune = JSON.stringify({
      id: 'nas-prune',
      type: 'prune',
      scopes: ['volumes'],
      schedule: { kind: 'cron', expr: '0 4 * * *' },
    });
    expect(parseJobRow(jobRow(volumePrune))).toBeUndefined();
  });
});

describe('BunqueueJobStore — runs-mirror row mapping', () => {
  it('converts a finished run row to the protocol RunView', () => {
    const row: RunRow = {
      seq: 7,
      id: 'run-7',
      job_id: 'nas-prune',
      mode: 'apply',
      status: 'succeeded',
      catchup: 1,
      started_at: '2026-01-01T04:00:00.000Z',
      finished_at: '2026-01-01T04:00:05.000Z',
      result_json: '{"deleted":3}',
    };
    expect(runViewFromRow(row)).toEqual({
      seq: 7,
      id: 'run-7',
      jobId: 'nas-prune',
      mode: 'apply',
      status: 'succeeded',
      catchup: true,
      startedAt: '2026-01-01T04:00:00.000Z',
      finishedAt: '2026-01-01T04:00:05.000Z',
      result: { deleted: 3 },
    });
  });

  it('omits finishedAt/result when the row has none (pending run)', () => {
    const row: RunRow = {
      seq: 1,
      id: 'run-1',
      job_id: 'nas-prune',
      mode: 'dry-run',
      status: 'pending',
      catchup: 0,
      started_at: '2026-01-01T04:00:00.000Z',
      finished_at: null,
      result_json: null,
    };
    const view = runViewFromRow(row);
    expect(view.finishedAt).toBeUndefined();
    expect(view.result).toBeUndefined();
    expect(view.catchup).toBe(false);
  });

  it('degrades a corrupted result_json to an explicit error result (tamper-tolerant load)', () => {
    const row: RunRow = {
      seq: 9,
      id: 'run-9',
      job_id: 'nas-prune',
      mode: 'apply',
      status: 'succeeded',
      catchup: 0,
      started_at: '2026-01-01T04:00:00.000Z',
      finished_at: '2026-01-01T04:00:05.000Z',
      result_json: '{"deleted":3', // truncated / tampered JSON
    };
    const view = runViewFromRow(row);
    expect(view.result).toEqual({ error: 'corrupted result record (unparseable result_json)' });
  });
});
