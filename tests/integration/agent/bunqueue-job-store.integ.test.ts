// integration/agent/bunqueue-job-store.integ.test.ts — STRICT TDD RED phase (task 4.9)
//
// Real bunqueue (embedded) + real bun:sqlite persistence across a genuine
// process restart. Vitest workers run on Node where bun:sqlite is
// unresolvable, so the fixture runs under `bun` as a child process: setup →
// exit → assert IS the restart.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'store-worker.ts');

function runWorker(command: string, dbPath: string, arg?: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('bun', [FIXTURE, command, dbPath, ...(arg ? [arg] : [])], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    return { stdout, status: 0 };
  } catch (error) {
    const err = error as { stdout?: string; status?: number; message?: string };
    return { stdout: err.stdout ?? err.message ?? '', status: err.status ?? 1 };
  }
}

describe('BunqueueJobStore — restart persistence (real bunqueue embedded)', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('4.9: survives an agent restart — jobs, runs, and schedule state persist; NO bunqueue scheduler is armed (9.8)', () => {
    dir = mkdtempSync(join(tmpdir(), 'tako-store-'));
    const dbPath = join(dir, 'agent.db');

    const setup = runWorker('setup', dbPath);
    expect(setup.status).toBe(0);
    expect(setup.stdout).toContain('SETUP_OK');

    // Simulated restart: `assert` runs in a brand-new process against the same dataPath.
    const assertRun = runWorker('assert', dbPath);
    expect(assertRun.status).toBe(0);
    const payload = JSON.parse(assertRun.stdout.trim()) as {
      jobs: string[];
      pruneJob: { scopes: string[] };
      run: { seq: number; status: string; result: unknown; jobId: string } | undefined;
      schedule: { lastScheduledFire?: string; lastFireEnqueued: boolean } | undefined;
      lastSeq: number;
      schedulers: number;
    };

    expect(payload.jobs).toEqual(['homepage-pull', 'nas-prune']);
    expect(payload.pruneJob.scopes).toEqual(['dangling-images', 'build-cache']);
    expect(payload.run).toMatchObject({
      seq: 1,
      status: 'succeeded',
      result: { deleted: 3 },
      jobId: 'nas-prune',
    });
    expect(payload.schedule).toEqual({ lastScheduledFire: '2026-01-01T04:00:00.000Z', lastFireEnqueued: false });
    expect(payload.lastSeq).toBe(1);
    // FIRING AUTHORITY (task 9.8, maintainer decision 2026-09-18): the store
    // must NOT arm bunqueue schedulers — RunSchedulerLoop's watermark tick is
    // the sole firing authority; armed schedulers would spawn unconsumed dead
    // queue rows (~8.8k/yr per hourly job).
    expect(payload.schedulers).toBe(0);
  });

  it('9.8 RED: the open() sweep disarms a scheduler persisted by a pre-9.8 store', () => {
    dir = mkdtempSync(join(tmpdir(), 'tako-store-'));
    const dbPath = join(dir, 'agent.db');

    expect(runWorker('setup', dbPath).status).toBe(0);
    // Simulate an OLD store's legacy mirror: arm a scheduler directly.
    expect(runWorker('seed-scheduler', dbPath, 'nas-prune').status).toBe(0);
    // Sanity: the seeded scheduler exists before the new store opens.
    const seeded = runWorker('count-schedulers', dbPath);
    expect(seeded.status).toBe(0);
    expect(JSON.parse(seeded.stdout.trim())).toMatchObject({ schedulers: 1 });

    // Re-opening the store MUST sweep the stale scheduler away.
    const assertRun = runWorker('assert', dbPath);
    expect(assertRun.status).toBe(0);
    const payload = JSON.parse(assertRun.stdout.trim()) as { schedulers: number };
    expect(payload.schedulers).toBe(0);
  });

  it('RED: rejects corrupted persisted job definitions instead of serving or executing them', () => {
    dir = mkdtempSync(join(tmpdir(), 'tako-store-'));
    const dbPath = join(dir, 'agent.db');

    expect(runWorker('setup', dbPath).status).toBe(0);
    expect(runWorker('tamper', dbPath, 'nas-prune').status).toBe(0);

    const assertRun = runWorker('assert', dbPath);
    expect(assertRun.status).toBe(0);
    const payload = JSON.parse(assertRun.stdout.trim()) as { jobs: string[]; pruneJob: unknown };
    // The tampered definition is rejected by the domain guard on load —
    // never served, never executed; the valid job survives.
    expect(payload.jobs).toEqual(['homepage-pull']);
    expect(payload.pruneJob).toBeUndefined();
  });

  it('RED: agent_meta keys persist across a restart (linger flag, installed version/at)', () => {
    dir = mkdtempSync(join(tmpdir(), 'tako-meta-'));
    const dbPath = join(dir, 'agent.db');

    expect(runWorker('meta-setup', dbPath).status).toBe(0);
    const assertRun = runWorker('meta-assert', dbPath);
    expect(assertRun.status).toBe(0);
    const payload = JSON.parse(assertRun.stdout.trim()) as {
      lingerByTako: boolean | undefined;
      installedVersion: string | undefined;
      installedAt: string | undefined;
      roundtrip: boolean;
    };
    expect(payload.lingerByTako).toBe(true);
    expect(payload.installedVersion).toBe('0.1.2');
    expect(payload.installedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(payload.roundtrip).toBe(true);
  });
});
