// pages/tasks/model/job-history.test.ts — STRICT TDD RED phase (tasks 8.7/8.14)
//
// History presentation model: rows are newest-first, every run status has a
// glyph + color the UI can render directly, and result payloads (error,
// lifecycle report, prune report) summarize to one honest line — including
// runs that happened while the client was disconnected (they arrive through
// reconcile and look exactly like any other run).
import { describe, expect, it } from 'vitest';

import type { RunStatus, RunView } from '../../../../domains/agent/domain/types.js';
import { formatRunStatus, summarizeRunResult, toHistoryRows } from './job-history.js';

function run(overrides: Partial<RunView> & { seq: number }): RunView {
  return {
    id: `r${overrides.seq}`,
    jobId: 'nas-prune',
    mode: 'apply',
    status: 'succeeded',
    catchup: false,
    startedAt: '2026-09-18T04:00:00.000Z',
    ...overrides,
  };
}

describe('job history rows (8.7)', () => {
  it('rows are newest first (seq descending) — a disconnected run sorts by seq, not arrival', () => {
    const rows = toHistoryRows([run({ seq: 4 }), run({ seq: 9, status: 'failed' }), run({ seq: 1 })]);
    expect(rows.map(row => row.seq)).toEqual([9, 4, 1]);
  });

  it('every terminal/active status maps to a glyph + color', () => {
    const statuses: RunStatus[] = ['pending', 'running', 'succeeded', 'failed', 'unsupported'];
    const colors = statuses.map(status => formatRunStatus(status).color);
    expect(new Set(colors).size).toBeGreaterThanOrEqual(3);
  });

  it('rows carry mode, status, catchup and the summarized outcome', () => {
    const rows = toHistoryRows([
      run({
        seq: 2,
        mode: 'dry-run',
        catchup: true,
        result: { error: 'compose file missing' },
      }),
    ]);
    expect(rows[0]).toMatchObject({
      seq: 2,
      mode: 'dry-run',
      catchup: true,
      outcome: 'compose file missing',
    });
  });
});

describe('run result summarization (8.7)', () => {
  it('a failed run surfaces its error message', () => {
    expect(summarizeRunResult({ error: 'docker daemon unreachable' })).toBe('docker daemon unreachable');
  });

  it('a lifecycle report summarizes to the compose command that ran (or would run)', () => {
    expect(
      summarizeRunResult({
        mode: 'dry-run',
        op: 'pull',
        stackDir: '/srv/stacks/caddy',
        command: { argv: ['docker', 'compose', 'pull'], cwd: '/srv/stacks/caddy' },
        status: 'planned',
      })
    ).toBe('docker compose pull');
  });

  it('a prune report summarizes to counts across scopes, flagging partial failure', () => {
    const summary = summarizeRunResult({
      mode: 'apply',
      scopes: ['stopped-containers', 'dangling-images'],
      entries: [
        { scope: 'stopped-containers', items: [], count: 2 },
        { scope: 'dangling-images', items: [], count: 3, error: 'socket died' },
      ],
    });
    expect(summary).toContain('5');
    expect(summary).toContain('across 2 scope(s)');
    expect(summary).toContain('partial failure');
  });

  it('missing or unknown results summarize honestly as unavailable', () => {
    expect(summarizeRunResult(undefined)).toBe('—');
    expect(summarizeRunResult('garbage')).toBe('—');
  });
});
