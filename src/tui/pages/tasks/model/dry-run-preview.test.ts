// pages/tasks/model/dry-run-preview.test.ts — STRICT TDD RED phase (tasks 8.9/8.14)
//
// Dry-run preview model: a dry-run's recorded report renders as a readable
// summary. The model NEVER applies anything — it only describes; applying is
// a separate explicit user action wired by the page (spec
// tui-tasks#Dry-Run-Preview: "nothing is removed until the user explicitly
// applies").
import { describe, expect, it } from 'vitest';

import type { RunView } from '../../../../domains/agent/domain/types.js';
import { summarizeDryRun } from './dry-run-preview.js';

function dryRun(result: unknown): RunView {
  return {
    seq: 1,
    id: 'r1',
    jobId: 'nas-prune',
    mode: 'dry-run',
    status: 'succeeded',
    catchup: false,
    startedAt: '2026-09-18T04:00:00.000Z',
    finishedAt: '2026-09-18T04:00:05.000Z',
    result,
  };
}

describe('dry-run preview summaries (8.9)', () => {
  it('a lifecycle dry-run headline shows the exact compose command that WOULD run', () => {
    const summary = summarizeDryRun(
      dryRun({
        mode: 'dry-run',
        op: 'pull',
        stackDir: '/srv/stacks/caddy',
        command: { argv: ['docker', 'compose', 'pull'], cwd: '/srv/stacks/caddy' },
        status: 'planned',
      })
    );
    expect(summary.headline).toContain('docker compose pull');
    expect(summary.lines.join('\n')).toContain('/srv/stacks/caddy');
    expect(summary.lines.join('\n').toLowerCase()).toContain('would');
  });

  it('a prune dry-run lists what WOULD be removed per scope', () => {
    const summary = summarizeDryRun(
      dryRun({
        mode: 'dry-run',
        scopes: ['dangling-images', 'build-cache'],
        entries: [
          { scope: 'dangling-images', count: 2, items: [{ id: 'sha256:aa', description: 'nginx:old' }] },
          { scope: 'build-cache', count: 1, items: [{ id: 'cache-x', description: 'buildkit layers' }] },
        ],
      })
    );
    expect(summary.headline).toContain('3');
    expect(summary.lines.some(line => line.includes('dangling-images'))).toBe(true);
    expect(summary.lines.some(line => line.includes('nginx:old'))).toBe(true);
    expect(summary.lines.some(line => line.includes('build-cache'))).toBe(true);
  });

  it('space reclamation is surfaced when docker reported it', () => {
    const summary = summarizeDryRun(
      dryRun({
        mode: 'dry-run',
        scopes: ['build-cache'],
        entries: [{ scope: 'build-cache', count: 4, items: [], spaceReclaimedBytes: 2048 }],
      })
    );
    expect(summary.lines.join('\n')).toContain('2.0 KB');
  });

  it('a non-dry-run or result-less run renders an honest unavailable summary (never an implicit apply)', () => {
    expect(summarizeDryRun(dryRun(undefined)).headline).toContain('unavailable');
    expect(summarizeDryRun(dryRun('garbage')).headline).toContain('unavailable');
    expect(summarizeDryRun(dryRun({ error: 'docker daemon unreachable' })).headline).toContain('docker daemon unreachable');
  });
});
