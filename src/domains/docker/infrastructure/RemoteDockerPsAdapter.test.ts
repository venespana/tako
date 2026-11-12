// RemoteDockerPsAdapter.test.ts — DockerContainersReader over
// RemoteCommandRunner (iteration 2 of tui-remote-home-screen)
//
// The adapter is a thin translation layer: ONE fixed remote command, and a
// field-for-field mapping of RemoteCommandResult into the docker domain's
// CommandExecution. The runner is injected — nothing here opens SSH.
import { describe, expect, it, vi } from 'vitest';

import { DOCKER_PS_COMMAND, RemoteDockerPsAdapter } from './RemoteDockerPsAdapter.js';
import type { RemoteCommandResult, RemoteCommandRunner } from '../../remotes/application/RemoteCommandRunner.js';
import { GetContainers } from '../application/GetContainers.js';

function fakeRunner(result: RemoteCommandResult): { runner: RemoteCommandRunner; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async () => result);

  return { run, runner: { run } as RemoteCommandRunner };
}

const FIXTURE = `{"ID":"abc123","Names":"web-1","State":"running","Labels":"com.docker.compose.project=media"}\n`;

describe('RemoteDockerPsAdapter — command discipline', () => {
  it('runs the exact fixed docker ps command, once per read', async () => {
    const { run, runner } = fakeRunner({ exitCode: 0, stdout: FIXTURE, stderr: '' });

    await new RemoteDockerPsAdapter(runner).read();

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(DOCKER_PS_COMMAND);
    expect(DOCKER_PS_COMMAND).toBe("docker ps -a --format '{{json .}}'");
  });

  it('maps the result fields into CommandExecution untouched', async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: FIXTURE, stderr: 'warn-line\n' });
    const execution = await new RemoteDockerPsAdapter(runner).read();

    expect(execution).toEqual({ exitCode: 0, stdout: FIXTURE, stderr: 'warn-line\n' });
  });
});

describe('RemoteDockerPsAdapter — composition with GetContainers', () => {
  it('yields parsed containers through the real use case', async () => {
    const { runner } = fakeRunner({ exitCode: 0, stdout: FIXTURE, stderr: '' });
    const result = await new GetContainers(new RemoteDockerPsAdapter(runner)).execute();

    expect(result).toEqual({
      kind: 'ok',
      containers: [{ id: 'abc123', name: 'web-1', state: 'running', composeProject: 'media', health: null }],
    });
  });

  it('turns a missing docker binary (exit 127) into a refusal', async () => {
    const { runner } = fakeRunner({ exitCode: 127, stdout: '', stderr: 'sh: docker: not found\n' });
    const result = await new GetContainers(new RemoteDockerPsAdapter(runner)).execute();

    expect(result).toEqual({ kind: 'refusal', reason: 'sh: docker: not found' });
  });
});
