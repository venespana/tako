// RunPrune.test.ts — prune use case: one validator for both modes, shared report shape (tasks 5.4, 5.7)
//
// Spec `agent-jobs#Dry-Run-First-Destructive-Jobs`: dry-run produces a
// report of what would be removed and mutates nothing; apply is gated on
// the SAME scope validator (ADR-0008). Forbidden scopes never reach the
// port in either mode.
import { describe, expect, it } from 'vitest';

import { PruneValidationError, RunPrune } from './RunPrune.js';
import type { DockerPruner } from './RunPrune.js';
import { PruneScopeValidationError } from '../domain/prune-policy.js';
import type { PruneItem, PruneScope, PruneScopeReport } from '../domain/types.js';

/** Recording fake: proves which method ran (plan vs apply) and with what. */
class RecordingPruner implements DockerPruner {
  readonly planCalls: PruneScope[][] = [];
  readonly applyCalls: PruneScope[][] = [];

  constructor(
    private readonly planResult: PruneScopeReport[] = [],
    private readonly applyResult: PruneScopeReport[] = []
  ) {}

  async plan(scopes: readonly PruneScope[]): Promise<PruneScopeReport[]> {
    this.planCalls.push([...scopes]);
    return this.planResult;
  }

  async apply(scopes: readonly PruneScope[]): Promise<PruneScopeReport[]> {
    this.applyCalls.push([...scopes]);
    return this.applyResult;
  }
}

const DANGLING_PLAN: PruneScopeReport = {
  scope: 'dangling-images',
  items: [{ id: 'sha256:abc123', description: '<none>:<none>' }],
  count: 1,
};

describe('RunPrune — dry-run plan (report only, nothing removed)', () => {
  it('returns the would-remove plan via the port and never calls apply', async () => {
    const pruner = new RecordingPruner([DANGLING_PLAN]);
    const report = await new RunPrune(pruner).execute({ scopes: ['dangling-images'], mode: 'dry-run' });

    expect(report).toEqual({ mode: 'dry-run', scopes: ['dangling-images'], entries: [DANGLING_PLAN] });
    expect(pruner.planCalls).toEqual([['dangling-images']]);
    expect(pruner.applyCalls).toHaveLength(0);
  });

  it('passes multi-scope plans through preserving order', async () => {
    const entries: PruneScopeReport[] = [
      { scope: 'stopped-containers', items: [{ id: 'c1', description: 'plex (pleximage)' }], count: 1 },
      { scope: 'build-cache', items: [], count: 0, spaceReclaimedBytes: 0 },
    ];
    const pruner = new RecordingPruner(entries);
    const report = await new RunPrune(pruner).execute({
      scopes: ['stopped-containers', 'build-cache'],
      mode: 'dry-run',
    });

    expect(report.scopes).toEqual(['stopped-containers', 'build-cache']);
    expect(report.entries).toEqual(entries);
    expect(pruner.planCalls).toEqual([['stopped-containers', 'build-cache']]);
  });
});

describe('RunPrune — apply through the same validator', () => {
  it('executes the apply path and reports what was removed', async () => {
    const removed: PruneScopeReport = {
      scope: 'dangling-images',
      items: [{ id: 'sha256:abc123', description: 'deleted' }],
      count: 1,
      spaceReclaimedBytes: 4096,
    };
    const pruner = new RecordingPruner([], [removed]);
    const report = await new RunPrune(pruner).execute({ scopes: ['dangling-images'], mode: 'apply' });

    expect(report).toEqual({ mode: 'apply', scopes: ['dangling-images'], entries: [removed] });
    expect(pruner.applyCalls).toEqual([['dangling-images']]);
    expect(pruner.planCalls).toHaveLength(0);
  });
});

describe('RunPrune — forbidden scopes rejected before any port call (ADR-0008)', () => {
  const forbidden: readonly unknown[] = ['volumes', 'all-images', 'dangling_images', 'Stopped-Containers', 42];

  it.each(forbidden)('rejects scope set containing %j in BOTH modes', async scope => {
    await (['dry-run', 'apply'] as const).reduce(async (chain, mode) => {
      await chain;
      const pruner = new RecordingPruner();
      await expect(new RunPrune(pruner).execute({ scopes: ['dangling-images', scope], mode })).rejects.toThrow(
        PruneScopeValidationError
      );
      await expect(new RunPrune(pruner).execute({ scopes: [scope], mode })).rejects.toThrow(PruneScopeValidationError);
      expect(pruner.planCalls).toHaveLength(0);
      expect(pruner.applyCalls).toHaveLength(0);
    }, Promise.resolve());
  });

  it.each([[[]], ['dangling-images', null], 'dangling-images', null, undefined])(
    'rejects malformed scope input %j',
    async scopes => {
      const pruner = new RecordingPruner();
      await expect(new RunPrune(pruner).execute({ scopes, mode: 'dry-run' })).rejects.toThrow(
        PruneScopeValidationError
      );
      expect(pruner.planCalls).toHaveLength(0);
    }
  );

  it.each(['mutate', 'DRY-RUN', 42, null, undefined])('rejects mode %j', async mode => {
    const pruner = new RecordingPruner();
    await expect(new RunPrune(pruner).execute({ scopes: ['dangling-images'], mode })).rejects.toThrow(
      PruneValidationError
    );
    expect(pruner.planCalls).toHaveLength(0);
    expect(pruner.applyCalls).toHaveLength(0);
  });

  it('collapses duplicate scopes before the port sees them', async () => {
    const pruner = new RecordingPruner();
    const report = await new RunPrune(pruner).execute({
      scopes: ['dangling-images', 'dangling-images', 'build-cache'],
      mode: 'apply',
    });

    expect(pruner.applyCalls).toEqual([['dangling-images', 'build-cache']]);
    expect(report.scopes).toEqual(['dangling-images', 'build-cache']);
  });
});

describe('RunPrune — shared report shape between modes', () => {
  it('entries keep the PruneScopeReport contract in both modes', async () => {
    const items: readonly PruneItem[] = [{ id: 'cache-id-1', description: 'buildkit content' }];
    const entry: PruneScopeReport = { scope: 'build-cache', items: [...items], count: 1, spaceReclaimedBytes: 2048 };
    const dryRun = await new RunPrune(new RecordingPruner([entry])).execute({
      scopes: ['build-cache'],
      mode: 'dry-run',
    });
    const applied = await new RunPrune(new RecordingPruner([], [entry])).execute({
      scopes: ['build-cache'],
      mode: 'apply',
    });

    expect(dryRun.entries).toEqual(applied.entries);
    expect(dryRun.mode).toBe('dry-run');
    expect(applied.mode).toBe('apply');
  });
});
