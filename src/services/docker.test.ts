// services/docker.test.ts — service-level delegation tests: the complete
// domain functions wire the RIGHT adapter behind the scenes, keep each
// adapter LAZY (a lifecycle run never loads dockerode, and vice versa), and
// pass the validated request through to the use cases untouched.
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { runPrune, runStackLifecycle } from './docker.js';
import { ComposeCliAdapter } from '../domains/docker/infrastructure/ComposeCliAdapter.js';
import { DockerodePruneAdapter } from '../domains/docker/infrastructure/DockerodePruneAdapter.js';

const executeLifecycle = vi.hoisted(() => vi.fn());
const executePrune = vi.hoisted(() => vi.fn());

vi.mock('../domains/docker/application/RunStackLifecycle.js', () => ({
  RunStackLifecycle: vi.fn(function () {
    return { execute: executeLifecycle };
  }),
}));
vi.mock('../domains/docker/application/RunPrune.js', () => ({
  RunPrune: vi.fn(function () {
    return { execute: executePrune };
  }),
}));
vi.mock('../domains/docker/infrastructure/ComposeCliAdapter.js', () => ({
  ComposeCliAdapter: vi.fn(),
}));
vi.mock('../domains/docker/infrastructure/DockerodePruneAdapter.js', () => ({
  DockerodePruneAdapter: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('services/docker — complete domain functions', () => {
  it('runStackLifecycle wires the compose CLI adapter and returns the report', async () => {
    const report = { status: 'succeeded' };
    executeLifecycle.mockResolvedValue(report);

    await expect(runStackLifecycle({ op: 'pull', stackDir: '/srv/stacks/caddy', mode: 'apply' })).resolves.toBe(report);

    expect(executeLifecycle).toHaveBeenCalledWith({ op: 'pull', stackDir: '/srv/stacks/caddy', mode: 'apply' });
    expect(ComposeCliAdapter).toHaveBeenCalledTimes(1);
  });

  it('runPrune wires the dockerode adapter and returns the report', async () => {
    const report = { entries: [] };
    executePrune.mockResolvedValue(report);

    await expect(runPrune({ scopes: ['dangling-images'], mode: 'dry-run' })).resolves.toBe(report);

    expect(executePrune).toHaveBeenCalledWith({ scopes: ['dangling-images'], mode: 'dry-run' });
    expect(DockerodePruneAdapter).toHaveBeenCalledTimes(1);
  });

  it('adapter loading stays lazy and isolated: a lifecycle run never constructs the prune adapter', async () => {
    executeLifecycle.mockResolvedValue({ status: 'planned' });

    await runStackLifecycle({ op: 'up', stackDir: '/srv/stacks/caddy', mode: 'dry-run' });

    expect(DockerodePruneAdapter).not.toHaveBeenCalled();
  });
});
