// services/docker.test.ts — service-level delegation tests: the complete
// domain functions wire the RIGHT adapter behind the scenes, keep each
// adapter LAZY (a lifecycle run never loads dockerode, and vice versa), and
// pass the validated request through to the use cases untouched.
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { runPrune, runStackLifecycle, getStackStatus, getContainers } from './docker.js';
import { GetContainers } from '../domains/docker/application/GetContainers.js';
import { GetStackStatus } from '../domains/docker/application/GetStackStatus.js';
import { ComposeCliAdapter } from '../domains/docker/infrastructure/ComposeCliAdapter.js';
import { DockerodePruneAdapter } from '../domains/docker/infrastructure/DockerodePruneAdapter.js';
import { RemoteComposeCliAdapter } from '../domains/docker/infrastructure/RemoteComposeCliAdapter.js';
import { RemoteDockerPsAdapter } from '../domains/docker/infrastructure/RemoteDockerPsAdapter.js';
import { SshConnectionManager } from '../domains/remotes/infrastructure/SshConnectionManager.js';
import { SshRemoteCommandRunner } from '../domains/remotes/infrastructure/SshRemoteCommandRunner.js';

const executeLifecycle = vi.hoisted(() => vi.fn());
const executePrune = vi.hoisted(() => vi.fn());
const executeGetStackStatus = vi.hoisted(() => vi.fn());
const executeGetContainers = vi.hoisted(() => vi.fn());
const resolveRemoteAuthMock = vi.hoisted(() => vi.fn());
const managerEnd = vi.hoisted(() => vi.fn(async () => {}));

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
vi.mock('../domains/docker/application/GetStackStatus.js', () => ({
  GetStackStatus: vi.fn(function () {
    return { execute: executeGetStackStatus };
  }),
}));
vi.mock('../domains/docker/application/GetContainers.js', () => ({
  GetContainers: vi.fn(function () {
    return { execute: executeGetContainers };
  }),
}));
vi.mock('../domains/docker/infrastructure/RemoteDockerPsAdapter.js', () => ({
  RemoteDockerPsAdapter: vi.fn(),
}));
vi.mock('../domains/docker/infrastructure/RemoteComposeCliAdapter.js', () => ({
  RemoteComposeCliAdapter: vi.fn(),
}));
vi.mock('./remotes.js', () => ({
  resolveRemoteAuth: resolveRemoteAuthMock,
}));
vi.mock('../domains/remotes/infrastructure/SshConnectionManager.js', () => ({
  SshConnectionManager: vi.fn(function () {
    return { end: managerEnd };
  }),
}));
vi.mock('../domains/remotes/infrastructure/SshRemoteCommandRunner.js', () => ({
  SshRemoteCommandRunner: vi.fn(),
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

describe('services/docker — getStackStatus', () => {
  const RESOLVED = {
    kind: 'resolved',
    remote: { host: '10.0.0.5', port: 22, username: 'ops' },
    auth: { type: 'password', password: 'secret' },
  } as const;

  it('wires manager → runner → adapter → use case, returns the outcome, ends the connection', async () => {
    const outcome = { kind: 'ok', entries: [] };
    resolveRemoteAuthMock.mockResolvedValue(RESOLVED);
    executeGetStackStatus.mockResolvedValue(outcome);

    await expect(getStackStatus({ remote: 'nas' })).resolves.toBe(outcome);

    expect(resolveRemoteAuthMock).toHaveBeenCalledWith('nas', undefined);
    expect(SshRemoteCommandRunner).toHaveBeenCalledTimes(1);
    expect(RemoteComposeCliAdapter).toHaveBeenCalledTimes(1);
    expect(managerEnd).toHaveBeenCalledTimes(1);
  });

  it('maps unknown-remote without opening any connection', async () => {
    resolveRemoteAuthMock.mockResolvedValue({ kind: 'unknown-remote', reason: 'unknown remote "nope"' });

    await expect(getStackStatus({ remote: 'nope' })).resolves.toEqual({
      kind: 'unknown-remote',
      reason: 'unknown remote "nope"',
    });

    expect(SshConnectionManager).not.toHaveBeenCalled();
    expect(managerEnd).not.toHaveBeenCalled();
  });

  it('maps an auth refusal without opening any connection', async () => {
    resolveRemoteAuthMock.mockResolvedValue({ kind: 'refusal', reason: 'no session password' });

    await expect(getStackStatus({ remote: 'nas' })).resolves.toEqual({
      kind: 'refusal',
      reason: 'no session password',
    });

    expect(SshConnectionManager).not.toHaveBeenCalled();
  });

  it('ends the connection even when the use case throws unexpectedly', async () => {
    resolveRemoteAuthMock.mockResolvedValue(RESOLVED);
    executeGetStackStatus.mockRejectedValue(new Error('transport exploded'));

    await expect(getStackStatus({ remote: 'nas', sessionPassword: 'pw' })).rejects.toThrow('transport exploded');

    expect(resolveRemoteAuthMock).toHaveBeenCalledWith('nas', 'pw');
    expect(managerEnd).toHaveBeenCalledTimes(1);
  });

  it('laziness: an unknown remote never constructs the docker use case', async () => {
    resolveRemoteAuthMock.mockResolvedValue({ kind: 'unknown-remote', reason: 'x' });

    await getStackStatus({ remote: 'nope' });

    expect(GetStackStatus).not.toHaveBeenCalled();
  });
});

describe('services/docker — getContainers', () => {
  const RESOLVED = {
    kind: 'resolved',
    remote: { host: '10.0.0.5', port: 22, username: 'ops' },
    auth: { type: 'password', password: 'secret' },
  } as const;

  it('wires manager → runner → adapter → use case, returns the outcome, ends the connection', async () => {
    const outcome = { kind: 'ok', containers: [] };
    resolveRemoteAuthMock.mockResolvedValue(RESOLVED);
    executeGetContainers.mockResolvedValue(outcome);

    await expect(getContainers({ remote: 'nas' })).resolves.toBe(outcome);

    expect(resolveRemoteAuthMock).toHaveBeenCalledWith('nas', undefined);
    expect(SshRemoteCommandRunner).toHaveBeenCalledTimes(1);
    expect(RemoteDockerPsAdapter).toHaveBeenCalledTimes(1);
    expect(managerEnd).toHaveBeenCalledTimes(1);
  });

  it('maps unknown-remote without opening any connection', async () => {
    resolveRemoteAuthMock.mockResolvedValue({ kind: 'unknown-remote', reason: 'unknown remote "nope"' });

    await expect(getContainers({ remote: 'nope' })).resolves.toEqual({
      kind: 'unknown-remote',
      reason: 'unknown remote "nope"',
    });

    expect(SshConnectionManager).not.toHaveBeenCalled();
    expect(managerEnd).not.toHaveBeenCalled();
  });

  it('maps an auth refusal without opening any connection', async () => {
    resolveRemoteAuthMock.mockResolvedValue({ kind: 'refusal', reason: 'no session password' });

    await expect(getContainers({ remote: 'nas' })).resolves.toEqual({
      kind: 'refusal',
      reason: 'no session password',
    });

    expect(SshConnectionManager).not.toHaveBeenCalled();
  });

  it('ends the connection even when the use case throws unexpectedly', async () => {
    resolveRemoteAuthMock.mockResolvedValue(RESOLVED);
    executeGetContainers.mockRejectedValue(new Error('transport exploded'));

    await expect(getContainers({ remote: 'nas', sessionPassword: 'pw' })).rejects.toThrow('transport exploded');

    expect(resolveRemoteAuthMock).toHaveBeenCalledWith('nas', 'pw');
    expect(managerEnd).toHaveBeenCalledTimes(1);
  });

  it('laziness: an unknown remote never constructs the docker use case', async () => {
    resolveRemoteAuthMock.mockResolvedValue({ kind: 'unknown-remote', reason: 'x' });

    await getContainers({ remote: 'nope' });

    expect(GetContainers).not.toHaveBeenCalled();
  });
});
