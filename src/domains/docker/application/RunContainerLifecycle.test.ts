// RunContainerLifecycle.test.ts — use case outcome mapping (iteration 3 of
// tui-remote-home-screen)
//
// Input validation happens BEFORE the port: an out-of-union op or an unsafe
// container name is a refusal object and the runner is never called. Remote
// failures are DATA: non-zero exits and signal kills map to refusals
// carrying the remote stderr (GetContainers.refusalFrom discipline).
import { describe, expect, it, vi } from 'vitest';

import { RunContainerLifecycle } from './RunContainerLifecycle.js';
import type { ContainerLifecycleRunner } from './RunContainerLifecycle.js';
import type { ContainerLifecycleOp } from '../domain/container-lifecycle.js';
import type { CommandExecution } from '../domain/types.js';

function fakeRunner(execution: CommandExecution): { runner: ContainerLifecycleRunner; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async () => execution);

  return { run, runner: { run } as ContainerLifecycleRunner };
}

describe('RunContainerLifecycle — ok outcomes', () => {
  it('runs the port once with the validated request and returns ok', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: 'web-1\n', stderr: '' });
    const result = await new RunContainerLifecycle(runner).execute({ op: 'start', container: 'web-1' });

    expect(result).toEqual({ kind: 'ok' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ op: 'start', container: 'web-1' });
  });

  it('restart succeeds the same way', async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: '', stderr: '' });
    const result = await new RunContainerLifecycle(runner).execute({ op: 'restart', container: 'grafana' });

    expect(result).toEqual({ kind: 'ok' });
  });
});

describe('RunContainerLifecycle — input gate runs BEFORE the port', () => {
  it('refuses an op outside the closed union and never calls the port', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: '', stderr: '' });
    const result = await new RunContainerLifecycle(runner).execute({
      op: 'stop' as ContainerLifecycleOp,
      container: 'web-1',
    });

    expect(result).toEqual({ kind: 'refusal', reason: 'unknown container lifecycle op "stop"' });
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses an unsafe container name and never calls the port', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: '', stderr: '' });
    const result = await new RunContainerLifecycle(runner).execute({ op: 'restart', container: 'web 1; rm -rf /' });

    expect(result).toEqual({ kind: 'refusal', reason: 'invalid container name "web 1; rm -rf /"' });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('RunContainerLifecycle — refusals are data, never throws', () => {
  it('refuses a non-zero exit carrying the remote stderr', async () => {
    const execution = { exitCode: 1, stdout: '', stderr: 'Error: no such container: web-1\n' };
    const { runner } = fakeRunner(execution);
    const result = await new RunContainerLifecycle(runner).execute({ op: 'restart', container: 'web-1' });

    expect(result).toEqual({ kind: 'refusal', reason: 'Error: no such container: web-1' });
  });

  it('refuses a non-zero exit with empty stderr naming the op and exit code', async () => {
    const { runner } = fakeRunner({ exitCode: 127, stdout: '', stderr: '' });
    const result = await new RunContainerLifecycle(runner).execute({ op: 'start', container: 'web-1' });

    expect(result).toEqual({ kind: 'refusal', reason: 'docker start exited with code 127' });
  });

  it('refuses a signal-killed command (exit code null)', async () => {
    const { runner } = fakeRunner({ exitCode: null, stdout: '', stderr: '' });
    const result = await new RunContainerLifecycle(runner).execute({ op: 'restart', container: 'web-1' });

    expect(result).toEqual({ kind: 'refusal', reason: 'docker restart was terminated by a signal' });
  });

  it('prefers the remote stderr over the generic exit-code reason', async () => {
    const execution = { exitCode: 125, stdout: 'partial', stderr: 'permission denied on docker.sock' };
    const { runner } = fakeRunner(execution);
    const result = await new RunContainerLifecycle(runner).execute({ op: 'start', container: 'web-1' });

    expect(result).toEqual({ kind: 'refusal', reason: 'permission denied on docker.sock' });
  });
});
