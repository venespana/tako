// RemoteDockerLifecycleAdapter.test.ts — ContainerLifecycleRunner port over
// RemoteCommandRunner (iteration 3 of tui-remote-home-screen)
//
// The adapter is a thin translation layer: ONE command per op, built only
// from a closed-union op and a docker-safe name, and a field-for-field
// mapping of RemoteCommandResult into the docker domain's CommandExecution.
// The runner is injected — nothing here opens SSH. The name re-check is
// defensive (the use case gates first): an unsafe name never reaches a
// command string and never reaches the runner.
import { describe, expect, it, vi } from 'vitest';

import { dockerLifecycleCommand, RemoteDockerLifecycleAdapter } from './RemoteDockerLifecycleAdapter.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import { RunContainerLifecycle } from '../application/RunContainerLifecycle.js';

function fakeRunner(result: RemoteCommandResult): { runner: RemoteCommandRunner; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async () => result);

  return { run, runner: { run } as RemoteCommandRunner };
}

describe('RemoteDockerLifecycleAdapter — command discipline', () => {
  it('runs the exact `docker start <name>` command, once per request', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: 'web-1\n', stderr: '' });

    await new RemoteDockerLifecycleAdapter(runner).run({ op: 'start', container: 'web-1' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('docker start web-1');
    expect(dockerLifecycleCommand('start', 'web-1')).toBe('docker start web-1');
  });

  it('runs the exact `docker restart <name>` command for the restart op', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: 'grafana\n', stderr: '' });

    await new RemoteDockerLifecycleAdapter(runner).run({ op: 'restart', container: 'grafana' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('docker restart grafana');
    expect(dockerLifecycleCommand('restart', 'grafana')).toBe('docker restart grafana');
  });

  it('runs the exact `docker stop <name>` command for the stop op (T2-container-stop)', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: 'grafana\n', stderr: '' });

    await new RemoteDockerLifecycleAdapter(runner).run({ op: 'stop', container: 'grafana' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('docker stop grafana');
    expect(dockerLifecycleCommand('stop', 'grafana')).toBe('docker stop grafana');
  });

  it('maps the result fields into CommandExecution untouched', async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: 'web-1\n', stderr: 'warn-line\n' });
    const execution = await new RemoteDockerLifecycleAdapter(runner).run({ op: 'start', container: 'web-1' });

    expect(execution).toEqual({ exitCode: 0, stdout: 'web-1\n', stderr: 'warn-line\n' });
  });

  it('refuses an unsafe name WITHOUT calling the runner (no shell string built)', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: '', stderr: '' });

    const execution = await new RemoteDockerLifecycleAdapter(runner).run({ op: 'start', container: 'web 1; reboot' });

    expect(run).not.toHaveBeenCalled();
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr).toContain('invalid container name "web 1; reboot"');
  });
});

describe('RemoteDockerLifecycleAdapter — composition with RunContainerLifecycle', () => {
  it('yields ok through the real use case on a clean start', async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: 'web-1\n', stderr: '' });
    const result = await new RunContainerLifecycle(new RemoteDockerLifecycleAdapter(runner)).execute({
      op: 'start',
      container: 'web-1',
    });

    expect(result).toEqual({ kind: 'ok' });
  });

  it('turns a missing docker binary (exit 127) into a refusal', async () => {
    const { runner } = fakeRunner({ exitCode: 127, stdout: '', stderr: 'sh: docker: not found\n' });
    const result = await new RunContainerLifecycle(new RemoteDockerLifecycleAdapter(runner)).execute({
      op: 'restart',
      container: 'web-1',
    });

    expect(result).toEqual({ kind: 'refusal', reason: 'sh: docker: not found' });
  });
});
